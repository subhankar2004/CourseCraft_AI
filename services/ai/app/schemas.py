"""Request/response contracts of the AI service.

JSON uses camelCase to match the TypeScript side (apps/api, packages/shared). When a contract
changes, update the TypeScript mirror in the same PR (AGENTS.md).
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ErrorResponse(CamelModel):
    """Same error shape as the NestJS API (apps/api AllExceptionsFilter)."""

    status_code: int
    error: str
    message: str | list[str]
    path: str
    timestamp: str
    request_id: str | None = None


class LlmInfo(CamelModel):
    provider: Literal["openai", "ollama"]
    chat_model: str
    embedding_model: str
    embedding_dimension: int
    configured: bool


class VectorStoreInfo(CamelModel):
    provider: Literal["pinecone"]
    index: str
    configured: bool


class Providers(CamelModel):
    llm: LlmInfo
    vector_store: VectorStoreInfo


class HealthResponse(CamelModel):
    status: Literal["ok"]
    service: str
    version: str
    providers: Providers
