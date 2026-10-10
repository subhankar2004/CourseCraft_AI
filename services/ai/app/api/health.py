"""Liveness endpoint. Public (no internal key) so container/orchestrator probes can reach it."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app import __version__
from app.config import Settings, get_settings
from app.schemas import HealthResponse, LlmInfo, Providers, VectorStoreInfo

router = APIRouter(tags=["health"])


@router.get("/health")
def health(settings: Annotated[Settings, Depends(get_settings)]) -> HealthResponse:
    # Reports configuration only; never calls OpenAI/Pinecone and never exposes secrets.
    return HealthResponse(
        status="ok",
        service="coursecraft-ai",
        version=__version__,
        providers=Providers(
            llm=LlmInfo(
                provider=settings.llm_provider,
                chat_model=settings.chat_model,
                embedding_model=settings.embed_model,
                embedding_dimension=settings.embedding_dimension,
                configured=settings.llm_configured,
            ),
            vector_store=VectorStoreInfo(
                provider="pinecone",
                index=settings.pinecone_index,
                configured=settings.vector_store_configured,
            ),
        ),
    )
