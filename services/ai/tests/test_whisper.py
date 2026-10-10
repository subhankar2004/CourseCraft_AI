from pathlib import Path
from typing import Any

import pytest

from app.ingestion.transcripts import (
    NoTranscriptError,
    Transcript,
    TranscriptFetcher,
    TranscriptUnavailableError,
    VideoInaccessibleError,
)
from app.ingestion.whisper import (
    AudioDownloadError,
    WhisperResult,
    WhisperSegment,
    WhisperSkippedError,
    WhisperTranscriber,
)

VID = "AAAAAAAAAAA"


class FakeWhisper:
    def __init__(self, outcome: WhisperResult | Exception):
        self.outcome = outcome
        self.calls: list[str] = []

    def transcribe_video(self, video_id: str) -> WhisperResult:
        self.calls.append(video_id)
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


def whisper_result(*texts: str, language: str = "en") -> WhisperResult:
    segments = [WhisperSegment(t, float(i * 3), 3.0) for i, t in enumerate(texts)]
    return WhisperResult(language, 0.99, segments, audio_sec=60, elapsed_sec=2)


def captions(language: str, translated_from: str | None = None) -> Transcript:
    from app.ingestion.transcripts import Segment

    return Transcript("YT_AUTO", language, [Segment("caption text", 0, 2)], translated_from)


class StubCaptions(TranscriptFetcher):
    """TranscriptFetcher whose caption lookup is replaced by a canned outcome."""

    def __init__(self, outcome: Transcript | Exception, whisper: FakeWhisper | None):
        super().__init__(whisper=whisper)
        self.outcome = outcome

    def _captions(self, video_id: str) -> Transcript:
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


# ─── When Whisper runs ──────────────────────────────────────────────────────


def test_no_captions_uses_whisper() -> None:
    fake = FakeWhisper(whisper_result("Hello [Music] everyone", "  ", "Today: SQL"))
    result = StubCaptions(NoTranscriptError("no captions"), fake).fetch(VID)
    assert (result.source, result.fetched_with, result.language) == ("WHISPER", "whisper", "en")
    assert [s.text for s in result.segments] == ["Hello everyone", "Today: SQL"]  # cleaned
    assert fake.calls == [VID]


def test_inaccessible_video_never_reaches_whisper() -> None:
    fake = FakeWhisper(whisper_result("x"))
    with pytest.raises(VideoInaccessibleError):
        StubCaptions(VideoInaccessibleError("private"), fake).fetch(VID)
    assert fake.calls == []


@pytest.mark.parametrize(
    ("caption_language", "spoken", "translated_from", "uses_whisper"),
    [
        ("hi", "en", None, True),  # the real case from #18: English speech, "Hindi" captions
        ("en", "en-US", None, False),  # same base language
        ("en-GB", "en", None, False),
        ("en", None, None, False),  # spoken language unknown: trust the captions
        ("en", "hi", "hi", False),  # YouTube's own translation is intentional
    ],
)
def test_language_mismatch_triggers_whisper(
    caption_language: str, spoken: str | None, translated_from: str | None, uses_whisper: bool
) -> None:
    fake = FakeWhisper(whisper_result("spoken words"))
    result = StubCaptions(captions(caption_language, translated_from), fake).fetch(
        VID, spoken_language=spoken
    )
    assert (result.source == "WHISPER") is uses_whisper
    assert bool(fake.calls) is uses_whisper


@pytest.mark.parametrize(
    "failure", [WhisperSkippedError("too long"), AudioDownloadError("403"), NoTranscriptError("x")]
)
def test_mismatch_keeps_captions_when_whisper_cannot_run(failure: Exception) -> None:
    fake = FakeWhisper(failure)
    result = StubCaptions(captions("hi"), fake).fetch(VID, spoken_language="en")
    assert (result.source, result.language) == ("YT_AUTO", "hi")


# ─── Failure mapping ────────────────────────────────────────────────────────


def test_whisper_skipped_without_captions_is_definitive() -> None:
    fake = FakeWhisper(WhisperSkippedError("video is 200 min; Whisper is limited to 90 min"))
    with pytest.raises(NoTranscriptError, match="limited to 90 min"):
        StubCaptions(NoTranscriptError("no captions"), fake).fetch(VID)


def test_audio_download_failure_is_temporary() -> None:
    fake = FakeWhisper(AudioDownloadError("HTTP Error 403"))
    with pytest.raises(TranscriptUnavailableError, match="403"):
        StubCaptions(NoTranscriptError("no captions"), fake).fetch(VID)


def test_music_only_audio_reports_no_speech() -> None:
    fake = FakeWhisper(whisper_result("[Music]", "♪"))
    with pytest.raises(NoTranscriptError, match="no speech"):
        StubCaptions(NoTranscriptError("no captions"), fake).fetch(VID)


def test_whisper_disabled() -> None:
    with pytest.raises(NoTranscriptError, match="no captions"):
        StubCaptions(NoTranscriptError("no captions"), whisper=None).fetch(VID)


# ─── WhisperTranscriber safeguards ──────────────────────────────────────────


class FakeYoutubeDL:
    """Stands in for yt_dlp.YoutubeDL; records whether a download was attempted."""

    downloaded = False

    def __init__(self, options: dict[str, Any]):
        self.options = options

    def __enter__(self) -> "FakeYoutubeDL":
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def extract_info(self, url: str, download: bool) -> dict[str, Any]:
        return {"duration": FakeYoutubeDL.duration, "live_status": "not_live"}

    def process_ie_result(self, info: dict[str, Any], download: bool) -> None:
        FakeYoutubeDL.downloaded = True
        out = Path(self.options["outtmpl"].replace("%(id)s", VID).replace("%(ext)s", "m4a"))
        out.write_bytes(b"audio")

    duration = 0.0


@pytest.fixture
def fake_ytdlp(monkeypatch: pytest.MonkeyPatch) -> type[FakeYoutubeDL]:
    FakeYoutubeDL.downloaded = False
    monkeypatch.setattr("yt_dlp.YoutubeDL", FakeYoutubeDL)
    return FakeYoutubeDL


def test_long_videos_are_skipped_before_downloading(fake_ytdlp: type[FakeYoutubeDL]) -> None:
    fake_ytdlp.duration = 91 * 60
    with pytest.raises(WhisperSkippedError, match="91 min"):
        WhisperTranscriber("base", max_minutes=90).transcribe_video(VID)
    assert fake_ytdlp.downloaded is False


def test_audio_is_deleted_even_when_transcription_fails(
    fake_ytdlp: type[FakeYoutubeDL], monkeypatch: pytest.MonkeyPatch
) -> None:
    fake_ytdlp.duration = 60
    seen: list[Path] = []

    def explode(self: WhisperTranscriber, audio: Path) -> WhisperResult:
        seen.append(audio)
        assert audio.read_bytes() == b"audio"
        raise RuntimeError("model crashed")

    monkeypatch.setattr(WhisperTranscriber, "transcribe_file", explode)
    with pytest.raises(RuntimeError):
        WhisperTranscriber("base", max_minutes=90).transcribe_video(VID)
    assert seen and not seen[0].exists() and not seen[0].parent.exists()
