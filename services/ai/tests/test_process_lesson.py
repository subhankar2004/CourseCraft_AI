"""`POST /process/lesson` end to end with fakes (issue #24): a recorded transcript → notes
(scripted chat model) → chunks embedded and stored (in memory, and real pgvector when the test
database is available)."""

import logging
from collections.abc import Callable, Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.process import get_notes_generator
from app.generation.notes import NotesGenerator
from app.generation.usage import TokenUsageCallback, UsageTotals
from app.main import create_app
from app.processing.indexing import Embedder, VectorIndex
from app.processing.vector_store import PgVectorStore, VectorStore
from tests.conftest import INTERNAL_KEY, make_settings
from tests.fakes import (
    HASHING_MODEL,
    FailingEmbeddings,
    HashingEmbeddings,
    InMemoryVectorStore,
    ScriptedChatModel,
)
from tests.fixture_data import VIDEOS, FixtureName, load_transcript
from tests.test_notes import NO_WAIT, map_reply, scripted

Reply = Callable[[str], str]


def body(name: FixtureName = "whisper", lesson_id: str = "lesson-1") -> dict[str, Any]:
    return {
        "courseId": "course-1",
        "lessonId": lesson_id,
        "youtubeId": VIDEOS[name],
        "videoTitle": "What is a database in under 4 minutes",
        "segments": [
            {"text": s.text, "start": s.start, "duration": s.duration}
            for s in load_transcript(name).segments
        ],
    }


@pytest.fixture(params=["memory", "pgvector"])
def store(request: pytest.FixtureRequest) -> VectorStore:
    if request.param == "memory":
        return InMemoryVectorStore(HASHING_MODEL.dimension)
    make_store: Callable[[int], PgVectorStore] = request.getfixturevalue("make_store")
    return make_store(HASHING_MODEL.dimension)


class App:
    """The real app with fakes at the edges; `reply` scripts the chat model per test."""

    def __init__(self, store: VectorStore):
        self.store = store
        self.reply: Reply = scripted
        self.embeddings: Any = HashingEmbeddings()
        self.map_tokens = 2500
        self.app: FastAPI = create_app(make_settings())
        self.app.dependency_overrides[get_notes_generator] = self._generator

    def _generator(self) -> NotesGenerator:
        totals = UsageTotals()
        usage = TokenUsageCallback(operation="lesson-notes", model="scripted", totals=totals)
        model = ScriptedChatModel(reply=self.reply, callbacks=[usage])
        return NotesGenerator(
            model,
            model_name="scripted",
            map_tokens=self.map_tokens,
            concurrency=4,
            retry_wait=NO_WAIT,
            usage=totals,
        )

    def client(self) -> TestClient:
        self.app.state.vector_index = VectorIndex(
            self.store, Embedder(self.embeddings, HASHING_MODEL)
        )
        client = TestClient(self.app, raise_server_exceptions=False)
        client.headers["X-Internal-Key"] = INTERNAL_KEY
        return client


@pytest.fixture
def app(store: VectorStore) -> App:
    return App(store)


@pytest.fixture
def client(app: App) -> Iterator[TestClient]:
    with app.client() as test_client:
        yield test_client


def test_turns_a_transcript_into_a_lesson(client: TestClient, store: VectorStore) -> None:
    res = client.post("/process/lesson", json=body())
    assert res.status_code == 200, res.text
    lesson = res.json()

    chunks = lesson["chunks"]
    assert [c["id"] for c in chunks] == [f"lesson-1-{i}" for i in range(len(chunks))]
    notes = lesson["notes"]
    assert notes["title"] == "What Is a Database?"
    assert notes["keyConcepts"] == ["Database", "Primary key", "B-tree"]
    assert notes["promptIds"] == ["lesson-notes-map@2", "lesson-notes-reduce@2"]
    starts = {s.start for s in load_transcript("whisper").segments}
    assert notes["anchors"] and set(notes["anchors"]) <= starts
    assert notes["readingTimeMin"] >= 1
    assert lesson["usage"]["llmCalls"] == 2  # one map call, one reduce call
    assert lesson["chatModel"] == "scripted"

    # The chunks are searchable, labelled with the generated lesson title.
    assert store.count("course-1") == len(chunks)
    hit = client.post("/vectors/course-1/search", json={"query": "relational database"}).json()
    assert hit["hits"][0]["lessonId"] == "lesson-1"
    assert hit["hits"][0]["lessonTitle"] == "What Is a Database?"


def test_rerunning_overwrites_the_same_vectors(client: TestClient, store: VectorStore) -> None:
    first = client.post("/process/lesson", json=body()).json()
    second = client.post("/process/lesson", json=body()).json()
    assert [c["id"] for c in second["chunks"]] == [c["id"] for c in first["chunks"]]
    assert second["notes"] == first["notes"]
    assert store.count("course-1") == len(first["chunks"])  # replaced, not duplicated


def test_unusable_notes_leave_no_vectors(app: App, store: VectorStore) -> None:
    app.reply = lambda prompt: map_reply(prompt) if "ONE PART" in prompt else "no structure"
    with app.client() as client:
        res = client.post("/process/lesson", json=body())
    assert res.status_code == 502
    assert "3 attempts" in res.json()["message"]
    assert store.count("course-1") == 0  # notes come first; nothing was indexed


def test_model_down_is_503_and_leaves_no_vectors(app: App, store: VectorStore) -> None:
    def down(prompt: str) -> str:
        raise ConnectionError("Failed to connect to Ollama")

    app.reply = down
    with app.client() as client:
        res = client.post("/process/lesson", json=body())
    assert res.status_code == 503
    assert res.headers["Retry-After"] == "30"
    assert store.count("course-1") == 0


def test_embedding_service_down_is_503(app: App) -> None:
    app.embeddings = FailingEmbeddings()
    with app.client() as client:
        res = client.post("/process/lesson", json=body())
    assert res.status_code == 503


def test_bugs_are_not_disguised_as_outages(app: App) -> None:
    def bug(prompt: str) -> str:
        raise KeyError("programming error")

    app.reply = bug
    with app.client() as client:
        assert client.post("/process/lesson", json=body()).status_code == 500


def test_empty_transcript_and_bad_ids_are_422(client: TestClient) -> None:
    blank = {**body(), "segments": [{"text": "  ", "start": 0, "duration": 1}]}
    assert client.post("/process/lesson", json=blank).status_code == 422
    bad = {**body(), "lessonId": "../etc"}
    assert client.post("/process/lesson", json=bad).status_code == 422


def test_skipped_lesson_vectors_can_be_deleted(client: TestClient, store: VectorStore) -> None:
    one = client.post("/process/lesson", json=body(lesson_id="lesson-1")).json()
    client.post("/process/lesson", json=body("auto", lesson_id="lesson-2"))
    res = client.delete("/vectors/course-1/lessons/lesson-2")
    assert res.status_code == 200
    assert res.json()["deleted"] > 0
    assert store.count("course-1") == len(one["chunks"])  # lesson 1 untouched


class Collect(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


def test_request_id_reaches_every_log_line_including_worker_threads(app: App) -> None:
    app.map_tokens = 600  # several map calls, run in parallel worker threads
    with app.client() as client:
        collect = Collect()  # attached after create_app(), which resets the root handlers
        root = logging.getLogger()
        root.addHandler(collect)
        root.setLevel(logging.INFO)
        try:
            res = client.post(
                "/process/lesson", json=body("manual"), headers={"X-Request-Id": "job-42.video-3"}
            )
        finally:
            root.removeHandler(collect)
    assert res.status_code == 200, res.text
    assert res.headers["X-Request-Id"] == "job-42.video-3"

    by_logger: dict[str, set[object]] = {}
    for record in collect.records:
        by_logger.setdefault(record.name, set()).add(getattr(record, "request_id", None))
    usage_threads = {r.thread for r in collect.records if r.name == "app.llm.usage"}
    assert len(usage_threads) > 1  # the map calls really ran on other threads
    for name in ("app.llm.usage", "app.generation.notes", "app.processing.lesson", "app.http"):
        assert by_logger[name] == {"job-42.video-3"}, name
