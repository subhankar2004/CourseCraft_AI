"""Embedder and vector endpoints without a database."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.generation.embedding_models import EmbeddingModelInfo, embedding_model_info
from app.main import create_app
from app.processing.indexing import (
    Embedder,
    EmbeddingError,
    EmbeddingProviderError,
    VectorIndex,
    chunk_id,
)
from app.processing.vector_store import PgVectorStore
from tests.conftest import INTERNAL_KEY, make_settings
from tests.fakes import KEYWORD_MODEL, FailingEmbeddings, KeywordEmbeddings

HEADERS = {"X-Internal-Key": INTERNAL_KEY}
LESSON = {
    "youtubeId": "dQw4w9WgXcQ",
    "lessonTitle": "Joins",
    "segments": [{"text": "An inner join matches rows.", "start": 0, "duration": 4}],
}


def test_embedder_adds_task_prefixes() -> None:
    fake = KeywordEmbeddings()
    embedder = Embedder(fake, KEYWORD_MODEL)
    embedder.embed_documents(["join tables"])
    embedder.embed_query("what is a join?")
    assert fake.document_calls == [["doc: join tables"]]
    assert fake.query_calls == ["q: what is a join?"]


def test_nomic_prefixes_are_registered() -> None:
    nomic = embedding_model_info("nomic-embed-text")
    assert (nomic.document_prefix, nomic.query_prefix) == ("search_document: ", "search_query: ")
    assert embedding_model_info("text-embedding-3-small").query_prefix == ""


def test_embedder_batches_in_order() -> None:
    fake = KeywordEmbeddings()
    texts = ["join", "index", "sort", "hash", "tree"]
    vectors = Embedder(fake, KEYWORD_MODEL, batch_size=2).embed_documents(texts)
    assert [len(call) for call in fake.document_calls] == [2, 2, 1]
    assert vectors == [KeywordEmbeddings.vector(t) for t in texts]


def test_embedder_rejects_wrong_dimension() -> None:
    wrong = EmbeddingModelInfo(dimension=3, index_suffix="x")
    with pytest.raises(EmbeddingError, match="expected 3"):
        Embedder(KeywordEmbeddings(), wrong).embed_query("join")


def test_provider_failures_are_wrapped() -> None:
    with pytest.raises(EmbeddingProviderError, match="Ollama"):
        Embedder(FailingEmbeddings(), KEYWORD_MODEL).embed_documents(["join"])


def test_chunk_ids_are_deterministic() -> None:
    assert chunk_id("lesson42", 3) == "lesson42-3"


def test_store_rejects_unsafe_table_names() -> None:
    with pytest.raises(ValueError, match="unsafe"):
        PgVectorStore("postgresql://x", table_suffix="x; DROP TABLE users", dimension=8)


class TestEndpointsWithoutDatabase:
    def test_require_the_internal_key(self, client: TestClient) -> None:
        assert client.delete("/vectors/course1").status_code == 401
        assert client.post("/vectors/course1/search", json={"query": "x"}).status_code == 401

    def test_unconfigured_store_is_503(self, client: TestClient) -> None:
        res = client.post("/vectors/course1/search", json={"query": "join"}, headers=HEADERS)
        assert res.status_code == 503
        assert "DATABASE_URL" in res.json()["message"]

    def test_invalid_ids_and_bodies_are_422(self, offline_client: TestClient) -> None:
        client = offline_client
        assert client.delete("/vectors/bad%20id", headers=HEADERS).status_code == 422
        res = client.post("/vectors/course1/search", json={"query": "", "k": 99}, headers=HEADERS)
        assert res.status_code == 422
        bad_lesson = {**LESSON, "youtubeId": "not-an-id"}
        res = client.put("/vectors/course1/lessons/l1", json=bad_lesson, headers=HEADERS)
        assert res.status_code == 422

    def test_embedding_provider_down_is_503(self, offline_client: TestClient) -> None:
        res = offline_client.put("/vectors/course1/lessons/l1", json=LESSON, headers=HEADERS)
        assert res.status_code == 503
        assert res.headers["Retry-After"] == "30"
        res = offline_client.post(
            "/vectors/course1/search", json={"query": "join"}, headers=HEADERS
        )
        assert res.status_code == 503


@pytest.fixture
def offline_client() -> Iterator[TestClient]:
    """An app whose embedding provider is down. The store is never reached (embedding comes
    first), so no database connection is opened."""
    app = create_app(make_settings())
    store = PgVectorStore("postgresql://unused", table_suffix="kw", dimension=8)
    app.state.vector_index = VectorIndex(store, Embedder(FailingEmbeddings(), KEYWORD_MODEL))
    with TestClient(app) as test_client:
        yield test_client
