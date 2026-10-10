"""Real embeddings: Ollama nomic-embed-text + pgvector. Run with `uv run pytest -m network`.

Needs `ollama serve` with `ollama pull nomic-embed-text`, and the test database.
"""

import pytest

from app.generation.embedding_models import embedding_model_info
from app.generation.providers import get_embeddings
from app.processing.chunking import Chunk
from app.processing.indexing import Embedder, LessonRef, VectorIndex
from tests.conftest import make_settings
from tests.test_vector_store import StoreFactory

pytestmark = pytest.mark.network

LECTURE = [
    "A SQL inner join returns the rows that have matching values in both tables, using a "
    "foreign key that references the primary key of the other table.",
    "Database normalization removes redundancy: first normal form needs atomic values, second "
    "normal form removes partial dependencies, third normal form removes transitive ones.",
    "A transaction is atomic, consistent, isolated and durable. If any statement fails the "
    "whole transaction is rolled back, otherwise it is committed.",
    "Quicksort picks a pivot, partitions the array around it and sorts both halves "
    "recursively, which takes O(n log n) time on average.",
]


def test_upsert_search_delete_with_real_embeddings(make_store: StoreFactory) -> None:
    settings = make_settings(llm_provider="ollama")
    info = embedding_model_info(settings.embed_model)
    index = VectorIndex(make_store(info.dimension), Embedder(get_embeddings(settings), info))
    chunks = [
        Chunk(index=i, text=t, start_sec=i * 120.0, end_sec=i * 120.0 + 119, token_count=40)
        for i, t in enumerate(LECTURE)
    ]
    lesson = LessonRef("course-net", "lesson-net", "dQw4w9WgXcQ", "Databases")
    assert index.index_lesson(lesson, chunks) == [f"lesson-net-{i}" for i in range(4)]

    # Paraphrased questions (few shared words) must still find the right moment.
    expectations = {
        "how do I combine rows from two tables?": "lesson-net-0",
        "what are the normal forms and why do we need them?": "lesson-net-1",
        "what happens when one statement in a group of updates fails?": "lesson-net-2",
        "how does the divide and conquer sorting algorithm work?": "lesson-net-3",
    }
    for question, expected in expectations.items():
        hits = index.similarity_search("course-net", question, k=4)
        assert hits[0].id == expected, (question, [(h.id, round(h.score, 3)) for h in hits])
        assert hits[0].score > hits[1].score

    assert index.delete_course("course-net") == 4
