"""Known embedding models: vector size and the Pinecone index suffix that holds them.

Vectors of different sizes can't share a Pinecone index (SPEC §6), so each embedding model gets
its own index, named `<prefix>-<suffix>` (e.g. `coursecraft-te3s`). Config validation (app.config)
refuses a PINECONE_INDEX that doesn't match the configured embedding model.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class EmbeddingModelInfo:
    dimension: int
    index_suffix: str


EMBEDDING_MODELS: dict[str, EmbeddingModelInfo] = {
    # OpenAI
    "text-embedding-3-small": EmbeddingModelInfo(dimension=1536, index_suffix="te3s"),
    "text-embedding-3-large": EmbeddingModelInfo(dimension=3072, index_suffix="te3l"),
    # Ollama
    "nomic-embed-text": EmbeddingModelInfo(dimension=768, index_suffix="nomic"),
    "mxbai-embed-large": EmbeddingModelInfo(dimension=1024, index_suffix="mxbai"),
}


def embedding_model_info(model: str) -> EmbeddingModelInfo:
    try:
        return EMBEDDING_MODELS[model]
    except KeyError:
        supported = ", ".join(sorted(EMBEDDING_MODELS))
        raise ValueError(
            f"Unknown embedding model '{model}'. Supported: {supported} "
            "(add it to app/generation/embedding_models.py with its dimension)."
        ) from None
