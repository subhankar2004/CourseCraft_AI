"""pgvector store against a real PostgreSQL (the test database), with keyword embeddings.

Skipped when the test database is unreachable; CI sets REQUIRE_DB_TESTS=1 so they always run.
"""

from collections.abc import Callable
from itertools import pairwise

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.processing.chunking import Chunk
from app.processing.indexing import Embedder, LessonRef, VectorIndex
from app.processing.vector_store import PgVectorStore, VectorRecord, VectorStoreError
from tests.conftest import INTERNAL_KEY, make_settings
from tests.fakes import KEYWORD_MODEL, KeywordEmbeddings

StoreFactory = Callable[[int], PgVectorStore]
DIM = KEYWORD_MODEL.dimension


def lesson(course: str, lesson_id: str, title: str = "Lesson") -> LessonRef:
    return LessonRef(
        course_id=course,
        module_id=f"{course}-m1",
        lesson_id=lesson_id,
        video_id=f"{lesson_id}-v",
        youtube_id="dQw4w9WgXcQ",
        lesson_title=title,
    )


def chunks(*texts: str) -> list[Chunk]:
    return [
        Chunk(index=i, text=t, start_sec=i * 60.0, end_sec=i * 60.0 + 59, token_count=len(t))
        for i, t in enumerate(texts)
    ]


@pytest.fixture
def index(make_store: StoreFactory) -> VectorIndex:
    return VectorIndex(make_store(DIM), Embedder(KeywordEmbeddings(), KEYWORD_MODEL))


def test_bootstrap_is_idempotent_and_checks_the_dimension(make_store: StoreFactory) -> None:
    first = make_store(DIM)
    assert first.count("none") == 0  # creates extension, schema and table
    assert make_store(DIM).count("none") == 0  # a second store reuses the table
    with pytest.raises(VectorStoreError, match=rf"vector\({DIM}\).*vector\(4\)"):
        make_store(4).count("none")


def test_upsert_search_delete_round_trip(index: VectorIndex) -> None:
    ids = index.index_lesson(
        lesson("c1", "l1", "SQL"),
        chunks(
            "An inner join combines rows. A join needs a key.",
            "A B-tree index speeds up lookups. The index is a tree.",
            "A transaction commits or rolls back.",
        ),
    )
    assert ids == ["l1-0", "l1-1", "l1-2"]

    hits = index.similarity_search("c1", "how does a join work?", k=2)
    assert [h.id for h in hits] == ["l1-0", "l1-1"]  # ties (score 0) break by chunk order
    best = hits[0]
    assert best.score == pytest.approx(1.0, abs=1e-6)  # same direction as the query
    assert (best.course_id, best.module_id, best.video_id) == ("c1", "c1-m1", "l1-v")
    assert (best.start_sec, best.end_sec, best.lesson_title) == (0.0, 59.0, "SQL")
    assert all(a.score >= b.score for a, b in pairwise(hits))
    assert len(index.similarity_search("c1", "transaction", k=10)) == 3

    assert index.delete_course("c1") == 3
    assert index.similarity_search("c1", "join", k=5) == []


def test_search_never_crosses_courses(index: VectorIndex) -> None:
    index.index_lesson(lesson("course-a", "la"), chunks("hash tables and hash maps"))
    index.index_lesson(lesson("course-b", "lb"), chunks("graph search on a graph"))
    hits = index.similarity_search("course-a", "graph", k=10)
    assert [h.course_id for h in hits] == ["course-a"]  # course B's perfect match is invisible
    assert index.delete_course("course-a") == 1
    assert index.store.count("course-b") == 1  # deleting one course leaves others intact


def test_reindexing_a_lesson_replaces_its_vectors(index: VectorIndex) -> None:
    index.index_lesson(lesson("c1", "l1"), chunks("join", "index", "sort"))
    index.index_lesson(lesson("c1", "l2"), chunks("graph"))
    index.index_lesson(lesson("c1", "l1"), chunks("hash join"))  # fewer chunks now
    hits = index.similarity_search("c1", "join", k=10)
    assert sorted(h.id for h in hits) == ["l1-0", "l2-0"]  # stale l1-1 and l1-2 are gone
    assert next(h.text for h in hits if h.id == "l1-0") == "hash join"


def test_rejects_records_for_another_lesson_or_dimension(make_store: StoreFactory) -> None:
    store = make_store(DIM)
    record = VectorRecord(
        id="l1-0",
        course_id="c1",
        module_id="m",
        lesson_id="l1",
        video_id="v",
        youtube_id="dQw4w9WgXcQ",
        chunk_index=0,
        start_sec=0,
        end_sec=1,
        lesson_title="t",
        text="x",
        token_count=1,
        embedding=[0.0] * DIM,
    )
    with pytest.raises(ValueError, match="different course or lesson"):
        store.replace_lesson("c1", "l2", [record])
    with pytest.raises(ValueError, match="dimensions"):
        store.search("c1", [1.0, 0.0], k=1)


def test_http_round_trip(index: VectorIndex) -> None:
    app = create_app(make_settings(chunk_target_tokens=50, chunk_overlap_tokens=5))
    app.state.vector_index = index
    headers = {"X-Internal-Key": INTERNAL_KEY}
    segments = [
        {"text": f"Segment {i} explains the {topic} in detail.", "start": i * 5, "duration": 5}
        for i, topic in enumerate(["join", "join", "join", "sort", "sort", "sort"] * 2)
    ]
    body = {
        "moduleId": "m1",
        "videoId": "v1",
        "youtubeId": "dQw4w9WgXcQ",
        "lessonTitle": "Algorithms",
        "segments": segments,
    }
    with TestClient(app) as client:
        res = client.put("/vectors/course9/lessons/lesson9", json=body, headers=headers)
        assert res.status_code == 200, res.text
        indexed = res.json()
        assert indexed["embeddingModel"] == "text-embedding-3-small"  # from settings
        assert len(indexed["chunks"]) > 1
        assert [c["id"] for c in indexed["chunks"]] == [
            f"lesson9-{i}" for i in range(len(indexed["chunks"]))
        ]

        res = client.post(
            "/vectors/course9/search", json={"query": "sort", "k": 2}, headers=headers
        )
        assert res.status_code == 200
        hits = res.json()["hits"]
        assert len(hits) == 2
        assert "sort" in hits[0]["text"]
        assert set(hits[0]) >= {"id", "lessonId", "youtubeId", "startSec", "endSec", "score"}

        res = client.delete("/vectors/course9", headers=headers)
        assert res.json() == {"courseId": "course9", "deleted": len(indexed["chunks"])}
