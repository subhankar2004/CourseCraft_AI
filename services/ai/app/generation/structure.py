"""Course structuring (SPEC §7.1 step 6): lesson titles and summaries → course outline.

The model returns JSON (provider JSON mode) that refers to lessons by NUMBER (1..N), never by the
API's ids, which small models tend to mangle. The outline is then validated and REPAIRED in code:

- unknown lesson numbers are dropped, and a lesson placed twice keeps its first place;
- a missing lesson is inserted right after the nearest earlier lesson that was placed;
- empty modules are removed, blank titles get a default, an unknown level becomes `None`.

Every repair is reported. Output that can't be parsed, or that needs repairs for more than
MAX_REPAIR_SHARE of the lessons, is retried (3 attempts with backoff). If all attempts fail, a
plain outline in the given order is returned with `fallback=True`, so one bad answer doesn't fail
a whole course job: the admin reviews every outline before publishing anyway (#31).
"""

import json
import logging
import math
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Literal

from langchain_core.language_models import BaseChatModel
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnableLambda
from langchain_core.runnables.retry import ExponentialJitterParams
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.generation.notes import ATTEMPTS, LlmUnavailableError
from app.generation.prompts import load_prompt
from app.generation.providers import PROVIDER_ERRORS
from app.generation.usage import UsageTotals

logger = logging.getLogger("app.generation.structure")

Level = Literal["Beginner", "Intermediate", "Advanced"]
LEVELS: tuple[Level, ...] = ("Beginner", "Intermediate", "Advanced")
#: More repairs than this share of the lessons means the model didn't follow the task: retry.
MAX_REPAIR_SHARE = 0.3
FALLBACK_MODULE_SIZE = 5
_SUMMARY_CHARS = 300


class StructureFormatError(ValueError):
    """The model's outline is unusable (retried)."""


@dataclass(frozen=True)
class LessonInput:
    ref: str
    title: str
    summary: str = ""
    key_concepts: Sequence[str] = field(default_factory=tuple)


class ModuleDraft(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str = ""
    summary: str = ""
    lessons: list[int] = Field(default_factory=list)


class OutlineDraft(BaseModel):
    """What the model returns (lenient: numbers as strings are accepted)."""

    model_config = ConfigDict(extra="ignore")
    title: str
    description: str = ""
    level: str | None = None
    modules: list[ModuleDraft]


class CourseModule(BaseModel):
    title: str
    summary: str
    lesson_refs: list[str]


class CourseOutline(BaseModel):
    title: str
    description: str
    level: Level | None
    modules: list[CourseModule]
    #: Human-readable list of the corrections made to the model's outline.
    repairs: list[str]
    #: True when the model failed and a plain outline in the given order was used.
    fallback: bool
    prompt_id: str
    model: str


# ─── Parsing and repair ─────────────────────────────────────────────────────


def parse_draft(text: str) -> OutlineDraft:
    """The first JSON object in the reply (tolerates code fences and stray text)."""
    start = text.find("{")
    if start < 0:
        raise StructureFormatError("no JSON object in the reply")
    try:
        data, _ = json.JSONDecoder().raw_decode(text[start:])
        return OutlineDraft.model_validate(data)
    except (json.JSONDecodeError, ValidationError) as error:
        raise StructureFormatError(f"invalid outline: {error}") from error


def _level(raw: str | None) -> Level | None:
    for level in LEVELS:
        if raw is not None and raw.strip().lower() == level.lower():
            return level
    return None


@dataclass
class _Module:
    title: str
    summary: str
    lessons: list[int]


@dataclass
class Repaired:
    modules: list[_Module]
    repairs: list[str]
    #: Lessons that were unknown, duplicated or missing (how far the model was off).
    misplaced: int


def repair_outline(draft: OutlineDraft, lesson_count: int) -> Repaired:
    """Places every lesson 1..N exactly once and reports each correction."""
    repairs: list[str] = []
    misplaced = 0
    placed: set[int] = set()
    modules: list[_Module] = []
    for number, module in enumerate(draft.modules, start=1):
        title = " ".join(module.title.split()) or f"Module {number}"
        if not module.title.strip():
            repairs.append(f"module {number} had no title")
        kept: list[int] = []
        for lesson in module.lessons:
            if not 1 <= lesson <= lesson_count:
                repairs.append(f"dropped unknown lesson {lesson} from '{title}'")
                misplaced += 1
            elif lesson in placed:
                repairs.append(f"lesson {lesson} was placed twice; kept its first place")
                misplaced += 1
            else:
                placed.add(lesson)
                kept.append(lesson)
        modules.append(_Module(title, " ".join(module.summary.split()), kept))

    for lesson in range(1, lesson_count + 1):
        if lesson in placed:
            continue
        misplaced += 1
        before = [p for p in placed if p < lesson]
        if before:
            anchor = max(before)
            target = next(m for m in modules if anchor in m.lessons)
            target.lessons.insert(target.lessons.index(anchor) + 1, lesson)
            repairs.append(f"lesson {lesson} was missing; placed after lesson {anchor}")
        else:
            first = next((m for m in modules if m.lessons), None)
            if first is None:
                if not modules:
                    raise StructureFormatError("the outline has no modules")
                first = modules[0]
            first.lessons.insert(0, lesson)
            repairs.append(f"lesson {lesson} was missing; placed first in '{first.title}'")
        placed.add(lesson)

    for kept_module in modules:
        if not kept_module.lessons:
            repairs.append(f"removed empty module '{kept_module.title}'")
    return Repaired([m for m in modules if m.lessons], repairs, misplaced)


# ─── The structurer ─────────────────────────────────────────────────────────


class CourseStructurer:
    def __init__(
        self,
        model: BaseChatModel,
        *,
        model_name: str,
        retry_wait: ExponentialJitterParams | None = None,
        usage: UsageTotals | None = None,
    ):
        self.model = model
        self.model_name = model_name
        self.retry_wait = retry_wait
        self.usage = usage or UsageTotals()
        self.prompt = load_prompt("course-structure")

    def structure(
        self, lessons: Sequence[LessonInput], *, domain: str, title_hint: str | None = None
    ) -> CourseOutline:
        if not lessons:
            raise ValueError("no lessons to structure")
        count = len(lessons)
        rendered = self.prompt.render(
            domain=domain, lesson_count=str(count), lessons=_lesson_list(lessons)
        )

        def accept(text: str) -> tuple[OutlineDraft, Repaired]:
            draft = parse_draft(text)
            if not draft.title.strip():
                raise StructureFormatError("empty course title")
            repaired = repair_outline(draft, count)
            if repaired.misplaced > max(1, math.floor(MAX_REPAIR_SHARE * count)):
                raise StructureFormatError(
                    f"{repaired.misplaced} of {count} lessons misplaced: {repaired.repairs}"
                )
            return draft, repaired

        step = (self.model | StrOutputParser() | RunnableLambda(accept)).with_retry(
            stop_after_attempt=ATTEMPTS,
            wait_exponential_jitter=True,
            exponential_jitter_params=self.retry_wait,
        )
        try:
            draft, repaired = step.invoke(rendered)
        except StructureFormatError as error:
            logger.warning("course outline unusable; using the fallback", exc_info=error)
            return self._fallback(lessons, domain, title_hint, str(error))
        except PROVIDER_ERRORS as error:
            raise LlmUnavailableError(f"chat model unavailable: {error}") from error

        modules, repairs = repaired.modules, repaired.repairs
        level = _level(draft.level)
        if level is None:
            repairs.append(f"unknown level {draft.level!r}; left empty")
        outline = CourseOutline(
            title=" ".join(draft.title.split()),
            description=" ".join(draft.description.split()),
            level=level,
            modules=[
                CourseModule(
                    title=m.title,
                    summary=m.summary,
                    lesson_refs=[lessons[i - 1].ref for i in m.lessons],
                )
                for m in modules
            ],
            repairs=repairs,
            fallback=False,
            prompt_id=self.prompt.id,
            model=self.model_name,
        )
        logger.info(
            "course outline",
            extra={
                "fields": {
                    "lessons": count,
                    "modules": len(outline.modules),
                    "repairs": len(repairs),
                }
            },
        )
        return outline

    def _fallback(
        self, lessons: Sequence[LessonInput], domain: str, title_hint: str | None, reason: str
    ) -> CourseOutline:
        groups = [
            lessons[i : i + FALLBACK_MODULE_SIZE]
            for i in range(0, len(lessons), FALLBACK_MODULE_SIZE)
        ]
        return CourseOutline(
            title=title_hint or f"{domain}: {lessons[0].title}",
            description="",
            level=None,
            modules=[
                CourseModule(
                    title=f"Part {n}: {group[0].title}",
                    summary="",
                    lesson_refs=[lesson.ref for lesson in group],
                )
                for n, group in enumerate(groups, start=1)
            ],
            repairs=[f"model output unusable after {ATTEMPTS} attempts ({reason})"],
            fallback=True,
            prompt_id=self.prompt.id,
            model=self.model_name,
        )


def _lesson_list(lessons: Sequence[LessonInput]) -> str:
    lines = []
    for number, lesson in enumerate(lessons, start=1):
        summary = " ".join(lesson.summary.split())
        if len(summary) > _SUMMARY_CHARS:
            summary = summary[: _SUMMARY_CHARS - 1].rsplit(" ", 1)[0] + "…"
        concepts = (
            f" (key concepts: {', '.join(lesson.key_concepts)})" if lesson.key_concepts else ""
        )
        lines.append(f"{number}. {lesson.title} — {summary}{concepts}")
    return "\n".join(lines)
