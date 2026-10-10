from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from youtube_transcript_api import (
    IpBlocked,
    NoTranscriptFound,
    NotTranslatable,
    RequestBlocked,
    TranscriptsDisabled,
    VideoUnavailable,
)

from app.api.ingest import get_transcript_fetcher
from app.config import Settings
from app.ingestion.transcripts import (
    NoTranscriptError,
    Segment,
    TranscriptFetcher,
    TranscriptUnavailableError,
    clean_text,
    parse_vtt,
)
from app.main import create_app
from tests.conftest import INTERNAL_KEY

FIXTURES = Path(__file__).parent / "fixtures"
VID = "AAAAAAAAAAA"


# ─── Cleaning and VTT parsing ───────────────────────────────────────────────


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("  hello   world \n again ", "hello world again"),
        ("[Music] welcome back [Applause]", "welcome back"),
        ("♪ la la ♪ okay", "la la okay"),
        (">> SPEAKER: hi", "SPEAKER: hi"),
        ("rows &amp; columns, it&#39;s fine", "rows & columns, it's fine"),
        ("(music)", ""),
    ],
)
def test_clean_text(raw: str, expected: str) -> None:
    assert clean_text(raw) == expected


def test_parses_manual_vtt() -> None:
    cues = parse_vtt((FIXTURES / "manual.vtt").read_text(encoding="utf-8"))
    texts = [text for text, _, _ in cues]
    assert texts[0] == "Database Basics - Lesson One"
    assert texts[1] == "In this lesson we&#39;ll learn what a database is and why we use one."
    _, start, duration = cues[1]
    assert (start, round(duration, 3)) == (1.5, 3.75)
    assert cues[-1][1] == pytest.approx(3723.4)  # 01:02:03.400


def test_parses_auto_rolling_vtt_without_repeats() -> None:
    cues = parse_vtt((FIXTURES / "auto_rolling.vtt").read_text(encoding="utf-8"))
    # Each line keeps the start of the cue where it was first spoken (not the later hold cue).
    assert [start for _, start, _ in cues] == pytest.approx([2.24, 3.84, 5.28])
    assert [text for text, _, _ in cues] == [
        "In this lesson, we're going to",
        "learn how joins work",
        "[Music] step by step.",  # noise is removed later by clean_segments
    ]
    assert cues[0][1] == pytest.approx(2.24)


# ─── Fetcher decision tree ──────────────────────────────────────────────────


class FakeTrack:
    def __init__(self, language: str, generated: bool, lines: list[str], translatable: bool = True):
        self.language_code = language
        self.is_generated = generated
        self.is_translatable = translatable
        self.lines = lines

    def fetch(self) -> Any:
        snippets = [
            type("S", (), {"text": t, "start": float(i * 2), "duration": 2.0})()
            for i, t in enumerate(self.lines)
        ]
        return type("F", (), {"snippets": snippets})()

    def translate(self, language: str) -> "FakeTrack":
        return FakeTrack(language, self.is_generated, [f"(en) {t}" for t in self.lines])


class FakeListing:
    def __init__(self, tracks: list[FakeTrack]):
        self.tracks = tracks

    def _find(self, languages: tuple[str, ...], generated: bool) -> FakeTrack:
        for track in self.tracks:
            if track.language_code in languages and track.is_generated == generated:
                return track
        raise NoTranscriptFound(VID, languages, self)

    def find_manually_created_transcript(self, languages: tuple[str, ...]) -> FakeTrack:
        return self._find(languages, generated=False)

    def find_generated_transcript(self, languages: tuple[str, ...]) -> FakeTrack:
        return self._find(languages, generated=True)

    def __iter__(self) -> Iterator[FakeTrack]:
        return iter(self.tracks)


class FakeApi:
    def __init__(self, outcome: FakeListing | Exception):
        self.outcome = outcome

    def list(self, video_id: str) -> FakeListing:
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


AUTO_VTT = (FIXTURES / "auto_rolling.vtt").read_text(encoding="utf-8")


def ytdlp_with(**tracks: dict[str, list[dict[str, str]]]) -> Any:
    return lambda video_id: tracks


def no_ytdlp_call(video_id: str) -> dict[str, Any]:
    raise AssertionError("yt-dlp must not be called")


def fetcher(api: FakeApi, ytdlp: Any = no_ytdlp_call, http: Any = None) -> TranscriptFetcher:
    return TranscriptFetcher(api=api, ytdlp_info=ytdlp, http_get=http or (lambda url: AUTO_VTT))


def test_prefers_manual_english() -> None:
    listing = FakeListing(
        [FakeTrack("en", True, ["auto words"]), FakeTrack("en-GB", False, ["manual words"])]
    )
    result = fetcher(FakeApi(listing)).fetch(VID)
    assert (result.source, result.language) == ("YT_MANUAL", "en-GB")
    assert result.segments == [Segment("manual words", 0.0, 2.0)]
    assert result.fetched_with == "youtube-transcript-api"


def test_falls_back_to_auto_english() -> None:
    result = fetcher(
        FakeApi(FakeListing([FakeTrack("en", True, ["[Music]", "auto words"])]))
    ).fetch(VID)
    assert result.source == "YT_AUTO"
    assert [s.text for s in result.segments] == ["auto words"]  # noise-only segment dropped


def test_translates_when_no_english_track_exists() -> None:
    result = fetcher(FakeApi(FakeListing([FakeTrack("hi", True, ["namaste"])]))).fetch(VID)
    assert (result.language, result.translated_from, result.source) == ("en", "hi", "YT_AUTO")
    assert result.segments[0].text == "(en) namaste"


class UntranslatableTrack(FakeTrack):
    def translate(self, language: str) -> "FakeTrack":
        raise NotTranslatable(VID)


def test_returns_original_language_when_translation_is_refused() -> None:
    # Real case (2026-10-10): YouTube auto-captions mis-detected as Hindi refuse translation.
    listing = FakeListing([UntranslatableTrack("hi", True, ["namaste"], translatable=True)])
    result = fetcher(FakeApi(listing)).fetch(VID)  # yt-dlp is NOT consulted
    assert (result.language, result.translated_from, result.source) == ("hi", None, "YT_AUTO")
    assert result.segments[0].text == "namaste"


def test_untranslatable_tracks_are_used_in_their_own_language() -> None:
    listing = FakeListing([FakeTrack("es", False, ["hola"], translatable=False)])
    result = fetcher(FakeApi(listing)).fetch(VID)
    assert (result.language, result.source) == ("es", "YT_MANUAL")


def test_inaccessible_video_fails_without_fallback() -> None:
    with pytest.raises(NoTranscriptError, match="VideoUnavailable"):
        fetcher(FakeApi(VideoUnavailable(VID))).fetch(VID)


def test_disabled_transcripts_check_ytdlp_then_report_none() -> None:
    with pytest.raises(NoTranscriptError, match="no captions"):
        fetcher(FakeApi(TranscriptsDisabled(VID)), ytdlp=ytdlp_with()).fetch(VID)


@pytest.mark.parametrize("blocked", [RequestBlocked(VID), IpBlocked(VID), ConnectionError("down")])
def test_blocked_primary_uses_ytdlp_vtt(blocked: Exception) -> None:
    tracks = {
        "en": [
            {"ext": "json3", "url": "x"},
            {"ext": "vtt", "url": "https://www.youtube.com/api/timedtext?v=x"},
        ]
    }
    result = fetcher(FakeApi(blocked), ytdlp=ytdlp_with(automatic_captions=tracks)).fetch(VID)
    assert (result.source, result.fetched_with) == ("YT_AUTO", "yt-dlp")
    assert [s.text for s in result.segments] == [
        "In this lesson, we're going to",
        "learn how joins work",
        "step by step.",
    ]


def test_ytdlp_prefers_manual_and_maps_en_orig() -> None:
    tracks = {
        "subtitles": {
            "en-orig": [{"ext": "vtt", "url": "https://www.youtube.com/api/timedtext?m=1"}]
        },
        "automatic_captions": {
            "en": [{"ext": "vtt", "url": "https://www.youtube.com/api/timedtext?a=1"}]
        },
    }
    result = fetcher(FakeApi(TranscriptsDisabled(VID)), ytdlp=lambda _: tracks).fetch(VID)
    assert (result.source, result.language) == ("YT_MANUAL", "en")


def test_ytdlp_never_fetches_captions_from_other_hosts() -> None:
    fetched: list[str] = []

    def record(url: str) -> str:
        fetched.append(url)
        return AUTO_VTT

    tracks = {"en": [{"ext": "vtt", "url": "https://evil.example/timedtext"}]}
    with pytest.raises(NoTranscriptError):
        fetcher(
            FakeApi(TranscriptsDisabled(VID)), ytdlp=ytdlp_with(subtitles=tracks), http=record
        ).fetch(VID)
    assert fetched == []


def test_both_sources_failing_is_temporary() -> None:
    def broken(video_id: str) -> dict[str, Any]:
        raise ConnectionError("network down")

    with pytest.raises(TranscriptUnavailableError, match="RequestBlocked"):
        fetcher(FakeApi(RequestBlocked(VID)), ytdlp=broken).fetch(VID)


# ─── Endpoint ───────────────────────────────────────────────────────────────


class StubFetcher:
    def __init__(self, outcome: Any):
        self.outcome = outcome

    def fetch(self, video_id: str, spoken_language: str | None = None) -> Any:
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


@pytest.fixture
def make_api(settings: Settings) -> Any:
    def build(outcome: Any) -> TestClient:
        app = create_app(settings)
        app.dependency_overrides[get_transcript_fetcher] = lambda: StubFetcher(outcome)
        client = TestClient(app, raise_server_exceptions=False)
        client.headers["X-Internal-Key"] = INTERNAL_KEY
        return client

    return build


def test_endpoint_returns_segments_in_camel_case(make_api: Any) -> None:
    from app.ingestion.transcripts import Transcript

    transcript = Transcript("YT_AUTO", "en", [Segment("a", 0, 2), Segment("b", 2, 3.5)], "hi")
    res = make_api(transcript).post("/ingest/transcript", json={"youtubeId": VID})
    assert res.status_code == 200
    body = res.json()
    assert body["source"] == "YT_AUTO"
    assert body["translatedFrom"] == "hi"
    assert body["fetchedWith"] == "youtube-transcript-api"
    assert body["segmentCount"] == 2
    assert body["coveredSec"] == 5.5
    assert body["segments"][1] == {"text": "b", "start": 2, "duration": 3.5}


def test_endpoint_maps_errors(make_api: Any) -> None:
    missing = make_api(NoTranscriptError("no captions")).post(
        "/ingest/transcript", json={"youtubeId": VID}
    )
    assert missing.status_code == 404
    assert missing.json()["message"] == "no captions"
    blocked = make_api(TranscriptUnavailableError("blocked")).post(
        "/ingest/transcript", json={"youtubeId": VID}
    )
    assert blocked.status_code == 503
    assert blocked.headers["Retry-After"] == "60"


@pytest.mark.parametrize("youtube_id", ["short", "https://youtu.be/AAAAAAAAAAA", "AAAAAAAAAA!"])
def test_endpoint_validates_the_id(make_api: Any, youtube_id: str) -> None:
    res = make_api(None).post("/ingest/transcript", json={"youtubeId": youtube_id})
    assert res.status_code == 422
