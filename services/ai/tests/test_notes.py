"""Lesson notes map-reduce with a scripted chat model (no LLM needed).

Snapshot files in tests/snapshots/ pin the rendered prompts and the final notes for a recorded
lecture, so any change to prompts or post-processing shows up as a reviewable diff. Update them
with `UPDATE_SNAPSHOTS=1 uv run pytest tests/test_notes.py`.
"""

import os
import re
from pathlib import Path

import pytest
from langchain_core.runnables.retry import ExponentialJitterParams

from app.generation.notes import (
    ANCHOR_TOLERANCE_SEC,
    LessonNotes,
    NotesFormatError,
    NotesGenerationError,
    NotesGenerator,
    format_timestamp,
    ground_anchors,
    parse_lesson_document,
    parse_timestamp,
    transcript_parts,
)
from app.processing.chunking import TimedText
from tests.fakes import ScriptedChatModel
from tests.fixture_data import FixtureName, load_transcript

SNAPSHOTS = Path(__file__).parent / "snapshots"
NO_WAIT = ExponentialJitterParams(max=0, jitter=0)  # `initial` is deprecated in tenacity


def assert_snapshot(name: str, text: str) -> None:
    path = SNAPSHOTS / name
    if os.getenv("UPDATE_SNAPSHOTS") == "1":
        path.parent.mkdir(exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return
    assert path.is_file(), f"missing snapshot {name}: run with UPDATE_SNAPSHOTS=1"
    assert text == path.read_text(encoding="utf-8"), f"{name} changed (UPDATE_SNAPSHOTS=1)"


def segments_of(name: FixtureName) -> list[TimedText]:
    return [TimedText(s.text, s.start, s.duration) for s in load_transcript(name).segments]


# ─── Scripted model: plausible map/collapse/reduce replies ─────────────────


def between(prompt: str, tag: str) -> str:
    match = re.search(rf"<{tag}>\n(.*)\n</{tag}>", prompt, re.DOTALL)
    assert match, f"no <{tag}> block"
    return match.group(1)


def map_reply(prompt: str) -> str:
    times = re.findall(r"^\[(\d+:\d{2})\]", between(prompt, "transcript"), re.MULTILINE)
    first, second = times[0], times[min(3, len(times) - 1)]
    # Anchor styles small models really produce, plus one invented time that must be dropped.
    return (
        f"### Topic from {first} [▶ {first}]\n- What a database stores and why.\n\n"
        f"### Topic from {second} [{second}]\n- How tables relate. (see also [▶ 59:59])\n"
    )


def collapse_reply(prompt: str) -> str:
    return "\n".join(
        line for line in between(prompt, "notes").splitlines() if line.startswith("### ")
    )


def reduce_reply(prompt: str) -> str:
    anchors = re.findall(r"\[▶ [\d:]+\]", between(prompt, "notes"))
    topics = "\n\n".join(
        f"## Topic {i + 1} {a}\nExplanation of part {i + 1}." for i, a in enumerate(anchors[:4])
    )
    return (
        "Here are your study notes:\n\n"
        "# What Is a Database?\n\n"
        "## Summary\nDatabases store information so it can be found and changed.\n"
        "They come in several types.\n\n"
        "## Key concepts\n"
        "- **Database**: an organised collection of information.\n"
        "- **Primary key:** a column that identifies a row.\n"
        "- B-tree: an index structure.\n"
        "- **Database**: duplicate, ignored.\n\n"
        f"{topics}\n\n"
        "```sql\n## not a heading inside code\nSELECT 1; -- [▶ 99:99] untouched\n```\n\n"
        "## Recap\n- Databases organise information.\n"
    )


def scripted(prompt: str) -> str:
    if "This is ONE PART" in prompt:
        return map_reply(prompt)
    if "Merge them into ONE" in prompt:
        return collapse_reply(prompt)
    return reduce_reply(prompt)


def generator(
    model: ScriptedChatModel,
    map_tokens: int = 2500,
    reduce_tokens: int = 5000,
    concurrency: int = 2,
) -> NotesGenerator:
    return NotesGenerator(
        model,
        model_name="scripted",
        map_tokens=map_tokens,
        reduce_tokens=reduce_tokens,
        concurrency=concurrency,
        retry_wait=NO_WAIT,
    )


# ─── Timestamps and anchors ─────────────────────────────────────────────────


@pytest.mark.parametrize(("seconds", "text"), [(0, "0:00"), (245.9, "4:05"), (3723, "1:02:03")])
def test_timestamps_round_trip(seconds: float, text: str) -> None:
    assert format_timestamp(seconds) == text
    assert parse_timestamp(text) == int(seconds)


def test_anchors_are_normalised_snapped_or_removed() -> None:
    markers = [0.0, 65.0, 130.0]
    text = "A [▶ 1:05] B [1:10] C (▶ 2:10) D ▶ 0:01 E [► 9:00] F\n"
    grounded, kept = ground_anchors(text, markers)
    assert grounded == "A [▶ 1:05] B [▶ 1:05] C [▶ 2:10] D [▶ 0:00] E F\n"
    assert kept == [65.0, 65.0, 130.0, 0.0]  # 9:00 is far from every marker: removed


def test_snapping_respects_the_tolerance() -> None:
    inside = format_timestamp(100 + ANCHOR_TOLERANCE_SEC)
    outside = format_timestamp(100 + ANCHOR_TOLERANCE_SEC + 1)
    assert ground_anchors(f"[{inside}]", [100.0])[1] == [100.0]
    assert ground_anchors(f"[{outside}]", [100.0])[1] == []


def test_code_blocks_are_not_touched() -> None:
    text = "See [1:00]\n```python\nprint('[1:00]')  # ▶ 1:00\n```\n"
    grounded, kept = ground_anchors(text, [60.0])
    assert grounded == "See [▶ 1:00]\n```python\nprint('[1:00]')  # ▶ 1:00\n```\n"
    assert kept == [60.0]


def test_list_only_fences_are_unwrapped_but_code_is_kept() -> None:
    from app.generation.notes import unwrap_prose_fences

    text = (
        "Examples:\n```markdown\n* MongoDB\n* Couchbase\n```\n"
        "```\n1. step one\n2. step two\n```\n"
        "```python\nitems = [1, 2]\n```\n"
        "```\nSELECT * FROM t;\n```\n"
    )
    assert unwrap_prose_fences(text) == (
        "Examples:\n* MongoDB\n* Couchbase\n1. step one\n2. step two\n"
        "```python\nitems = [1, 2]\n```\n```\nSELECT * FROM t;\n```\n"
    )


# ─── Transcript parts ───────────────────────────────────────────────────────


@pytest.mark.parametrize("name", ["manual", "auto", "whisper"])
def test_parts_cover_every_segment_once_with_real_markers(name: FixtureName) -> None:
    segments = [s for s in segments_of(name) if s.text]
    parts = transcript_parts(segments, target_tokens=500)
    joined = " ".join(" ".join(re.sub(r"\[\d+:\d{2}\] ", "", p.text).split()) for p in parts)
    assert joined == " ".join(" ".join(s.text.split()) for s in segments)
    starts = {s.start for s in segments}
    for part in parts:
        assert part.markers[0] == part.start_sec
        assert set(part.markers) <= starts  # markers are real caption boundaries
        assert all(b - a >= 15 for a, b in zip(part.markers, part.markers[1:], strict=False))
    assert parts[-1].end_sec == pytest.approx(max(s.start + s.duration for s in segments))


# ─── Parsing the final document ─────────────────────────────────────────────


def parse(text: str, markers: list[float] | None = None) -> LessonNotes:
    return parse_lesson_document(text, markers or [0.0, 60.0], prompt_ids=["p@1"], model="m")


GOOD = """```markdown
# Intro to SQL

## Summary
SQL queries data.

## Key concepts
- **Query**: a request for data.

## Selecting rows [▶ 1:00]
Use SELECT.

## Recap
- SELECT reads data.
```"""


def test_parses_a_wrapped_document() -> None:
    notes = parse(GOOD)
    assert (notes.title, notes.summary, notes.key_concepts) == (
        "Intro to SQL",
        "SQL queries data.",
        ["Query"],
    )
    assert notes.notes_markdown.startswith("## Summary")
    assert notes.anchors == [60.0]
    assert notes.reading_time_min == 1


@pytest.mark.parametrize(
    ("broken", "error"),
    [
        (GOOD.replace("# Intro to SQL", "Intro to SQL"), "Title"),
        (GOOD.replace("## Recap", "## Wrap-up"), "recap"),
        (GOOD.replace("[▶ 1:00]", "[▶ 30:00]"), "anchors"),  # invented: removed → none left
        (GOOD.replace("- **Query**: a request for data.", "Queries are requests."), "concepts"),
        (GOOD.replace("## Selecting rows [▶ 1:00]\nUse SELECT.\n", "[▶ 1:00]"), "topic"),
    ],
)
def test_rejects_documents_without_the_contract(broken: str, error: str) -> None:
    with pytest.raises(NotesFormatError, match=error):
        parse(broken)


# ─── The whole map-reduce ───────────────────────────────────────────────────


def test_whisper_lecture_snapshot() -> None:
    model = ScriptedChatModel(reply=scripted)
    notes = generator(model).generate("What is a database", segments_of("whisper"))

    assert len(model.prompts) == 2  # a 4-minute lecture: one map call + one reduce call
    assert notes.prompt_ids == ["lesson-notes-map@2", "lesson-notes-reduce@2"]
    assert notes.title == "What Is a Database?"
    assert notes.key_concepts == ["Database", "Primary key", "B-tree"]
    markers = {s.start for s in segments_of("whisper")}
    assert notes.anchors and set(notes.anchors) <= markers
    assert "59:59" not in notes.notes_markdown  # the invented anchor was dropped
    assert "[▶ 99:99]" in notes.notes_markdown  # code is never rewritten

    assert_snapshot("lesson-notes-map.whisper.txt", model.prompts[0])
    assert_snapshot("lesson-notes-reduce.whisper.txt", model.prompts[1])
    assert_snapshot("lesson-notes.whisper.md", notes.notes_markdown)


def test_map_calls_run_per_part_and_anchor_only_to_their_part() -> None:
    model = ScriptedChatModel(reply=scripted)
    segments = segments_of("manual")
    notes = generator(model, map_tokens=600, concurrency=4).generate("SQL", segments)
    parts = transcript_parts(segments, 600)
    map_prompts = [p for p in model.prompts if "This is ONE PART" in p]
    assert len(parts) > 1 and len(map_prompts) == len(parts)
    assert all(a in {m for p in parts for m in p.markers} for a in notes.anchors)


def test_long_lectures_are_collapsed_before_the_reduce() -> None:
    model = ScriptedChatModel(reply=scripted)
    notes = generator(model, map_tokens=500, reduce_tokens=100).generate(
        "Python", segments_of("auto")
    )
    assert "lesson-notes-collapse@1" in notes.prompt_ids
    assert any("Merge them into ONE" in p for p in model.prompts)


def test_malformed_output_is_retried() -> None:
    replies = iter(["Sorry, I can't.", "Still no.", None])

    def flaky(prompt: str) -> str:
        if "This is ONE PART" in prompt:
            return map_reply(prompt)
        reply = next(replies)
        return reply if reply is not None else reduce_reply(prompt)

    model = ScriptedChatModel(reply=flaky)
    notes = generator(model).generate("What is a database", segments_of("whisper"))
    assert notes.title == "What Is a Database?"
    assert len(model.prompts) == 4  # 1 map + 3 reduce attempts


def test_gives_up_after_three_attempts() -> None:
    model = ScriptedChatModel(
        reply=lambda p: map_reply(p) if "This is ONE PART" in p else "no structure"
    )
    with pytest.raises(NotesGenerationError, match="3 attempts"):
        generator(model).generate("What is a database", segments_of("whisper"))
    assert len(model.prompts) == 1 + 3


def test_empty_transcript_is_rejected() -> None:
    with pytest.raises(NotesGenerationError, match="no text"):
        generator(ScriptedChatModel(reply=scripted)).generate("x", [TimedText(" ", 0, 1)])
