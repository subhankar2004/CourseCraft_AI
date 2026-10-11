"""Course chatbot endpoint (internal: called only by the CourseCraft API). SPEC §7.2, §8.2.

Retrieval and the grounding gate run BEFORE the response starts, so infrastructure failures are
still plain HTTP errors (503). Then the answer streams as Server-Sent Events:
`token` events, and a final `done` (or `failed` if the model breaks mid-answer).
"""

import json
from collections.abc import Iterator
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from langchain_core.language_models import BaseChatModel

from app.api.vectors import get_vector_index, run_infra, unavailable
from app.config import Settings, get_settings
from app.generation.prompts import load_prompt
from app.generation.providers import ProviderNotConfiguredError, get_chat_model
from app.generation.usage import UsageTotals
from app.processing.indexing import VectorIndex
from app.rag.answer import (
    AnswerStream,
    DoneEvent,
    Event,
    FailedEvent,
    Source,
    TokenEvent,
    Turn,
    condense_question,
    retrieve,
)
from app.schemas import (
    RagAnswerRequest,
    RagCitation,
    RagDoneEvent,
    RagFailedEvent,
    RagTokenEvent,
    UsageOut,
)

router = APIRouter(prefix="/rag", tags=["rag"])

SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


class RagModel:
    """The chat model for one answer, with its own token totals."""

    def __init__(self, model: BaseChatModel, usage: UsageTotals) -> None:
        self.model = model
        self.usage = usage


def get_rag_model(settings: Annotated[Settings, Depends(get_settings)]) -> RagModel:
    usage = UsageTotals()
    try:
        model = get_chat_model(settings, operation="rag-answer", temperature=0.1, totals=usage)
    except ProviderNotConfiguredError as error:
        raise unavailable(str(error)) from error
    return RagModel(model, usage)


def sse(event: str, payload: RagTokenEvent | RagDoneEvent | RagFailedEvent) -> str:
    data = json.dumps(payload.model_dump(mode="json", by_alias=True), separators=(",", ":"))
    return f"event: {event}\ndata: {data}\n\n"


def citation(source: Source) -> RagCitation:
    passage = source.passage
    return RagCitation(
        n=source.n,
        chunk_id=passage.chunk_ids[0],
        chunk_ids=list(passage.chunk_ids),
        lesson_id=passage.lesson_id,
        lesson_title=passage.lesson_title,
        youtube_id=passage.youtube_id,
        start_sec=passage.start_sec,
        end_sec=passage.end_sec,
        seek_sec=passage.seek_sec,
        score=round(passage.score, 6),
    )


PROMPTS = ("rag-condense", "rag-answer", "rag-question")


def encode(event: Event, settings: Settings) -> str:
    if isinstance(event, TokenEvent):
        return sse("token", RagTokenEvent(text=event.text))
    if isinstance(event, FailedEvent):
        return sse("failed", RagFailedEvent(message=event.message))
    done: DoneEvent = event
    return sse(
        "done",
        RagDoneEvent(
            grounded=done.grounded,
            answer=done.answer,
            citations=[citation(c) for c in done.citations],
            sources=[citation(c) for c in done.sources],
            standalone_question=done.standalone_question,
            best_score=None if done.best_score is None else round(done.best_score, 6),
            refusal=done.refusal,
            min_score=settings.rag_min_score,
            prompt_ids=[
                load_prompt(name).id
                for name in PROMPTS
                if name != "rag-condense" or done.standalone_question is not None
            ],
            chat_model=settings.chat_model,
            embedding_model=settings.embed_model,
            usage=UsageOut(
                llm_calls=done.usage_calls,
                input_tokens=done.input_tokens,
                output_tokens=done.output_tokens,
            ),
        ),
    )


@router.post(
    "/answer",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}}},
)
def answer(
    body: RagAnswerRequest,
    index: Annotated[VectorIndex, Depends(get_vector_index)],
    rag: Annotated[RagModel, Depends(get_rag_model)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> StreamingResponse:
    """Answers a question from ONE course's transcripts, streamed as SSE.

    A follow-up (with history) is first condensed into a standalone question by the model.
    Refused (fixed message, `grounded=false`, no answer generated) when the course has no chunks
    or the best match scores below RAG_MIN_SCORE. 503 when embeddings or the vector store are
    down.
    """
    question = body.question.strip()
    history = [Turn(role=t.role, content=t.content) for t in body.history]
    # A follow-up is condensed first, so retrieval searches for its actual topic (#40).
    standalone = condense_question(rag.model, question, history)
    retrieval = run_infra(
        lambda: retrieve(
            index,
            body.course_id,
            standalone or question,
            top_k=settings.rag_top_k,
            min_score=settings.rag_min_score,
        )
    )
    stream = AnswerStream(
        model=rag.model,
        usage=rag.usage,
        course_id=body.course_id,
        question=question,
        retrieval=retrieval,
        history=history,
        standalone_question=standalone,
    )

    def events() -> Iterator[str]:
        for event in stream.events():
            yield encode(event, settings)

    return StreamingResponse(events(), media_type="text/event-stream", headers=SSE_HEADERS)
