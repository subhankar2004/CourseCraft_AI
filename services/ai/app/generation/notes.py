"""Lesson study notes by map-reduce (SPEC §7.1 step 5).

    transcript ─► parts (≈ NOTES_MAP_TOKENS each, whole caption segments)
               ─► MAP: each part → partial notes        (parallel, LLM_CONCURRENCY)
               ─► COLLAPSE: merge partials while they exceed NOTES_REDUCE_TOKENS (long lectures)
               ─► REDUCE: one Markdown document with a fixed structure
               ─► PARSE: Markdown → LessonNotes (Pydantic)

Two reliability rules, both enforced in code rather than trusted to the model:

1. **Anchors are grounded.** The map prompt sees the transcript with `[m:ss]` markers taken from
   real caption boundaries. Every anchor the model writes is normalised to `[▶ m:ss]` and snapped
   to the nearest real marker within ANCHOR_TOLERANCE_SEC, or removed. A note can never point
   outside the part it came from, or to a moment that doesn't exist.
2. **Structure is parsed, not requested as JSON.** The reduce step writes Markdown in a fixed
   layout (title, summary, key concepts, anchored sections, recap) that is parsed into
   LessonNotes. Long Markdown inside JSON is fragile with small local models. Reading time is
   computed, not asked for. A malformed document is retried like a failed call.
"""

import logging
import math
import re
from bisect import bisect_left
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import Runnable, RunnableLambda
from langchain_core.runnables.retry import ExponentialJitterParams
from pydantic import BaseModel, Field

from app.generation.prompts import Prompt, load_prompt
from app.generation.providers import PROVIDER_ERRORS
from app.generation.usage import UsageTotals
from app.processing.chunking import TimedText, count_tokens

logger = logging.getLogger("app.generation.notes")

#: An anchor may be snapped to a real marker at most this far away; further means invented.
ANCHOR_TOLERANCE_SEC = 30.0
#: Transcript lines get a time marker when at least this much time passed since the last one.
MARKER_EVERY_SEC = 15.0
#: Silent reading of dense study material; below the ~238 wpm adult average for non-fiction.
READING_WPM = 200
ATTEMPTS = 3


class NotesFormatError(ValueError):
    """The model's output doesn't follow the required structure (retried)."""


class NotesGenerationError(RuntimeError):
    """Notes could not be produced after all attempts (the model's output stayed unusable)."""


class LlmUnavailableError(RuntimeError):
    """The chat model could not be reached after all attempts (retry the job later)."""


class LessonNotes(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(min_length=1)
    key_concepts: list[str] = Field(min_length=1, max_length=12)
    #: The lesson document without its `#` title line, with canonical `[▶ m:ss]` anchors.
    notes_markdown: str = Field(min_length=1)
    reading_time_min: int = Field(ge=1)
    #: Anchor times (seconds) used in the notes, in order of appearance.
    anchors: list[float]
    #: Provenance: `name@version` of every prompt used (AGENTS.md).
    prompt_ids: list[str]
    model: str


# ─── Timestamps ─────────────────────────────────────────────────────────────


def format_timestamp(seconds: float) -> str:
    """YouTube style: 4:05, 1:02:03."""
    total = int(seconds)
    hours, rest = divmod(total, 3600)
    minutes, secs = divmod(rest, 60)
    return f"{hours}:{minutes:02d}:{secs:02d}" if hours else f"{minutes}:{secs:02d}"


def parse_timestamp(text: str) -> float:
    seconds = 0
    for part in text.split(":"):
        seconds = seconds * 60 + int(part)
    return float(seconds)


def anchor(seconds: float) -> str:
    return f"[▶ {format_timestamp(seconds)}]"


# Anchors as models actually write them: [▶ 4:05], [4:05], (▶ 4:05), ▶ 4:05, [► 04:05].
_ANCHOR = re.compile(
    r"(?P<lead>[ \t]?)(?:"
    r"[\[(]\s*(?:[▶►]\s*)?(?P<a>\d{1,2}(?::\d{2}){1,2})\s*[\])]"
    r"|[▶►]\s*(?P<b>\d{1,2}(?::\d{2}){1,2}))"
)
_FENCE = re.compile(r"(```.*?```)", re.DOTALL)


# Small models wrap lists in ```markdown fences although the prompts forbid it (observed with
# llama3.1:8b); in study notes such a block is never code, so it is unwrapped.
_PROSE_FENCE = re.compile(
    r"^```(?:markdown|md|text|plaintext)?[ \t]*\n(.*?)\n```[ \t]*$", re.M | re.S
)


def unwrap_prose_fences(markdown: str) -> str:
    def unwrap(match: re.Match[str]) -> str:
        body = match.group(1)
        lines = [line for line in body.splitlines() if line.strip()]
        is_list = bool(lines) and all(re.match(r"\s*(?:[-*+]|\d+[.)])\s", line) for line in lines)
        return body if is_list else match.group(0)

    return _PROSE_FENCE.sub(unwrap, markdown)


def ground_anchors(markdown: str, markers: Sequence[float]) -> tuple[str, list[float]]:
    """Normalises every anchor and snaps it to the nearest marker, or removes it.

    Code blocks are left untouched. Returns the new text and the anchors kept, in order.
    """
    ordered = sorted(markers)
    kept: list[float] = []

    def nearest(seconds: float) -> float | None:
        i = bisect_left(ordered, seconds)
        candidates = ordered[max(i - 1, 0) : i + 1]
        if not candidates:
            return None
        best = min(candidates, key=lambda m: abs(m - seconds))
        return best if abs(best - seconds) <= ANCHOR_TOLERANCE_SEC else None

    def replace(match: re.Match[str]) -> str:
        raw = match.group("a") or match.group("b")
        try:
            snapped = nearest(parse_timestamp(raw))
        except ValueError:  # pragma: no cover - the regex only matches digits
            snapped = None
        if snapped is None:
            return ""  # with its leading space
        kept.append(snapped)
        return match.group("lead") + anchor(snapped)

    parts = _FENCE.split(markdown)
    for i in range(0, len(parts), 2):  # even indexes are outside code fences
        parts[i] = _ANCHOR.sub(replace, parts[i])
        parts[i] = re.sub(r"[ \t]+\n", "\n", parts[i])  # spaces left by removed anchors
    return "".join(parts), kept


# ─── Transcript parts ───────────────────────────────────────────────────────


@dataclass(frozen=True)
class Part:
    start_sec: float
    end_sec: float
    text: str  # with [m:ss] markers
    markers: list[float]


def transcript_parts(segments: Sequence[TimedText], target_tokens: int) -> list[Part]:
    """Groups ordered segments into map-sized parts (each segment in exactly one part), with
    `[m:ss]` markers at real segment starts. Sizes are approximate (summed per-segment counts):
    the map window is a budget, not a hard limit like RAG chunks."""
    groups: list[list[TimedText]] = [[]]
    size = 0
    for segment in segments:
        tokens = count_tokens(segment.text) + 1
        if groups[-1] and size + tokens > target_tokens:
            groups.append([])
            size = 0
        groups[-1].append(segment)
        size += tokens

    parts: list[Part] = []
    for group in groups:
        lines: list[str] = []
        markers: list[float] = []
        for segment in group:
            if not markers or segment.start - markers[-1] >= MARKER_EVERY_SEC:
                markers.append(segment.start)
                lines.append(f"\n[{format_timestamp(segment.start)}] {segment.text}")
            else:
                lines.append(f" {segment.text}")
        end = max(s.start + s.duration for s in group)
        parts.append(Part(group[0].start, end, "".join(lines).strip(), markers))
    return parts


# ─── Parsing the final document ─────────────────────────────────────────────

_REQUIRED = ("summary", "key concepts", "recap")
_WRAPPING_FENCE = re.compile(r"\A```(?:markdown|md)?\s*\n(.*)\n```\s*\Z", re.DOTALL)
# "- **Concept**: definition", "- **Concept:** definition", "- Concept: definition",
# "- Concept — definition". A hyphen inside a term (B-tree) is not a separator.
_CONCEPT = re.compile(
    r"^\s*[-*]\s+(?:\*\*(?P<bold>[^*]+?)\*\*|(?P<plain>[^:*]+?)(?=\s*:|\s+[\u2014\u2013-]\s))"
)


def _strip_wrapping(text: str) -> str:
    text = text.strip()
    if match := _WRAPPING_FENCE.match(text):
        text = match.group(1).strip()
    # Drop any preamble ("Here are your notes:") before the title.
    title_at = re.search(r"^# ", text, re.MULTILINE)
    if title_at is None:
        raise NotesFormatError("no '# Title' line")
    return text[title_at.start() :]


def _sections(body: str) -> list[tuple[str, str]]:
    """(heading, content) for each `## ` section, ignoring `##` inside code blocks."""
    sections: list[tuple[str, str]] = []
    heading: str | None = None
    lines: list[str] = []
    in_code = False
    for line in body.splitlines():
        if line.lstrip().startswith("```"):
            in_code = not in_code
        if not in_code and line.startswith("## "):
            if heading is not None:
                sections.append((heading, "\n".join(lines).strip()))
            heading, lines = line[3:].strip(), []
        elif heading is not None:
            lines.append(line)
    if heading is not None:
        sections.append((heading, "\n".join(lines).strip()))
    return sections


def _plain_heading(heading: str) -> str:
    return _ANCHOR.sub("", heading).strip().strip("*").strip().rstrip(":").lower()


def parse_lesson_document(
    text: str, markers: Sequence[float], *, prompt_ids: list[str], model: str
) -> LessonNotes:
    """The reduce output → LessonNotes. Raises NotesFormatError when the structure is wrong."""
    document = _strip_wrapping(text)
    first_line, _, body = document.partition("\n")
    title = _ANCHOR.sub("", first_line[2:]).strip().strip("*").strip()
    if not title:
        raise NotesFormatError("empty title")

    body, kept = ground_anchors(unwrap_prose_fences(body.strip()), markers)
    sections = _sections(body)
    by_name = {_plain_heading(h): content for h, content in sections}
    if missing := [name for name in _REQUIRED if name not in by_name]:
        raise NotesFormatError(f"missing sections: {missing}")
    topics = [h for h, _ in sections if _plain_heading(h) not in _REQUIRED]
    if not topics:
        raise NotesFormatError("no topic sections")
    if not kept:
        raise NotesFormatError("no valid timestamp anchors")

    summary = " ".join(by_name["summary"].split())
    concepts = [
        (m.group("bold") or m.group("plain") or "").strip().rstrip(":").strip()
        for line in by_name["key concepts"].splitlines()
        if (m := _CONCEPT.match(line))
    ]
    concepts = [c for c in dict.fromkeys(concepts) if c][:12]
    if not summary:
        raise NotesFormatError("empty summary")
    if not concepts:
        raise NotesFormatError("no key concepts in '- **Concept**: definition' form")

    words = len(body.split())
    return LessonNotes(
        title=title[:200],
        summary=summary,
        key_concepts=concepts,
        notes_markdown=body.strip() + "\n",
        reading_time_min=max(1, math.ceil(words / READING_WPM)),
        anchors=kept,
        prompt_ids=prompt_ids,
        model=model,
    )


# ─── The generator ──────────────────────────────────────────────────────────


class NotesGenerator:
    def __init__(
        self,
        model: BaseChatModel,
        *,
        model_name: str,
        map_tokens: int = 2500,
        reduce_tokens: int = 5000,
        concurrency: int = 2,
        retry_wait: ExponentialJitterParams | None = None,
        usage: UsageTotals | None = None,
    ):
        self.model = model
        self.model_name = model_name
        self.map_tokens = map_tokens
        self.reduce_tokens = reduce_tokens
        self.concurrency = concurrency
        self.retry_wait = retry_wait
        #: Token totals of the model calls, when the model was created with the same totals.
        self.usage = usage or UsageTotals()
        self.map_prompt = load_prompt("lesson-notes-map")
        self.collapse_prompt = load_prompt("lesson-notes-collapse")
        self.reduce_prompt = load_prompt("lesson-notes-reduce")

    def _retrying(self, step: Runnable[Any, Any]) -> Runnable[Any, Any]:
        return step.with_retry(
            stop_after_attempt=ATTEMPTS,
            wait_exponential_jitter=True,
            exponential_jitter_params=self.retry_wait,
        )

    def _text_step(self, markers: Sequence[float]) -> Runnable[str, str]:
        """prompt text → model → grounded Markdown (non-empty)."""

        def ground(output: str) -> str:
            text, _ = ground_anchors(unwrap_prose_fences(output.strip()), markers)
            if len(text.split()) < 5:
                raise NotesFormatError("empty notes")
            return text

        return self._retrying(self.model | StrOutputParser() | RunnableLambda(ground))

    def generate(self, lesson_title: str, segments: Sequence[TimedText]) -> LessonNotes:
        ordered = sorted((s for s in segments if s.text.strip()), key=lambda s: s.start)
        if not ordered:
            raise NotesGenerationError("transcript has no text")
        parts = transcript_parts(ordered, self.map_tokens)
        markers = sorted({m for p in parts for m in p.markers})
        prompts_used: list[Prompt] = [self.map_prompt]

        try:
            partials = self._map(lesson_title, parts)
            partials, collapsed = self._collapse(lesson_title, partials, markers)
            if collapsed:
                prompts_used.append(self.collapse_prompt)
            prompts_used.append(self.reduce_prompt)
            prompt_ids = [p.id for p in prompts_used]
            reduce = self._retrying(
                self.model
                | StrOutputParser()
                | RunnableLambda(
                    lambda text: parse_lesson_document(
                        text, markers, prompt_ids=prompt_ids, model=self.model_name
                    )
                )
            )
            notes: LessonNotes = reduce.invoke(
                self.reduce_prompt.render(lesson_title=lesson_title, partial_notes=_join(partials))
            )
        except NotesFormatError as error:
            raise NotesGenerationError(
                f"notes failed after {ATTEMPTS} attempts: {error}"
            ) from error
        except PROVIDER_ERRORS as error:
            raise LlmUnavailableError(f"chat model unavailable: {error}") from error

        logger.info(
            "lesson notes generated",
            extra={
                "fields": {
                    "parts": len(parts),
                    "collapsed": collapsed,
                    "anchors": len(notes.anchors),
                    "words": len(notes.notes_markdown.split()),
                }
            },
        )
        return notes

    def _map(self, lesson_title: str, parts: list[Part]) -> list[str]:
        inputs = [
            self.map_prompt.render(
                lesson_title=lesson_title,
                part_start=format_timestamp(p.start_sec),
                part_end=format_timestamp(p.end_sec),
                transcript=p.text,
            )
            for p in parts
        ]
        # Each part may only anchor to its own markers.
        steps = [self._text_step(p.markers) for p in parts]
        runnable = RunnableLambda(lambda pair: pair[0].invoke(pair[1]))
        outputs: list[str] = runnable.batch(
            list(zip(steps, inputs, strict=True)), config={"max_concurrency": self.concurrency}
        )
        return outputs

    def _collapse(
        self, lesson_title: str, partials: list[str], markers: Sequence[float]
    ) -> tuple[list[str], bool]:
        """Merges neighbouring partials until all of them fit one reduce call."""
        collapsed = False
        for _ in range(4):  # each round roughly halves the text; 4 rounds is plenty
            if count_tokens(_join(partials)) <= self.reduce_tokens or len(partials) == 1:
                break
            groups = _group_by_tokens(partials, self.reduce_tokens)
            if len(groups) == len(partials):  # every partial alone is too big: can't merge
                break
            step = self._text_step(markers)
            partials = step.batch(
                [
                    self.collapse_prompt.render(lesson_title=lesson_title, partial_notes=_join(g))
                    for g in groups
                ],
                config={"max_concurrency": self.concurrency},
            )
            collapsed = True
        return partials, collapsed


def _join(partials: Sequence[str]) -> str:
    return "\n\n---\n\n".join(p.strip() for p in partials)


def _group_by_tokens(partials: Sequence[str], limit: int) -> list[list[str]]:
    groups: list[list[str]] = [[]]
    for partial in partials:
        if groups[-1] and count_tokens(_join([*groups[-1], partial])) > limit:
            groups.append([])
        groups[-1].append(partial)
    return groups
