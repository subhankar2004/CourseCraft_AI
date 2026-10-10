"""The whole ingestion path, offline, on recorded real data (issue #22):

    metadata → transcript (captions or Whisper) → chunks → embeddings → vector store → search

Everything runs through the real HTTP endpoints and the real fetcher decision tree. Only the
outside world is replayed from tests/fixtures/: YouTube (metadata, caption tracks), Whisper (its
recorded output) and the embedding model (a deterministic lexical embedding). The vector store
is in memory, and real pgvector when the test database is available.
"""

from collections.abc import Callable, Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from youtube_transcript_api import NoTranscriptFound, TranscriptsDisabled

from app.api.ingest import get_metadata_service, get_transcript_fetcher
from app.config import Settings
from app.ingestion.metadata import MetadataService, VideoInfo, VideoUnavailableError
from app.ingestion.transcripts import Transcript, TranscriptFetcher
from app.ingestion.whisper import WhisperResult, WhisperSegment
from app.main import create_app
from app.processing.chunking import chunk_transcript, count_tokens
from app.processing.indexing import Embedder, VectorIndex
from app.processing.vector_store import PgVectorStore, VectorStore
from tests.conftest import INTERNAL_KEY, make_settings
from tests.fakes import HASHING_MODEL, HashingEmbeddings, InMemoryVectorStore
from tests.fixture_data import EXCERPT_SEC, VIDEOS, FixtureName, load_transcript, load_videos
from tests.test_chunking import assert_invariants

SOURCES: dict[FixtureName, str] = {"manual": "YT_MANUAL", "auto": "YT_AUTO", "whisper": "WHISPER"}
BY_ID: dict[str, FixtureName] = {youtube_id: name for name, youtube_id in VIDEOS.items()}


# ─── Replays of the outside world ───────────────────────────────────────────


class ReplayYoutube:
    """yt-dlp metadata replayed from metadata/videos.json."""

    def __init__(self) -> None:
        self.videos = load_videos()

    def video(self, video_id: str) -> VideoInfo:
        if video_id not in self.videos:
            raise VideoUnavailableError("Video unavailable")
        return self.videos[video_id]

    def playlist_video_ids(self, playlist_id: str, limit: int) -> tuple[list[str], bool]:
        ids = list(self.videos)
        return ids[:limit], len(ids) > limit


class ReplayTrack:
    def __init__(self, transcript: Transcript):
        self.language_code = transcript.language
        self.is_generated = transcript.source == "YT_AUTO"
        self.is_translatable = False
        self.segments = transcript.segments

    def fetch(self) -> Any:
        return type("Fetched", (), {"snippets": self.segments})()


class ReplayListing:
    def __init__(self, video_id: str, track: ReplayTrack):
        self.video_id = video_id
        self.track = track

    def _find(self, languages: tuple[str, ...], generated: bool) -> ReplayTrack:
        if self.track.language_code in languages and self.track.is_generated == generated:
            return self.track
        raise NoTranscriptFound(self.video_id, languages, self)

    def find_manually_created_transcript(self, languages: tuple[str, ...]) -> ReplayTrack:
        return self._find(languages, generated=False)

    def find_generated_transcript(self, languages: tuple[str, ...]) -> ReplayTrack:
        return self._find(languages, generated=True)

    def __iter__(self) -> Iterator[ReplayTrack]:
        return iter([self.track])


class ReplayTranscriptApi:
    """youtube-transcript-api replayed: caption fixtures are tracks; the Whisper fixture's video
    has captions disabled, like the real one."""

    def list(self, video_id: str) -> ReplayListing:
        transcript = load_transcript(BY_ID[video_id])
        if transcript.source == "WHISPER":
            raise TranscriptsDisabled(video_id)
        return ReplayListing(video_id, ReplayTrack(transcript))


class ReplayWhisper:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def transcribe_video(self, video_id: str) -> WhisperResult:
        self.calls.append(video_id)
        recorded = load_transcript(BY_ID[video_id])
        segments = [WhisperSegment(s.text, s.start, s.duration) for s in recorded.segments]
        end = segments[-1].start + segments[-1].duration
        return WhisperResult(recorded.language, 0.99, segments, audio_sec=end, elapsed_sec=0.0)


def no_ytdlp_subtitles(video_id: str) -> dict[str, Any]:
    return {}  # the yt-dlp caption fallback finds nothing more than the primary source


def no_http(url: str) -> str:
    raise AssertionError("no caption file should be downloaded")


# ─── Fixture sanity ─────────────────────────────────────────────────────────


@pytest.mark.parametrize("name", list(VIDEOS))
def test_fixtures_are_well_formed(name: FixtureName) -> None:
    transcript = load_transcript(name)
    assert transcript.source == SOURCES[name]
    assert transcript.language == "en"
    segments = transcript.segments
    assert len(segments) > 50
    assert all(s.text.strip() and s.duration >= 0 for s in segments)
    assert [s.start for s in segments] == sorted(s.start for s in segments)
    assert segments[-1].start < EXCERPT_SEC  # excerpts only (AGENTS.md rule 6)
    assert VIDEOS[name] in load_videos()


@pytest.mark.parametrize("name", list(VIDEOS))
def test_real_transcripts_satisfy_the_chunking_invariants(name: FixtureName) -> None:
    from app.processing.chunking import TimedText

    segments = [TimedText(s.text, s.start, s.duration) for s in load_transcript(name).segments]
    for target, overlap in [(800, 120), (200, 40)]:
        chunks = chunk_transcript(segments, target, overlap)
        assert_invariants(chunks, segments, target, overlap)


# ─── The pipeline through the HTTP API ──────────────────────────────────────


@pytest.fixture(params=["memory", "pgvector"])
def store(
    request: pytest.FixtureRequest,
) -> VectorStore:
    if request.param == "memory":
        return InMemoryVectorStore(HASHING_MODEL.dimension)
    # Real PostgreSQL: skipped locally without the test database, required in CI.
    make_store: Callable[[int], PgVectorStore] = request.getfixturevalue("make_store")
    return make_store(HASHING_MODEL.dimension)


@pytest.fixture
def whisper() -> ReplayWhisper:
    return ReplayWhisper()


@pytest.fixture
def api(store: VectorStore, whisper: ReplayWhisper) -> Iterator[TestClient]:
    settings: Settings = make_settings()
    app = create_app(settings)
    app.dependency_overrides[get_metadata_service] = lambda: MetadataService(
        ReplayYoutube(), max_videos=settings.max_videos_per_course
    )
    app.dependency_overrides[get_transcript_fetcher] = lambda: TranscriptFetcher(
        api=ReplayTranscriptApi(),
        ytdlp_info=no_ytdlp_subtitles,
        http_get=no_http,
        whisper=whisper,
    )
    app.state.vector_index = VectorIndex(store, Embedder(HashingEmbeddings(), HASHING_MODEL))
    with TestClient(app) as client:
        client.headers["X-Internal-Key"] = INTERNAL_KEY
        yield client


def ingest_course(client: TestClient, course_id: str) -> dict[str, list[dict[str, Any]]]:
    """Runs metadata → transcript → index for every fixture video; returns chunks per lesson."""
    urls = [f"https://youtu.be/{youtube_id}" for youtube_id in VIDEOS.values()]
    meta = client.post("/ingest/metadata", json={"urls": urls})
    assert meta.status_code == 200, meta.text
    videos = meta.json()["videos"]
    assert [v["youtubeId"] for v in videos] == list(VIDEOS.values())

    lessons: dict[str, list[dict[str, Any]]] = {}
    for video in videos:
        name = BY_ID[video["youtubeId"]]
        res = client.post(
            "/ingest/transcript",
            json={"youtubeId": video["youtubeId"], "spokenLanguage": video["language"]},
        )
        assert res.status_code == 200, res.text
        transcript = res.json()
        assert transcript["source"] == SOURCES[name]

        lesson_id = f"lesson-{name}"
        res = client.put(
            f"/vectors/{course_id}/lessons/{lesson_id}",
            json={
                "moduleId": "module-1",
                "videoId": f"video-{name}",
                "youtubeId": video["youtubeId"],
                "lessonTitle": video["title"],
                "segments": transcript["segments"],
            },
        )
        assert res.status_code == 200, res.text
        lessons[lesson_id] = res.json()["chunks"]
    return lessons


def search(client: TestClient, course_id: str, query: str, k: int = 3) -> list[dict[str, Any]]:
    res = client.post(f"/vectors/{course_id}/search", json={"query": query, "k": k})
    assert res.status_code == 200, res.text
    hits: list[dict[str, Any]] = res.json()["hits"]
    return hits


def test_metadata_to_search_on_recorded_lectures(
    api: TestClient, whisper: ReplayWhisper, store: VectorStore
) -> None:
    lessons = ingest_course(api, "course-fixture")

    # Captions were used where they exist; Whisper only for the video without any.
    assert whisper.calls == [VIDEOS["whisper"]]

    for lesson_id, chunks in lessons.items():
        name: FixtureName = lesson_id.removeprefix("lesson-")  # type: ignore[assignment]
        segments = load_transcript(name).segments
        assert [c["id"] for c in chunks] == [f"{lesson_id}-{i}" for i in range(len(chunks))]
        # Timestamps are real caption boundaries spanning the whole recording.
        assert chunks[0]["startSec"] == segments[0].start
        assert chunks[-1]["endSec"] == pytest.approx(
            max(s.start + s.duration for s in segments), abs=1e-3
        )
        assert all(count_tokens(c["text"]) == c["tokenCount"] <= 800 for c in chunks)
    assert store.count("course-fixture") == sum(len(c) for c in lessons.values())

    # Topic questions land in the right lecture.
    python_hits = search(api, "course-fixture", "how do I declare a variable in python")
    assert python_hits[0]["lessonId"] == "lesson-auto"
    database_hits = search(api, "course-fixture", "what is a relational database")
    assert {h["lessonId"] for h in database_hits[:2]} <= {"lesson-manual", "lesson-whisper"}

    # A passage from the middle of a chunk retrieves exactly that chunk, with its timestamps.
    target = lessons["lesson-manual"][len(lessons["lesson-manual"]) // 2]
    words = target["text"].split()
    passage = " ".join(words[len(words) // 2 - 25 : len(words) // 2 + 25])
    best = search(api, "course-fixture", passage, k=1)[0]
    assert (best["id"], best["startSec"], best["endSec"]) == (
        target["id"],
        target["startSec"],
        target["endSec"],
    )
    assert best["youtubeId"] == VIDEOS["manual"]


def test_reprocessing_is_idempotent_and_courses_are_isolated(
    api: TestClient, store: VectorStore
) -> None:
    first = ingest_course(api, "course-a")
    total = sum(len(c) for c in first.values())
    again = ingest_course(api, "course-a")  # e.g. a retried job
    assert again == first
    assert store.count("course-a") == total  # replaced, not duplicated

    hits = search(api, "course-b", "what is a relational database")
    assert hits == []  # course B has nothing, even though course A matches perfectly

    res = api.delete("/vectors/course-a")
    assert res.json() == {"courseId": "course-a", "deleted": total}
    assert search(api, "course-a", "python") == []


def test_unknown_video_is_reported_not_fatal(api: TestClient) -> None:
    res = api.post(
        "/ingest/metadata",
        json={"urls": [f"https://youtu.be/{VIDEOS['manual']}", "https://youtu.be/AAAAAAAAAAA"]},
    )
    body = res.json()
    assert [v["youtubeId"] for v in body["videos"]] == [VIDEOS["manual"]]
    assert body["failed"][0]["youtubeId"] == "AAAAAAAAAAA"
