"""Offline stand-ins for chat and embedding models and the vector store."""

import math
import re
import threading
import zlib
from collections.abc import Callable, Sequence
from typing import Any

from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from pydantic import Field

from app.generation.embedding_models import EmbeddingModelInfo
from app.processing.vector_store import SearchHit, VectorRecord

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


class HashingEmbeddings(Embeddings):
    """Feature-hashed bag of words (lexical similarity) for searching real transcript text
    offline. Deterministic across runs (no Python hash randomisation)."""

    def __init__(self, dimension: int = 256) -> None:
        self.dimension = dimension

    def vector(self, text: str) -> list[float]:
        counts = [0.0] * self.dimension
        for word in re.findall(r"[a-z0-9]+", text.lower()):
            if len(word) > 2:  # skip "a", "is", "of" ...
                counts[zlib.crc32(word.encode()) % self.dimension] += 1.0
        norm = math.sqrt(sum(c * c for c in counts)) or 1.0
        return [c / norm for c in counts]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self.vector(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self.vector(text)


HASHING_MODEL = EmbeddingModelInfo(dimension=256, index_suffix="hash")


class InMemoryVectorStore:
    """Same contract as PgVectorStore (cosine similarity, course scoping, lesson replacement,
    ties by chunk order), for tests that don't need PostgreSQL."""

    def __init__(self, dimension: int) -> None:
        self.dimension = dimension
        self.rows: dict[str, VectorRecord] = {}

    def replace_lesson(
        self, course_id: str, lesson_id: str, records: Sequence[VectorRecord]
    ) -> int:
        for record in records:
            if (record.course_id, record.lesson_id) != (course_id, lesson_id):
                raise ValueError(f"record {record.id} belongs to a different course or lesson")
            if len(record.embedding) != self.dimension:
                raise ValueError(f"record {record.id} has the wrong number of dimensions")
        self.rows = {
            k: r
            for k, r in self.rows.items()
            if (r.course_id, r.lesson_id) != (course_id, lesson_id)
        }
        self.rows.update({r.id: r for r in records})
        return len(records)

    def delete_course(self, course_id: str) -> int:
        doomed = [k for k, r in self.rows.items() if r.course_id == course_id]
        for key in doomed:
            del self.rows[key]
        return len(doomed)

    def delete_lesson(self, course_id: str, lesson_id: str) -> int:
        doomed = [
            k for k, r in self.rows.items() if (r.course_id, r.lesson_id) == (course_id, lesson_id)
        ]
        for key in doomed:
            del self.rows[key]
        return len(doomed)

    def search(self, course_id: str, embedding: Sequence[float], k: int) -> list[SearchHit]:
        def cosine(a: Sequence[float], b: Sequence[float]) -> float:
            dot = sum(x * y for x, y in zip(a, b, strict=True))
            return dot / (math.sqrt(sum(x * x for x in a) * sum(y * y for y in b)) or 1.0)

        scored = sorted(
            (
                (cosine(r.embedding, embedding), r)
                for r in self.rows.values()
                if r.course_id == course_id
            ),
            key=lambda pair: (-pair[0], pair[1].chunk_index),
        )
        return [
            SearchHit(
                **{f: getattr(r, f) for f in SearchHit.__dataclass_fields__ if f != "score"},
                score=score,
            )
            for score, r in scored[:k]
        ]

    def count(self, course_id: str) -> int:
        return sum(1 for r in self.rows.values() if r.course_id == course_id)

    def close(self) -> None:
        pass


class ScriptedChatModel(BaseChatModel):
    """A chat model whose reply is computed from the prompt by `reply` (snapshot-style tests).

    Records every prompt; thread-safe, so it works with batched (parallel) calls.
    """

    reply: Callable[[str], str]
    prompts: list[str] = Field(default_factory=list)
    lock: Any = Field(default_factory=threading.Lock)

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        prompt = "\n".join(str(m.content) for m in messages)
        with self.lock:
            self.prompts.append(prompt)
        text = self.reply(prompt)
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content=text))])
