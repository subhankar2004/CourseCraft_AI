import pytest
from pydantic import ValidationError

from tests.conftest import make_settings


def test_defaults() -> None:
    settings = make_settings()
    assert settings.llm_provider == "openai"
    assert settings.chat_model == "gpt-4o-mini"
    assert settings.embed_model == "text-embedding-3-small"
    assert settings.rag_top_k == 6
    assert settings.ai_port == 8000


def test_empty_keys_from_env_example_mean_not_configured() -> None:
    settings = make_settings(openai_api_key="", pinecone_api_key="")
    assert settings.openai_api_key is None
    assert settings.llm_configured is False
    assert settings.vector_store_configured is False


def test_ollama_needs_no_api_key() -> None:
    settings = make_settings(llm_provider="ollama")
    assert settings.llm_configured is True
    assert settings.chat_model == "llama3.1:8b"
    assert settings.embed_model == "nomic-embed-text"


def test_shared_log_level_names_from_the_api_are_accepted() -> None:
    assert make_settings(log_level="WARN").log_level == "warning"
    assert make_settings(log_level="silent").log_level == "critical"


def test_secrets_are_masked_in_repr() -> None:
    settings = make_settings(openai_api_key="sk-very-secret")
    assert "sk-very-secret" not in repr(settings)


@pytest.mark.parametrize(
    "overrides",
    [
        {"internal_api_key": "change-me"},  # placeholder from .env.example / too short
        {"llm_provider": "gemini"},
        {"rag_min_score": 1.5},
        {"rag_top_k": 0},
    ],
)
def test_invalid_values_fail_fast(overrides: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        make_settings(**overrides)
