"""Answering a question from ONE course's transcripts (SPEC §7.2 steps 2-5, report Fig. 3).

1. Retrieve: embed the question and take the `top_k` most similar chunks of that course only.
2. Grounding gate: if the best similarity is below `min_score`, or the course has no chunks,
   refuse with a fixed message. The LLM is NOT called, so nothing can be made up.
3. Generate: the chunks that pass the gate are numbered [1]..[n] in the prompt; the system prompt
   allows only those as sources and asks for [n] citations.
4. Second gate: if the model finds the excerpts don't answer the question it replies with the
   NOT_IN_COURSE sentinel, which becomes the same refusal (`grounded=false`), never streamed.
5. Citations: the [n] markers in the answer, mapped back to their chunks (lesson + time range).

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
#: Earlier conversation sent to the model (#40 adds condensing follow-ups for retrieval).
MAX_HISTORY_TURNS = 6
MAX_HISTORY_CHARS = 1_500

Refusal = Literal["not_indexed", "low_score", "not_in_context"]
_CITATION = re.compile(r"\[(\d+(?:\s*,\s*\d+)*)\]")


@dataclass(frozen=True)
class Turn:
    role: Literal["user", "assistant"]
    content: str


@dataclass(frozen=True)
class Source:
    """A retrieved chunk as the model sees it: `n` is its citation number."""

    n: int
    hit: SearchHit


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
    bar as the best one become context, so weak matches can't dilute it."""
    hits = index.similarity_search(course_id, question, top_k)
    if not hits:
        return Retrieval([], None, "not_indexed")
    best = hits[0].score
    if best < min_score:
        return Retrieval([], best, "low_score")
    kept = [hit for hit in hits if hit.score >= min_score]
    return Retrieval([Source(n, hit) for n, hit in enumerate(kept, start=1)], best, None)


def format_context(sources: Sequence[Source]) -> str:
    return "\n\n".join(
        f"[{s.n}] Lesson: {s.hit.lesson_title} "
        f"({format_timestamp(s.hit.start_sec)}-{format_timestamp(s.hit.end_sec)})\n{s.hit.text}"
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


def cited_sources(answer: str, sources: Sequence[Source]) -> list[Source]:
    """Sources cited as [n] or [n, m] in the answer, in order of first citation. Numbers that
    weren't in the context are ignored (a model can invent them)."""
    by_n = {s.n: s for s in sources}
    seen: list[int] = []
    for group in _CITATION.findall(answer):
        for number in (int(part) for part in group.split(",")):
            if number in by_n and number not in seen:
                seen.append(number)
    return [by_n[n] for n in seen]


# ─── events ──────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class TokenEvent:
    text: str


@dataclass(frozen=True)
class DoneEvent:
    grounded: bool
    answer: str
    citations: list[Source]
    best_score: float | None
    refusal: Refusal | None
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

    def events(self) -> Iterator[Event]:
        started = time.perf_counter()
        if not self.retrieval.grounded:
            yield from self._refuse(self.retrieval.refusal)
            self._log(started, self.retrieval.refusal, 0)
            return
        messages = build_messages(self.question, self.retrieval.sources, self.history)
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
        answer = "".join(parts).strip()
        citations = cited_sources(answer, self.retrieval.sources)
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
            best_score=self.retrieval.best_score,
            refusal=refusal,
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
                    "durationMs": round((time.perf_counter() - started) * 1000, 1),
                }
            },
        )
