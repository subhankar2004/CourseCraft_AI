"""Live YouTube transcript checks (opt-in: `uv run pytest -m network`). No API keys needed.

Video ids were chosen on 2026-10-10 for the caption types they had then; YouTube can change them.
"""

from itertools import pairwise

import pytest

from app.ingestion.transcripts import NoTranscriptError, TranscriptFetcher

pytestmark = pytest.mark.network

MANUAL_EN = "HXV3zeQKqGY"  # freeCodeCamp SQL course (seed data): manual English captions
AUTO_EN = "kqtD5dpn9C8"  # only auto-generated English captions
NO_CAPTIONS = "LXb3EKWsInQ"  # transcripts disabled


def test_manual_english() -> None:
    result = TranscriptFetcher().fetch(MANUAL_EN)
    assert (result.source, result.language) == ("YT_MANUAL", "en")
    assert len(result.segments) > 1000
    assert "SQL" in " ".join(s.text for s in result.segments[:20])


def test_auto_english() -> None:
    result = TranscriptFetcher().fetch(AUTO_EN)
    assert result.source == "YT_AUTO"
    assert result.language.startswith("en")
    assert len(result.segments) > 100


def test_no_captions() -> None:
    with pytest.raises(NoTranscriptError):
        TranscriptFetcher().fetch(NO_CAPTIONS)


def test_ytdlp_fallback_parses_real_vtt() -> None:
    # Exercise the fallback directly so it's covered even when the primary source works.
    result = TranscriptFetcher()._from_ytdlp(AUTO_EN)
    assert result is not None and result.fetched_with == "yt-dlp"
    texts = [s.text for s in result.segments]
    assert len(texts) > 100
    assert all(a != b for a, b in pairwise(texts))  # no rolling repeats
