"""Cognitive Load Index of generated study notes (SPEC §9, report Table 3).

How hard the notes are to read, as one number from 0 (light) to 100 (heavy), from three parts:

- **Readability**: Flesch-Kincaid grade level (textstat), the school grade a reader needs.
- **Sentence length**: average words per sentence (long sentences load working memory).
- **Concept density**: distinct key terms per 100 words: how many new elements a reader must
  hold at once (intrinsic load in cognitive load theory).

Each part is scaled to 0..1 between a "light" and a "heavy" bound (clamped), then the parts
are weighted and summed:

    CLI = 100 · (0.35·norm(FK grade) + 0.25·norm(avg sentence length) + 0.40·norm(density))

Weights: readability and sentence length overlap (the FK formula itself contains sentence
length), so together they get 0.60; density, the only part measuring how much is taught at
once, gets 0.40. Bounds and weights were set on the generated demo course's notes (#43,
docs/PROGRESS.md entry 43); notes above `CLI_MAX` (60) are simplified once.

Only the notes' prose is measured: code blocks, headings and timestamp anchors aren't sentences
a reader parses, and each list item or table row counts as its own sentence.
"""

import re
from collections.abc import Iterable
from dataclasses import dataclass

import textstat

#: (light, heavy) bounds of each part: values outside are clamped.
FK_GRADE_BOUNDS = (6.0, 16.0)  # middle school .. postgraduate
SENTENCE_LENGTH_BOUNDS = (10.0, 30.0)  # words per sentence
CONCEPT_DENSITY_BOUNDS = (2.0, 12.0)  # distinct key terms per 100 words
WEIGHTS = {"readability": 0.35, "sentence_length": 0.25, "concept_density": 0.40}

_FENCE = re.compile(r"^```.*?^```[ \t]*$", re.MULTILINE | re.DOTALL)
_ANCHOR = re.compile(r"\[▶ [\d:]+\]")
_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
_BOLD = re.compile(r"\*\*([^*\n]+)\*\*|__([^_\n]+)__")
_INLINE_CODE = re.compile(r"`([^`\n]+)`")
_EMPHASIS = re.compile(r"(\*\*|__|\*|_)")
_TABLE_RULE = re.compile(r"^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$")
_LIST_MARKER = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+")
_SENTENCE_END = re.compile(r"[.!?:;]$")


@dataclass(frozen=True)
class CognitiveLoad:
    flesch_kincaid: float
    avg_sentence_len: float
    concept_density: float
    #: 0 (light) .. 100 (heavy).
    index: float
    words: int


def _normalise(value: float, bounds: tuple[float, float]) -> float:
    light, heavy = bounds
    return min(max((value - light) / (heavy - light), 0.0), 1.0)


def _clean(line: str) -> str:
    line = _ANCHOR.sub("", line)
    line = _LINK.sub(r"\1", line)
    line = _INLINE_CODE.sub(r"\1", line)
    line = _EMPHASIS.sub("", line)
    return " ".join(line.split())


def prose(markdown: str) -> str:
    """The notes as plain sentences: no code, headings, anchors, links or emphasis. A paragraph
    wrapped over several lines stays one paragraph (Markdown soft breaks); each list item, table
    row and quoted line is its own unit, and every unit ends as a sentence."""
    text = _FENCE.sub("\n", markdown)
    units: list[str] = []
    paragraph: list[str] = []

    def close() -> None:
        if paragraph:
            units.append(" ".join(paragraph))
            paragraph.clear()

    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or _TABLE_RULE.match(line):
            close()
            continue
        if line.startswith(">") or _LIST_MARKER.match(line) or line.startswith("|"):
            close()
            line = _LIST_MARKER.sub("", line.lstrip(">").strip())
            if line.startswith("|"):
                cells = line.strip("|").split("|")
                line = ", ".join(cell.strip() for cell in cells if cell.strip())
            units.append(line)
        else:
            paragraph.append(line)
    close()

    sentences = [cleaned for unit in units if (cleaned := _clean(unit))]
    return " ".join(s if _SENTENCE_END.search(s) else f"{s}." for s in sentences)


def key_terms(markdown: str, key_concepts: Iterable[str] = ()) -> set[str]:
    """The distinct terms a reader must learn: the lesson's key concepts, bold terms and inline
    code (identifiers, syntax), compared case-insensitively."""
    terms = {c for c in key_concepts}
    text = _FENCE.sub(" ", markdown)
    terms.update(m.group(1) or m.group(2) for m in _BOLD.finditer(text))
    terms.update(m.group(1) for m in _INLINE_CODE.finditer(text))
    cleaned = {" ".join(t.strip().strip(":").split()).casefold() for t in terms}
    return {t for t in cleaned if t and len(t.split()) <= 6}


def cognitive_load(markdown: str, key_concepts: Iterable[str] = ()) -> CognitiveLoad:
    text = prose(markdown)
    words = textstat.lexicon_count(text) if text else 0
    if words == 0:
        return CognitiveLoad(0.0, 0.0, 0.0, 0.0, 0)
    sentences = max(textstat.sentence_count(text), 1)
    grade = float(textstat.flesch_kincaid_grade(text))
    sentence_len = words / sentences
    density = 100 * len(key_terms(markdown, key_concepts)) / words
    index = 100 * (
        WEIGHTS["readability"] * _normalise(grade, FK_GRADE_BOUNDS)
        + WEIGHTS["sentence_length"] * _normalise(sentence_len, SENTENCE_LENGTH_BOUNDS)
        + WEIGHTS["concept_density"] * _normalise(density, CONCEPT_DENSITY_BOUNDS)
    )
    return CognitiveLoad(
        flesch_kincaid=round(grade, 2),
        avg_sentence_len=round(sentence_len, 2),
        concept_density=round(density, 2),
        index=round(index, 1),
        words=words,
    )
