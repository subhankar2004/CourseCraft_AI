"""Embedding chunks and searching them (SPEC §7.1 step 4, §7.2).

`Embedder` adds the model's task prefixes: nomic-embed-text is trained with `search_document:` /
`search_query:` prefixes and retrieves noticeably worse without them, and mxbai-embed-large
expects an instruction before queries. OpenAI models need none. It also embeds in batches and
checks every vector has the dimension the store was created with.

`VectorIndex` ties a lesson's chunks to vector rows. Row ids are deterministic
(`{lessonId}-{index}`), the same id the API stores for its `Chunk` rows, so re-processing a
lesson replaces its vectors instead of duplicating them.
"""

import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from langchain_core.embeddings import Embeddings

from app.generation.embedding_models import EmbeddingModelInfo
from app.processing.chunking import Chunk
from app.processing.vector_store import PgVectorStore, SearchHit, VectorRecord

logger = logging.getLogger("app.processing.indexing")


class EmbeddingError(RuntimeError):
    """The embedding model returned something unusable (wrong count or dimension)."""


class EmbeddingProviderError(RuntimeError):
    """The embedding provider failed (Ollama not running, model not pulled, OpenAI error...)."""


def _call_provider[A, T](call: Callable[[A], T], argument: A) -> T:
    # Providers raise their own exception types (httpx, ollama, openai); callers only need to
    # know the provider is unavailable. The cause is kept for the logs.
    try:
        return call(argument)
    except Exception as error:
        logger.warning("embedding provider failed", exc_info=error)
        raise EmbeddingProviderError(f"embedding provider failed: {error}") from error


class Embedder:
    def __init__(self, embeddings: Embeddings, info: EmbeddingModelInfo, batch_size: int = 64):
        if batch_size < 1:
            raise ValueError("batch_size must be >= 1")
        self._embeddings = embeddings
        self.info = info
        self.batch_size = batch_size

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for start in range(0, len(texts), self.batch_size):
            batch = [self.info.document_prefix + t for t in texts[start : start + self.batch_size]]
            result = _call_provider(self._embeddings.embed_documents, batch)
            if len(result) != len(batch):
                raise EmbeddingError(f"asked for {len(batch)} embeddings, got {len(result)}")
            vectors.extend(self._checked(v) for v in result)
        return vectors

    def embed_query(self, text: str) -> list[float]:
        query = self.info.query_prefix + text
        return self._checked(_call_provider(self._embeddings.embed_query, query))

    def _checked(self, vector: list[float]) -> list[float]:
        if len(vector) != self.info.dimension:
            raise EmbeddingError(
                f"embedding has {len(vector)} dimensions, expected {self.info.dimension}"
            )
        return vector


def chunk_id(lesson_id: str, index: int) -> str:
    return f"{lesson_id}-{index}"


@dataclass(frozen=True)
class LessonRef:
    course_id: str
    module_id: str
    lesson_id: str
    video_id: str
    youtube_id: str
    lesson_title: str


class VectorIndex:
    def __init__(self, store: PgVectorStore, embedder: Embedder):
        if store.dimension != embedder.info.dimension:
            raise ValueError("vector store and embedding model dimensions differ")
        self.store = store
        self.embedder = embedder

    def index_lesson(self, lesson: LessonRef, chunks: Sequence[Chunk]) -> list[str]:
        """Embeds a lesson's chunks and replaces its vectors; returns the row ids in order."""
        embeddings = self.embedder.embed_documents([c.text for c in chunks])
        records = [
            VectorRecord(
                id=chunk_id(lesson.lesson_id, chunk.index),
                course_id=lesson.course_id,
                module_id=lesson.module_id,
                lesson_id=lesson.lesson_id,
                video_id=lesson.video_id,
                youtube_id=lesson.youtube_id,
                chunk_index=chunk.index,
                start_sec=chunk.start_sec,
                end_sec=chunk.end_sec,
                lesson_title=lesson.lesson_title,
                text=chunk.text,
                token_count=chunk.token_count,
                embedding=embedding,
            )
            for chunk, embedding in zip(chunks, embeddings, strict=True)
        ]
        self.store.replace_lesson(lesson.course_id, lesson.lesson_id, records)
        return [r.id for r in records]

    def similarity_search(self, course_id: str, query: str, k: int) -> list[SearchHit]:
        """The `k` chunks of `course_id` most similar to `query`, best first, with scores."""
        return self.store.search(course_id, self.embedder.embed_query(query), k)

    def delete_course(self, course_id: str) -> int:
        return self.store.delete_course(course_id)
