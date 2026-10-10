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
    assert settings.vector_store == "pgvector"
    assert settings.vector_table == "vector_store.chunks_te3s"


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


def test_embedding_dimension_follows_the_model() -> None:
    assert make_settings().embedding_dimension == 1536
    ollama = make_settings(llm_provider="ollama")
    assert ollama.embedding_dimension == 768


def test_pgvector_table_follows_the_embedding_model() -> None:
    # One table per model: a vector column has a fixed dimension.
    assert make_settings(llm_provider="ollama").vector_table == "vector_store.chunks_nomic"


def test_pgvector_uses_database_url_unless_a_separate_one_is_set() -> None:
    assert make_settings().vector_store_configured is False
    shared = make_settings(database_url="postgresql://u:p@localhost:5432/app")
    assert shared.vector_db_url == "postgresql://u:p@localhost:5432/app"
    assert shared.vector_store_configured is True
    separate = make_settings(
        database_url="postgresql://u:p@localhost:5432/app",
        vector_database_url="postgresql://u:p@vectors:5432/v",
    )
    assert separate.vector_db_url == "postgresql://u:p@vectors:5432/v"
    assert "u:p@" not in repr(separate)  # secrets: the URLs hold passwords


def test_pinecone_index_must_match_the_embedding_model() -> None:
    # Switching to Ollama (768-d) while keeping the OpenAI (1536-d) index would corrupt search.
    with pytest.raises(ValidationError, match="must end with '-nomic'"):
        make_settings(vector_store="pinecone", llm_provider="ollama")
    assert make_settings(vector_store="pinecone").vector_table == "coursecraft-te3s"
    with pytest.raises(ValidationError, match="Unknown embedding model"):
        make_settings(openai_embed_model="text-embedding-ada-002")


def test_chunk_overlap_must_be_smaller_than_chunk() -> None:
    assert make_settings().chunk_target_tokens == 800
    with pytest.raises(ValidationError, match="CHUNK_OVERLAP_TOKENS"):
        make_settings(chunk_target_tokens=200, chunk_overlap_tokens=200)


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
        {"vector_store": "chroma"},
    ],
)
def test_invalid_values_fail_fast(overrides: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        make_settings(**overrides)
