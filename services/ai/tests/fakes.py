"""Offline stand-ins for embedding models."""

import math

from langchain_core.embeddings import Embeddings

from app.generation.embedding_models import EmbeddingModelInfo

#: A tiny "semantic" space: one dimension per topic word, so cosine similarity is meaningful
#: (unlike random fake embeddings) and search results can be asserted.
VOCABULARY = ("join", "index", "transaction", "normalization", "graph", "tree", "sort", "hash")

KEYWORD_MODEL = EmbeddingModelInfo(
    dimension=len(VOCABULARY), index_suffix="kw", document_prefix="doc: ", query_prefix="q: "
)


class KeywordEmbeddings(Embeddings):
    """Bag-of-words over VOCABULARY, L2-normalised. Records every call for assertions."""

    def __init__(self) -> None:
        self.document_calls: list[list[str]] = []
        self.query_calls: list[str] = []

    @staticmethod
    def vector(text: str) -> list[float]:
        words = text.lower().replace(".", " ").replace(",", " ").split()
        counts = [float(words.count(term)) for term in VOCABULARY]
        norm = math.sqrt(sum(c * c for c in counts))
        # A text with no vocabulary word gets a fixed non-zero vector (cosine needs a norm).
        return [c / norm for c in counts] if norm else [1.0 / math.sqrt(len(counts))] * len(counts)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        self.document_calls.append(list(texts))
        return [self.vector(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        self.query_calls.append(text)
        return self.vector(text)


class FailingEmbeddings(Embeddings):
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        raise ConnectionError("Failed to connect to Ollama")

    def embed_query(self, text: str) -> list[float]:
        raise ConnectionError("Failed to connect to Ollama")
