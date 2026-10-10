import random
from itertools import pairwise

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.processing.chunking import Chunk, TimedText, chunk_transcript, count_tokens

WORDS = (
    "database table row column key index query join select where insert update relation "
    "schema normalization transaction commit rollback constraint primary foreign view"
).split()


def one_hour_transcript(seed: int = 7) -> list[TimedText]:
    """A deterministic 1-hour lecture: 1,200 caption segments of 3 s with 6-14 words each."""
    rng = random.Random(seed)  # noqa: S311  (deterministic test data, not security)
    return [
        TimedText(" ".join(rng.choices(WORDS, k=rng.randint(6, 14))), start=i * 3.0, duration=3.0)
        for i in range(1200)
    ]


def segment_texts(segments: list[TimedText]) -> list[str]:
    return [" ".join(s.text.split()) for s in segments if s.text.strip()]


def assert_invariants(
    chunks: list[Chunk], segments: list[TimedText], target: int, overlap: int
) -> None:
    texts = segment_texts(segments)
    if not texts:
        assert chunks == []
        return
    assert [c.index for c in chunks] == list(range(len(chunks)))
    for chunk in chunks:
        assert chunk.token_count == count_tokens(chunk.text)
        assert chunk.token_count <= target
        assert chunk.end_sec >= chunk.start_sec
    # Start times never decrease and chunks don't go backwards in time.
    for a, b in pairwise(chunks):
        assert b.start_sec >= a.start_sec
        assert b.end_sec >= a.end_sec
    # No text lost, in order: every segment appears in some chunk, and the chunks' text with
    # the overlaps removed re-creates the transcript exactly.
    joined = " ".join(texts)
    assert chunks[0].overlap_chars == 0
    rebuilt = chunks[0].text
    for a, b in pairwise(chunks):
        tail = b.text[: b.overlap_chars]
        assert a.text.endswith(tail)  # the repeated text really is the previous chunk's end
        assert count_tokens(tail) <= overlap  # exact: the chunker measures joined text
        rest = b.text[b.overlap_chars :].lstrip(" ")
        assert rest  # every chunk adds new text
        rebuilt += " " + rest
    assert rebuilt == joined


# ─── The issue's acceptance case: a 1-hour transcript ───────────────────────


def test_one_hour_transcript_has_correct_timestamps() -> None:
    segments = one_hour_transcript()
    chunks = chunk_transcript(segments, target_tokens=800, overlap_tokens=120)
    assert_invariants(chunks, segments, 800, 120)
    assert chunks[0].start_sec == 0.0
    assert chunks[-1].end_sec == 3600.0  # the last segment ends at 1 h exactly
    # Every chunk boundary is a real segment boundary (multiples of 3 s here).
    assert all(c.start_sec % 3 == 0 and c.end_sec % 3 == 0 for c in chunks)
    # Roughly 1 h of ~10 words per 3 s with 800-token chunks and overlap: a sensible count.
    assert 15 <= len(chunks) <= 40
    assert all(c.token_count > 600 for c in chunks[:-1])  # chunks are well filled


# ─── Behaviour ──────────────────────────────────────────────────────────────


def test_short_transcript_is_one_chunk() -> None:
    segments = [TimedText("Hello and welcome.", 0, 2), TimedText("Today: SQL joins.", 2, 3)]
    chunks = chunk_transcript(segments)
    assert chunks == [
        Chunk(0, "Hello and welcome. Today: SQL joins.", 0.0, 5.0, chunks[0].token_count)
    ]


def test_empty_and_blank_input() -> None:
    assert chunk_transcript([]) == []
    assert chunk_transcript([TimedText("   ", 0, 1)]) == []


def test_unsorted_segments_are_ordered_by_time() -> None:
    chunks = chunk_transcript([TimedText("second", 5, 1), TimedText("first", 0, 1)])
    assert chunks[0].text == "first second"


def test_oversized_segment_is_split_with_proportional_times() -> None:
    long_text = " ".join(["normalization"] * 600)  # one segment, far above 100 tokens
    chunks = chunk_transcript(
        [TimedText(long_text, 100.0, 60.0)], target_tokens=100, overlap_tokens=10
    )
    assert len(chunks) > 1
    assert chunks[0].start_sec == 100.0
    assert chunks[-1].end_sec == pytest.approx(160.0, abs=0.01)
    assert all(c.token_count <= 100 for c in chunks)


def test_overlap_repeats_the_end_of_the_previous_chunk() -> None:
    segments = [TimedText(f"sentence number {i} about joins.", i * 2.0, 2.0) for i in range(60)]
    chunks = chunk_transcript(segments, target_tokens=60, overlap_tokens=15)
    assert len(chunks) > 3
    for a, b in pairwise(chunks):
        assert b.overlap_chars > 0 and a.text.endswith(b.text[: b.overlap_chars])


def test_overlap_never_crowds_out_new_text() -> None:
    # Minimal counterexample found by Hypothesis (thorough profile): carrying the 5-token
    # segment forward left no room for the 16-token one, producing a chunk of repeats only.
    segments = [
        TimedText("database", 0, 1),
        TimedText(" ".join(["database"] * 5), 1, 1),
        TimedText(" ".join(["database"] * 16), 2, 1),
    ]
    chunks = chunk_transcript(segments, target_tokens=20, overlap_tokens=10)
    assert all(len(c.text) > c.overlap_chars for c in chunks)
    assert [c.start_sec for c in chunks] == [0.0, 2.0]


@pytest.mark.parametrize(("target", "overlap"), [(0, 0), (100, 100), (100, -1)])
def test_rejects_invalid_sizes(target: int, overlap: int) -> None:
    with pytest.raises(ValueError):
        chunk_transcript([TimedText("x", 0, 1)], target_tokens=target, overlap_tokens=overlap)


# ─── Property-based tests (Hypothesis) ──────────────────────────────────────

segment_lists = st.lists(
    st.tuples(
        st.lists(st.sampled_from(WORDS), min_size=0, max_size=40),
        st.floats(min_value=0.1, max_value=30, allow_nan=False),
    ),
    max_size=120,
)


@given(raw=segment_lists, target=st.integers(20, 300), overlap_ratio=st.floats(0, 0.5))
def test_invariants_hold_for_any_transcript(
    raw: list[tuple[list[str], float]], target: int, overlap_ratio: float
) -> None:
    overlap = int(target * overlap_ratio)
    segments, clock = [], 0.0
    for words, duration in raw:
        segments.append(TimedText(" ".join(words), clock, duration))
        clock += duration
    assert_invariants(chunk_transcript(segments, target, overlap), segments, target, overlap)
