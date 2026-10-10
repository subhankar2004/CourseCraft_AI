"""Service configuration, loaded from the environment and the shared root `.env`.

Validated once at startup (fail fast). Keep in sync with the root `.env.example` and SPEC §12.
"""

import os
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, SecretStr, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.generation.embedding_models import embedding_model_info

ROOT_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"

LogLevel = Literal["critical", "error", "warning", "info", "debug"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Tests run hermetically and never read a developer's .env.
        env_file=None if os.getenv("NODE_ENV") == "test" else ROOT_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",  # the root .env also holds API/web variables
    )

    node_env: Literal["development", "test", "production"] = "development"
    ai_port: Annotated[int, Field(ge=1, le=65535)] = 8000
    log_level: LogLevel = "info"

    # Shared secret the API sends as X-Internal-Key. Generate with: openssl rand -hex 32
    internal_api_key: Annotated[SecretStr, Field(min_length=32)]

    llm_provider: Literal["openai", "ollama"] = "openai"
    openai_api_key: SecretStr | None = None
    openai_chat_model: str = "gpt-4o-mini"
    openai_embed_model: str = "text-embedding-3-small"
    ollama_base_url: str = "http://localhost:11434"
    ollama_chat_model: str = "llama3.1:8b"
    ollama_embed_model: str = "nomic-embed-text"

    pinecone_api_key: SecretStr | None = None
    pinecone_index: str = "coursecraft-te3s"

    # Per-call limits for model requests.
    llm_timeout_s: Annotated[float, Field(gt=0, le=600)] = 120
    llm_max_retries: Annotated[int, Field(ge=0, le=10)] = 2

    whisper_model: str = "base"
    rag_top_k: Annotated[int, Field(ge=1, le=50)] = 6
    rag_min_score: Annotated[float, Field(ge=0, le=1)] = 0.35
    cli_max: Annotated[float, Field(ge=0, le=100)] = 60

    @field_validator("log_level", mode="before")
    @classmethod
    def _lowercase_level(cls, value: object) -> object:
        # LOG_LEVEL is shared with the API, which also accepts "warn"/"trace"/"silent".
        aliases = {"warn": "warning", "trace": "debug", "fatal": "critical", "silent": "critical"}
        if isinstance(value, str):
            value = value.lower()
            return aliases.get(value, value)
        return value

    @field_validator("openai_api_key", "pinecone_api_key", mode="before")
    @classmethod
    def _empty_as_none(cls, value: object) -> object:
        # `.env.example` ships these as empty strings until the keys are provided.
        return None if value == "" else value

    @model_validator(mode="after")
    def _index_matches_embedding_model(self) -> "Settings":
        # Vectors of different sizes can't share an index; catch the mix-up at startup.
        info = embedding_model_info(self.embed_model)
        if not self.pinecone_index.endswith(f"-{info.index_suffix}"):
            raise ValueError(
                f"PINECONE_INDEX '{self.pinecone_index}' doesn't match embedding model "
                f"'{self.embed_model}' ({info.dimension}-d): its name must end with "
                f"'-{info.index_suffix}' (e.g. coursecraft-{info.index_suffix})"
            )
        return self

    @property
    def embedding_dimension(self) -> int:
        return embedding_model_info(self.embed_model).dimension

    @property
    def chat_model(self) -> str:
        return self.openai_chat_model if self.llm_provider == "openai" else self.ollama_chat_model

    @property
    def embed_model(self) -> str:
        return self.openai_embed_model if self.llm_provider == "openai" else self.ollama_embed_model

    @property
    def llm_configured(self) -> bool:
        """Whether the selected provider has what it needs (no network call)."""
        return self.llm_provider == "ollama" or self.openai_api_key is not None

    @property
    def vector_store_configured(self) -> bool:
        return self.pinecone_api_key is not None


@lru_cache
def get_settings() -> Settings:
    try:
        return Settings()  # required fields come from the environment
    except ValidationError as exc:
        problems = "\n".join(
            f"  - {'.'.join(str(p) for p in err['loc']).upper() or 'CONFIG'}: {err['msg']}"
            for err in exc.errors()
        )
        raise RuntimeError(
            f"Invalid environment configuration:\n{problems}\nSee .env.example."
        ) from None
