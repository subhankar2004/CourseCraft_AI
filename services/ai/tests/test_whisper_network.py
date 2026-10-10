"""Live Whisper check (opt-in: `uv run pytest -m network`): downloads ~1 MB of audio and the
`base` model (~145 MB, cached after the first run). Runs on CPU in about 10 s on Apple Silicon."""

import pytest

from app.ingestion.transcripts import TranscriptFetcher
from app.ingestion.whisper import WhisperTranscriber

pytestmark = pytest.mark.network

# "What is a database in under 4 minutes": speech, and no captions at all (checked 2026-10-10).
NO_CAPTIONS_WITH_SPEECH = "Tk1t3WKK-ZY"


def test_video_without_captions_is_transcribed_by_whisper() -> None:
    fetcher = TranscriptFetcher(whisper=WhisperTranscriber("base", max_minutes=10))
    result = fetcher.fetch(NO_CAPTIONS_WITH_SPEECH)
    assert (result.source, result.fetched_with, result.language) == ("WHISPER", "whisper", "en")
    assert len(result.segments) > 20
    assert "database" in " ".join(s.text for s in result.segments).lower()
