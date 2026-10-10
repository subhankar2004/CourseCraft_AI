"""Timestamp-aware chunking of transcripts (SPEC §7.1 step 3).

Transcript segments are packed in order into chunks of at most `target_tokens`, and each chunk
starts with the last ≤ `overlap_tokens` of the previous one so ideas that cross a boundary stay
retrievable. Chunks are built from whole segments, so their `start_sec`/`end_sec` are real
caption boundaries: citations and "jump to this moment" links (#39, #35) depend on that.

Sizes are measured EXACTLY on the joined text. BPE tokenisation is context-sensitive at word
boundaries ("normalization" and " normalization" tokenise differently), so summing per-segment
counts can overshoot; property tests found this, and also that LangChain's token splitter only
approximates its limit, so oversized segments are split here word by word under the same exact
check. Their time span is shared between the pieces in proportion to length.

Tokens are counted with tiktoken's `cl100k_base`, the tokenizer of OpenAI's text-embedding-3
models; for local models it is a close proxy.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from functools import cache

import tiktoken

ENCODING = "cl100k_base"


@dataclass(frozen=True)
class TimedText:
    """A transcript segment (from #18/#19)."""

    text: str
    start: float
    duration: float

    @property
    def end(self) -> float:
        return self.start + self.duration


@dataclass(frozen=True)
class Chunk:
    index: int
    text: str
    start_sec: float
    end_sec: float
    token_count: int
    #: Leading characters of `text` repeated from the previous chunk (0 for the first chunk).
    #: Lets retrieval drop duplicated text when neighbouring chunks are combined (#40).
    overlap_chars: int = 0


@cache
def _encoding() -> tiktoken.Encoding:
    return tiktoken.get_encoding(ENCODING)


def count_tokens(text: str) -> int:
    return len(_encoding().encode(text))


def _pack_words(text: str, target_tokens: int) -> list[str]:
    """Greedy word packing with exact token counts; a single over-long "word" is cut by tokens."""
    pieces: list[str] = []
    current: list[str] = []
    for word in text.split():
        if count_tokens(word) > target_tokens:  # pathological (e.g. a giant URL)
            if current:
                pieces.append(" ".join(current))
                current = []
            ids = _encoding().encode(word)
            pieces.extend(
                _encoding().decode(ids[i : i + target_tokens])
                for i in range(0, len(ids), target_tokens)
            )
            continue
        if current and count_tokens(" ".join([*current, word])) > target_tokens:
            pieces.append(" ".join(current))
            current = []
        current.append(word)
    if current:
        pieces.append(" ".join(current))
    return pieces


def _split_oversized(segment: TimedText, target_tokens: int) -> list[TimedText]:
    """Splits one long segment, sharing its time span in proportion to text length."""
    pieces = _pack_words(segment.text, target_tokens)
    total_chars = sum(len(p) for p in pieces) or 1
    out: list[TimedText] = []
    cursor = segment.start
    for piece in pieces:
        share = segment.duration * len(piece) / total_chars
        out.append(TimedText(piece, cursor, share))
        cursor += share
    return out


def _joined(units: list[TimedText]) -> str:
    return " ".join(u.text for u in units)


def chunk_transcript(
    segments: Iterable[TimedText],
    target_tokens: int = 800,
    overlap_tokens: int = 120,
) -> list[Chunk]:
    """Packs ordered segments into overlapping, timestamped chunks.

    Guarantees (checked by property tests):
    - every segment's text appears, in order, and no chunk exceeds `target_tokens`;
    - chunk start times never decrease, and each chunk ends after it starts;
    - the text a chunk repeats from its predecessor is at most `overlap_tokens`.
    """
    if target_tokens <= 0 or not 0 <= overlap_tokens < target_tokens:
        raise ValueError("need target_tokens > 0 and 0 <= overlap_tokens < target_tokens")

    units: list[TimedText] = []
    for segment in sorted(segments, key=lambda s: s.start):
        text = " ".join(segment.text.split())
        if not text:
            continue
        unit = TimedText(text, segment.start, max(segment.duration, 0.0))
        units.extend(
            _split_oversized(unit, target_tokens) if count_tokens(text) > target_tokens else [unit]
        )

    chunks: list[Chunk] = []
    first = 0
    repeated = 0  # units at the start of this window that the previous chunk already had
    while first < len(units):
        last = first
        while (
            last + 1 < len(units)
            and count_tokens(_joined(units[first : last + 2])) <= target_tokens
        ):
            last += 1
        window = units[first : last + 1]
        text = _joined(window)
        chunks.append(
            Chunk(
                index=len(chunks),
                text=text,
                start_sec=round(window[0].start, 3),
                end_sec=round(max(u.end for u in window), 3),
                token_count=count_tokens(text),
                overlap_chars=len(_joined(window[:repeated])),
            )
        )
        if last == len(units) - 1:
            break
        # The next chunk re-uses the longest tail worth ≤ overlap_tokens that still leaves room
        # for the next new segment (otherwise it would be a chunk of repeated text only; found
        # by a property test). It always advances.
        overlap_start = last + 1
        while (
            overlap_start - 1 > first
            and count_tokens(_joined(units[overlap_start - 1 : last + 1])) <= overlap_tokens
            and count_tokens(_joined(units[overlap_start - 1 : last + 2])) <= target_tokens
        ):
            overlap_start -= 1
        repeated = last + 1 - overlap_start
        first = overlap_start
    return chunks
