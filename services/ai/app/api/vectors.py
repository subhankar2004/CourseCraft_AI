"""Vector endpoints (internal: called only by the CourseCraft API). SPEC §7.1 step 4, §8.2."""

import threading
from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Request, status
from psycopg import OperationalError
from psycopg_pool import PoolTimeout

from app.config import Settings, get_settings
from app.generation.embedding_models import embedding_model_info
from app.generation.providers import ProviderNotConfiguredError, get_embeddings
from app.processing.chunking import TimedText, chunk_transcript
from app.processing.indexing import (
    Embedder,
    EmbeddingProviderError,
    LessonRef,
    VectorIndex,
    chunk_id,
)
from app.processing.vector_store import PgVectorStore
from app.schemas import (
    ID_PATTERN,
    ChunkOut,
    DeleteLessonVectorsResponse,
    DeleteVectorsResponse,
    IndexLessonRequest,
    IndexLessonResponse,
    SearchHitOut,
    SearchRequest,
    SearchResponse,
)

router = APIRouter(prefix="/vectors", tags=["vectors"])

_lock = threading.Lock()

IdParam = Annotated[str, Path(pattern=ID_PATTERN)]


def unavailable(message: str) -> HTTPException:
    return HTTPException(
        status.HTTP_503_SERVICE_UNAVAILABLE, message, headers={"Retry-After": "30"}
    )


def build_vector_index(settings: Settings) -> VectorIndex:
    if settings.vector_store != "pgvector":
        raise unavailable(f"VECTOR_STORE={settings.vector_store} is not implemented")
    url = settings.vector_db_url
    if url is None:
        raise unavailable("vector store not configured (set DATABASE_URL or VECTOR_DATABASE_URL)")
    info = embedding_model_info(settings.embed_model)
    try:
        embeddings = get_embeddings(settings)
    except ProviderNotConfiguredError as error:
        raise unavailable(str(error)) from error
    store = PgVectorStore(url, table_suffix=info.index_suffix, dimension=info.dimension)
    return VectorIndex(store, Embedder(embeddings, info))


def get_vector_index(
    request: Request, settings: Annotated[Settings, Depends(get_settings)]
) -> VectorIndex:
    """One VectorIndex (and connection pool) per app, created on first use."""
    state = request.app.state
    with _lock:
        if getattr(state, "vector_index", None) is None:
            state.vector_index = build_vector_index(settings)
        index: VectorIndex = state.vector_index
    return index


def run_infra[T](call: Callable[[], T]) -> T:
    """Maps infrastructure failures to 503 (the API's job queue retries them)."""
    try:
        return call()
    except EmbeddingProviderError as error:
        raise unavailable(str(error)) from error
    except (OperationalError, PoolTimeout) as error:
        raise unavailable("vector database unavailable") from error


@router.put("/{course_id}/lessons/{lesson_id}")
def index_lesson(
    course_id: IdParam,
    lesson_id: IdParam,
    body: IndexLessonRequest,
    index: Annotated[VectorIndex, Depends(get_vector_index)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> IndexLessonResponse:
    """Chunks a lesson transcript, embeds it and REPLACES the lesson's vectors (idempotent)."""
    chunks = chunk_transcript(
        (TimedText(s.text, s.start, s.duration) for s in body.segments),
        target_tokens=settings.chunk_target_tokens,
        overlap_tokens=settings.chunk_overlap_tokens,
    )
    if not chunks:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "transcript has no text")
    lesson = LessonRef(
        course_id=course_id,
        lesson_id=lesson_id,
        youtube_id=body.youtube_id,
        lesson_title=body.lesson_title,
    )
    run_infra(lambda: index.index_lesson(lesson, chunks))
    return IndexLessonResponse(
        course_id=course_id,
        lesson_id=lesson_id,
        embedding_model=settings.embed_model,
        chunks=[
            ChunkOut(
                id=chunk_id(lesson_id, c.index),
                index=c.index,
                text=c.text,
                start_sec=c.start_sec,
                end_sec=c.end_sec,
                token_count=c.token_count,
                overlap_chars=c.overlap_chars,
            )
            for c in chunks
        ],
    )


@router.post("/{course_id}/search")
def search(
    course_id: IdParam,
    body: SearchRequest,
    index: Annotated[VectorIndex, Depends(get_vector_index)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> SearchResponse:
    """The chunks of ONE course most similar to the query (never other courses')."""
    hits = run_infra(
        lambda: index.similarity_search(course_id, body.query, body.k or settings.rag_top_k)
    )
    return SearchResponse(
        course_id=course_id,
        hits=[
            SearchHitOut(
                id=h.id,
                lesson_id=h.lesson_id,
                youtube_id=h.youtube_id,
                chunk_index=h.chunk_index,
                start_sec=h.start_sec,
                end_sec=h.end_sec,
                lesson_title=h.lesson_title,
                text=h.text,
                score=round(h.score, 6),
            )
            for h in hits
        ],
    )


@router.delete("/{course_id}")
def delete_course_vectors(
    course_id: IdParam, index: Annotated[VectorIndex, Depends(get_vector_index)]
) -> DeleteVectorsResponse:
    """Removes every vector of a course (when the course is deleted, #33)."""
    return DeleteVectorsResponse(
        course_id=course_id, deleted=run_infra(lambda: index.delete_course(course_id))
    )


@router.delete("/{course_id}/lessons/{lesson_id}")
def delete_lesson_vectors(
    course_id: IdParam, lesson_id: IdParam, index: Annotated[VectorIndex, Depends(get_vector_index)]
) -> DeleteLessonVectorsResponse:
    """Removes one lesson's vectors (a video skipped by the job, or a deleted lesson)."""
    return DeleteLessonVectorsResponse(
        course_id=course_id,
        lesson_id=lesson_id,
        deleted=run_infra(lambda: index.delete_lesson(course_id, lesson_id)),
    )
