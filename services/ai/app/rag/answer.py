"""Answering a question from ONE course's transcripts (SPEC §7.2 steps 2-5, report Fig. 3).

0. Condense (#40): a follow-up ("explain that again with an example") is rewritten from the
   recent turns into a standalone question, so retrieval looks for the right topic.
1. Retrieve: embed the question and take the `top_k` most similar chunks of that course only.
2. Grounding gate: if the best similarity is below `min_score`, or the course has no chunks,
   refuse with a fixed message. The LLM is NOT called, so nothing can be made up.
3. Generate: the chunks that pass the gate are merged into passages (neighbouring, overlapping
   chunks of one lesson become one, #40) and numbered [1]..[n]; the system prompt allows only
   those as sources and asks for [n] citations.
4. Second gate: if the model finds the excerpts don't answer the question it replies with the
   NOT_IN_COURSE sentinel, which becomes the same refusal (`grounded=false`), never streamed.
5. Citations: the [n] markers in the answer, mapped back to their passages (lesson + time range);
   markers pointing nowhere are removed from the final answer.

`AnswerStream` yields typed events; the HTTP layer (app.api.rag) turns them into SSE.
"""

import logging
import re
import time
from collections.abc import Iterator, Sequence
from dataclasses import dataclass, field
from typing import Literal

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from app.generation.notes import format_timestamp
from app.generation.prompts import load_prompt
from app.generation.providers import PROVIDER_ERRORS
from app.generation.usage import UsageTotals
from app.processing.indexing import VectorIndex
from app.processing.vector_store import SearchHit

logger = logging.getLogger("app.rag")

#: Sent instead of an answer when the course doesn't cover the question (SPEC §7.2 step 3).
REFUSAL_MESSAGE = (
    "This isn't covered in this course's lessons, so I can't answer it from the course. "
    "Try rephrasing your question, or ask about a topic from one of the lessons."
)
#: What the system prompt tells the model to reply when the excerpts don't hold the answer.
NOT_IN_COURSE = "NOT_IN_COURSE"
#: Earlier conversation sent to the model, and used to condense follow-ups.
MAX_HISTORY_TURNS = 6
MAX_HISTORY_CHARS = 1_500
#: Per turn when condensing: enough to know the topic, without long answers drowning the question.
CONDENSE_TURN_CHARS = 600
MAX_STANDALONE_CHARS = 500
#: Chunks of one lesson closer than this (seconds) are one passage.
MERGE_GAP_SEC = 1.0

Refusal = Literal["not_indexed", "low_score", "not_in_context"]
#: Fenced and inline code: array literals like [1, 2] there are code, not citations.
_CODE = re.compile(r"(```[\s\S]*?(?:```|$)|`[^`\n]*`)")
#: [1], [1, 3], [1-3] (also with an en dash).
_CITATION = re.compile(r"\[(\d+(?:\s*[,\u2013-]\s*\d+)*)\]")


@dataclass(frozen=True)
class Turn:
    role: Literal["user", "assistant"]
    content: str


@dataclass(frozen=True)
class Passage:
    """One or more neighbouring chunks of a lesson, with their overlap removed."""

    lesson_id: str
    lesson_title: str
    youtube_id: str
    start_sec: float
    end_sec: float
    text: str
    chunk_ids: tuple[str, ...]
    #: The best similarity among its chunks.
    score: float


@dataclass(frozen=True)
class Source:
    """A passage as the model sees it: `n` is its citation number."""

    n: int
    passage: Passage


def overlap_length(left: str, right: str, minimum: int = 20) -> int:
    """Characters at the end of `left` that `right` starts with (the chunker repeats ~120 tokens
    between neighbours). Short coincidences under `minimum` characters don't count."""
    for size in range(min(len(left), len(right)), minimum - 1, -1):
        if left.endswith(right[:size]):
            return size
    return 0


def merge_passages(hits: Sequence[SearchHit]) -> list[Passage]:
    """Merges chunks of the same lesson whose time ranges overlap or touch, so the model doesn't
    read the shared text twice and one citation covers the whole span. Best passage first."""
    passages: list[Passage] = []
    by_lesson: dict[str, list[SearchHit]] = {}
    for hit in hits:
        by_lesson.setdefault(hit.lesson_id, []).append(hit)
    for lesson_hits in by_lesson.values():
        ordered = sorted(lesson_hits, key=lambda h: (h.start_sec, h.chunk_index))
        current = ordered[0]
        text, ids, score, end = current.text, [current.id], current.score, current.end_sec
        for hit in ordered[1:]:
            if hit.start_sec <= end + MERGE_GAP_SEC:
                text += hit.text[overlap_length(text, hit.text) :]
                ids.append(hit.id)
                score, end = max(score, hit.score), max(end, hit.end_sec)
                continue
            passages.append(_passage(current, text, ids, score, end))
            current, text, ids, score, end = hit, hit.text, [hit.id], hit.score, hit.end_sec
        passages.append(_passage(current, text, ids, score, end))
    return sorted(passages, key=lambda p: -p.score)


def _passage(first: SearchHit, text: str, ids: list[str], score: float, end: float) -> Passage:
    return Passage(
        lesson_id=first.lesson_id,
        lesson_title=first.lesson_title,
        youtube_id=first.youtube_id,
        start_sec=first.start_sec,
        end_sec=end,
        text=text,
        chunk_ids=tuple(ids),
        score=score,
    )


@dataclass(frozen=True)
class Retrieval:
    sources: list[Source]
    best_score: float | None
    refusal: Refusal | None

    @property
    def grounded(self) -> bool:
        return self.refusal is None


def retrieve(
    index: VectorIndex, course_id: str, question: str, *, top_k: int, min_score: float
) -> Retrieval:
    """Steps 1-2: course-scoped search and the grounding gate. Only chunks that pass the same
    bar as the best one become context, so weak matches can't dilute it; they are then merged
    into passages."""
    hits = index.similarity_search(course_id, question, top_k)
    if not hits:
        return Retrieval([], None, "not_indexed")
    best = hits[0].score
    if best < min_score:
        return Retrieval([], best, "low_score")
    kept = [hit for hit in hits if hit.score >= min_score]
    passages = merge_passages(kept)
    return Retrieval([Source(n, p) for n, p in enumerate(passages, start=1)], best, None)


def condense_question(model: BaseChatModel, question: str, history: Sequence[Turn]) -> str | None:
    """Step 0: the follow-up as a standalone question, or None without history (nothing to
    resolve) or when the model fails or returns nothing usable (the raw question is used)."""
    turns = history[-MAX_HISTORY_TURNS:]
    if not turns:
        return None
    conversation = "\n".join(
        f"{'Student' if t.role == 'user' else 'Assistant'}: {t.content[:CONDENSE_TURN_CHARS]}"
        for t in turns
    )
    prompt = load_prompt("rag-condense").render(conversation=conversation, question=question)
    try:
        reply = model.invoke([HumanMessage(prompt)]).content
    except PROVIDER_ERRORS as error:
        logger.warning("condensing the question failed", extra={"fields": {"error": str(error)}})
        return None
    return clean_standalone(reply if isinstance(reply, str) else "")


def clean_standalone(reply: str) -> str | None:
    """First non-empty line, without labels or quotes; None if nothing question-like is left."""
    for line in reply.splitlines():
        text = re.sub(r"^(standalone|rewritten)?\s*question\s*:\s*", "", line.strip(), flags=re.I)
        text = text.strip().strip("\"'\u201c\u201d").strip()
        if re.search(r"[A-Za-z]", text):
            return text[:MAX_STANDALONE_CHARS]
    return None


def format_context(sources: Sequence[Source]) -> str:
    return "\n\n".join(
        f"[{s.n}] Lesson: {s.passage.lesson_title} "
        f"({format_timestamp(s.passage.start_sec)}-{format_timestamp(s.passage.end_sec)})\n"
        f"{s.passage.text}"
        for s in sources
    )


def build_messages(
    question: str, sources: Sequence[Source], history: Sequence[Turn]
) -> list[BaseMessage]:
    """System rules, the last few turns (for references like "it"), then context + question."""
    messages: list[BaseMessage] = [SystemMessage(load_prompt("rag-answer").render())]
    for turn in history[-MAX_HISTORY_TURNS:]:
        content = turn.content[:MAX_HISTORY_CHARS]
        messages.append(HumanMessage(content) if turn.role == "user" else AIMessage(content))
    messages.append(
        HumanMessage(
            load_prompt("rag-question").render(context=format_context(sources), question=question)
        )
    )
    return messages


def _numbers(group: str) -> list[int]:
    """ "1, 3" -> [1, 3]; "1-3" -> [1, 2, 3] (ranges capped, so "[1-9999]" can't explode)."""
    numbers: list[int] = []
    for part in group.split(","):
        bounds = [int(b) for b in re.split(r"\s*[\u2013-]\s*", part.strip())]
        low, high = bounds[0], bounds[-1]
        numbers.extend(range(low, min(high, low + 20) + 1) if high >= low else [low])
    return numbers


def cited_sources(answer: str, sources: Sequence[Source]) -> list[Source]:
    """Sources cited as [n], [n, m] or [n-m] in the answer, in order of first citation. Numbers
    that weren't in the context are ignored (a model can invent them)."""
    by_n = {s.n: s for s in sources}
    seen: list[int] = []
    prose = "".join(_CODE.split(answer)[::2])
    for group in _CITATION.findall(prose):
        for number in _numbers(group):
            if number in by_n and number not in seen:
                seen.append(number)
    return [by_n[n] for n in seen]


def clean_citations(answer: str, sources: Sequence[Source]) -> str:
    """The answer with markers pointing to no source removed, and groups reduced to the valid
    numbers ("[2, 9]" -> "[2]"), so every marker the student sees can be resolved."""
    valid = {s.n for s in sources}

    def keep(match: re.Match[str]) -> str:
        numbers = [n for n in dict.fromkeys(_numbers(match.group(1))) if n in valid]
        return "".join(f"[{n}]" for n in numbers)

    parts = _CODE.split(answer)  # prose at even positions, code at odd ones
    for i in range(0, len(parts), 2):
        parts[i] = re.sub(r"[ \t]+([.,;:!?])", r"\1", _CITATION.sub(keep, parts[i]))
    return "".join(parts).strip()


# ─── events ──────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class TokenEvent:
    text: str


@dataclass(frozen=True)
class DoneEvent:
    grounded: bool
    answer: str
    citations: list[Source]
    #: Every passage the model was given (the citations are the ones it used).
    sources: list[Source]
    best_score: float | None
    refusal: Refusal | None
    standalone_question: str | None
    usage_calls: int
    input_tokens: int
    output_tokens: int


@dataclass(frozen=True)
class FailedEvent:
    message: str


Event = TokenEvent | DoneEvent | FailedEvent


@dataclass
class AnswerStream:
    """Steps 3-5 for one question, as a stream of events."""

    model: BaseChatModel
    usage: UsageTotals
    course_id: str
    question: str
    retrieval: Retrieval
    history: Sequence[Turn] = field(default_factory=list)
    #: The condensed follow-up (step 0) that retrieval used; None when the question was used as is.
    standalone_question: str | None = None

    def events(self) -> Iterator[Event]:
        started = time.perf_counter()
        if not self.retrieval.grounded:
            yield from self._refuse(self.retrieval.refusal)
            self._log(started, self.retrieval.refusal, 0)
            return
        # The standalone form names the topic; the history still sets the conversation's tone.
        asked = self.standalone_question or self.question
        messages = build_messages(asked, self.retrieval.sources, self.history)
        parts: list[str] = []
        try:
            for text in self._without_sentinel(self._sentinel_aware(self._tokens(messages))):
                if text is None:  # the model said the excerpts don't hold the answer
                    yield from self._refuse("not_in_context")
                    self._log(started, "not_in_context", 0)
                    return
                parts.append(text)
                yield TokenEvent(text)
        except PROVIDER_ERRORS as error:
            logger.warning(
                "rag answer failed",
                extra={"fields": {"courseId": self.course_id, "error": str(error)}},
            )
            yield FailedEvent("The language model is unavailable. Try again in a moment.")
            return
        raw = "".join(parts).strip()
        citations = cited_sources(raw, self.retrieval.sources)
        answer = clean_citations(raw, self.retrieval.sources)
        yield self._done(grounded=True, answer=answer, citations=citations, refusal=None)
        self._log(started, None, len(citations))

    def _tokens(self, messages: list[BaseMessage]) -> Iterator[str]:
        for chunk in self.model.stream(messages):
            if isinstance(chunk.content, str) and chunk.content:
                yield chunk.content

    @staticmethod
    def _sentinel_aware(tokens: Iterator[str]) -> Iterator[str | None]:
        """Holds the first characters back until it's clear whether the reply is the sentinel;
        yields None (and stops) if it is, or if the reply is empty; else passes it through."""
        held = ""
        decided = False
        for token in tokens:
            if decided:
                yield token
                continue
            held += token
            start = held.lstrip()
            if NOT_IN_COURSE.startswith(start):
                continue  # empty so far, or still a possible prefix of the sentinel
            if start.startswith(NOT_IN_COURSE):
                yield None
                return
            decided = True
            yield held
        if not decided:
            start = held.strip()
            yield held if start and not start.startswith(NOT_IN_COURSE) else None

    @staticmethod
    def _without_sentinel(parts: Iterator[str | None]) -> Iterator[str | None]:
        """Removes the sentinel when it appears AFTER an answer (seen with llama3.1:8b: a full
        answer, then NOT_IN_COURSE). Only characters that could still start the sentinel are held
        back, so the stream stays live."""
        pending = ""
        for part in parts:
            if part is None:
                yield None
                return
            pending = (pending + part).replace(NOT_IN_COURSE, "")
            hold = next(
                (
                    n
                    for n in range(min(len(pending), len(NOT_IN_COURSE) - 1), 0, -1)
                    if NOT_IN_COURSE.startswith(pending[-n:])
                ),
                0,
            )
            ready, pending = pending[: len(pending) - hold], pending[len(pending) - hold :]
            if ready:
                yield ready
        if pending:
            yield pending

    def _refuse(self, refusal: Refusal | None) -> Iterator[Event]:
        yield TokenEvent(REFUSAL_MESSAGE)
        yield self._done(grounded=False, answer=REFUSAL_MESSAGE, citations=[], refusal=refusal)

    def _done(
        self, *, grounded: bool, answer: str, citations: list[Source], refusal: Refusal | None
    ) -> DoneEvent:
        counts = self.usage.counts
        return DoneEvent(
            grounded=grounded,
            answer=answer,
            citations=citations,
            sources=self.retrieval.sources if grounded else [],
            best_score=self.retrieval.best_score,
            refusal=refusal,
            standalone_question=self.standalone_question,
            usage_calls=self.usage.calls,
            input_tokens=counts.input_tokens,
            output_tokens=counts.output_tokens,
        )

    def _log(self, started: float, refusal: Refusal | None, citations: int) -> None:
        # The question itself isn't logged (it is the student's text); its length is.
        logger.info(
            "rag answer",
            extra={
                "fields": {
                    "courseId": self.course_id,
                    "grounded": refusal is None,
                    "refusal": refusal,
                    "bestScore": self.retrieval.best_score,
                    "sources": len(self.retrieval.sources),
                    "citations": citations,
                    "questionChars": len(self.question),
                    "condensed": self.standalone_question is not None,
                    "durationMs": round((time.perf_counter() - started) * 1000, 1),
                }
            },
        )
