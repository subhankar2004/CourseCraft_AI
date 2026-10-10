import pytest
from langchain_ollama import ChatOllama, OllamaEmbeddings
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from pydantic import SecretStr

from app.generation.providers import ProviderNotConfiguredError, get_chat_model, get_embeddings
from app.generation.usage import TokenUsageCallback
from tests.conftest import make_settings


def test_openai_provider_builds_openai_models_from_config() -> None:
    settings = make_settings(openai_api_key="sk-test", openai_chat_model="gpt-test-mini")
    chat = get_chat_model(settings, operation="unit-test", temperature=0)
    assert isinstance(chat, ChatOpenAI)
    assert chat.model_name == "gpt-test-mini"
    assert chat.temperature == 0
    assert chat.max_retries == settings.llm_max_retries
    assert isinstance(chat.openai_api_key, SecretStr)
    assert chat.openai_api_key.get_secret_value() == "sk-test"

    embeddings = get_embeddings(settings)
    assert isinstance(embeddings, OpenAIEmbeddings)
    assert embeddings.model == "text-embedding-3-small"


def test_switching_provider_swaps_models_without_code_changes() -> None:
    settings = make_settings(
        llm_provider="ollama",
        ollama_chat_model="llama-test",
        pinecone_index="coursecraft-nomic",
    )
    chat = get_chat_model(settings, operation="unit-test")
    assert isinstance(chat, ChatOllama)
    assert chat.model == "llama-test"
    assert chat.base_url == settings.ollama_base_url
    embeddings = get_embeddings(settings)
    assert isinstance(embeddings, OllamaEmbeddings)
    assert embeddings.model == "nomic-embed-text"


def test_every_chat_model_logs_token_usage() -> None:
    chat = get_chat_model(make_settings(openai_api_key="sk-test"), operation="notes")
    callbacks = chat.callbacks if isinstance(chat.callbacks, list) else []
    assert any(isinstance(cb, TokenUsageCallback) and cb.operation == "notes" for cb in callbacks)


def test_openai_without_a_key_fails_clearly() -> None:
    settings = make_settings()  # OPENAI_API_KEY unset
    with pytest.raises(ProviderNotConfiguredError, match="OPENAI_API_KEY"):
        get_chat_model(settings, operation="unit-test")
    with pytest.raises(ProviderNotConfiguredError):
        get_embeddings(settings)
