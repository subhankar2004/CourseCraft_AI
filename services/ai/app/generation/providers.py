"""The one place that decides which LLM and embedding provider to use (SPEC F14).

Everything that calls a model goes through `get_chat_model()` / `get_embeddings()`, so switching
`LLM_PROVIDER` between `openai` and `ollama` needs no code changes. Model names only come from
configuration (AGENTS.md).
"""

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel
from langchain_ollama import ChatOllama, OllamaEmbeddings
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from pydantic import SecretStr

from app.config import Settings
from app.generation.usage import TokenUsageCallback, UsageTotals


class ProviderNotConfiguredError(RuntimeError):
    """The selected provider is missing something it needs (e.g. OPENAI_API_KEY)."""


def _openai_key(settings: Settings) -> SecretStr:
    if settings.openai_api_key is None:
        raise ProviderNotConfiguredError(
            "LLM_PROVIDER=openai but OPENAI_API_KEY is not set (see .env.example)"
        )
    return settings.openai_api_key


def get_chat_model(
    settings: Settings,
    *,
    operation: str,
    temperature: float = 0.2,
    totals: UsageTotals | None = None,
) -> BaseChatModel:
    """A chat model for the configured provider, logging token usage under `operation`."""
    callbacks: list[BaseCallbackHandler] = [
        TokenUsageCallback(operation=operation, model=settings.chat_model, totals=totals)
    ]
    if settings.llm_provider == "openai":
        return ChatOpenAI(
            model=settings.openai_chat_model,
            api_key=_openai_key(settings),
            temperature=temperature,
            timeout=settings.llm_timeout_s,
            max_retries=settings.llm_max_retries,
            stream_usage=True,  # token counts are reported for streamed responses too
            callbacks=callbacks,
        )
    return ChatOllama(
        model=settings.ollama_chat_model,
        base_url=settings.ollama_base_url,
        temperature=temperature,
        callbacks=callbacks,
    )


def get_embeddings(settings: Settings) -> Embeddings:
    """An embedding model for the configured provider (size: `settings.embedding_dimension`)."""
    if settings.llm_provider == "openai":
        return OpenAIEmbeddings(
            model=settings.openai_embed_model,
            openai_api_key=_openai_key(settings),
            request_timeout=settings.llm_timeout_s,
            max_retries=settings.llm_max_retries,
        )
    return OllamaEmbeddings(model=settings.ollama_embed_model, base_url=settings.ollama_base_url)
