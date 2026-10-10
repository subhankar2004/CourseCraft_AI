"""Known embedding models: vector size, storage suffix and task prefixes.

Vectors of different sizes can't share an index or a table, so each embedding model gets its
own: the pgvector table `vector_store.chunks_<suffix>` (e.g. `chunks_nomic`), or with Pinecone
the index `<prefix>-<suffix>` (validated in app.config).
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class EmbeddingModelInfo:
    dimension: int
    index_suffix: str
    #: Task prefixes some models are trained with (nomic-embed-text needs them for good retrieval).
    document_prefix: str = ""
    query_prefix: str = ""


EMBEDDING_MODELS: dict[str, EmbeddingModelInfo] = {
    # OpenAI
    "text-embedding-3-small": EmbeddingModelInfo(dimension=1536, index_suffix="te3s"),
    "text-embedding-3-large": EmbeddingModelInfo(dimension=3072, index_suffix="te3l"),
    # Ollama
    "nomic-embed-text": EmbeddingModelInfo(
        dimension=768,
        index_suffix="nomic",
        document_prefix="search_document: ",
        query_prefix="search_query: ",
    ),
    "mxbai-embed-large": EmbeddingModelInfo(
        dimension=1024,
        index_suffix="mxbai",
        query_prefix="Represent this sentence for searching relevant passages: ",
    ),
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
