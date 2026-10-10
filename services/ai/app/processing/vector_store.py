"""Chunk vectors in PostgreSQL with pgvector (SPEC §6, §7.1 step 4).

Layout:
- Schema `vector_store`, owned by this service (the API's Prisma schema is `public`, so the two
  never collide and the API remains the only writer of the application tables).
- One table per embedding model, `vector_store.chunks_<suffix>`: a vector column has a fixed
  dimension, so different models can't share a table (same rule as one Pinecone index each).
- `course_id` scopes every query: the "course-aware" property of the RAG chatbot (D2).

Search is EXACT cosine similarity within one course: a course holds hundreds of chunks, not
millions, so a scan of its rows is fast and has perfect recall. An approximate index (HNSW) can
be added later if courses grow very large.

Every value is a bound parameter and identifiers are composed with `psycopg.sql.Identifier`
(quoted by the driver), so no SQL is built from strings.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from pgvector import Vector
from pgvector.psycopg import register_vector
from psycopg import Connection, sql
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

SCHEMA = "vector_store"
_SAFE_SUFFIX = re.compile(r"^[a-z0-9_]{1,40}$")


class VectorStoreError(RuntimeError):
    pass


@dataclass(frozen=True)
class VectorRecord:
    id: str  # == Chunk.id in the API database, e.g. "<lessonRef>-<index>"
    course_id: str
    module_id: str
    lesson_id: str
    video_id: str
    youtube_id: str
    chunk_index: int
    start_sec: float
    end_sec: float
    lesson_title: str
    text: str
    token_count: int
    embedding: Sequence[float]


@dataclass(frozen=True)
class SearchHit:
    id: str
    course_id: str
    module_id: str
    lesson_id: str
    video_id: str
    youtube_id: str
    chunk_index: int
    start_sec: float
    end_sec: float
    lesson_title: str
    text: str
    #: Cosine similarity in [-1, 1]; higher is closer.
    score: float


class VectorStore(Protocol):
    """What the indexing layer needs from a store (PgVectorStore; an in-memory one in tests)."""

    dimension: int

    def replace_lesson(
        self, course_id: str, lesson_id: str, records: Sequence[VectorRecord]
    ) -> int: ...
    def delete_course(self, course_id: str) -> int: ...
    def search(self, course_id: str, embedding: Sequence[float], k: int) -> list[SearchHit]: ...
    def count(self, course_id: str) -> int: ...
    def close(self) -> None: ...


def _configure(connection: Connection[Any]) -> None:
    register_vector(connection)


class PgVectorStore:
    def __init__(
        self, conninfo: str, *, table_suffix: str, dimension: int, pool_size: int = 4
    ) -> None:
        if not _SAFE_SUFFIX.fullmatch(table_suffix):
            raise ValueError(f"unsafe table suffix {table_suffix!r}")
        self.table = f"{SCHEMA}.chunks_{table_suffix}"
        self._table = sql.Identifier(SCHEMA, f"chunks_{table_suffix}")
        self._index = sql.Identifier(f"chunks_{table_suffix}_course_lesson_idx")
        self.dimension = dimension
        self._conninfo = conninfo
        self._pool_size = pool_size
        self._pool: ConnectionPool[Connection[Any]] | None = None

    # ─── lifecycle ──────────────────────────────────────────────────────────

    def _connections(self) -> ConnectionPool[Connection[Any]]:
        if self._pool is None:
            self._bootstrap()
            self._pool = ConnectionPool(
                self._conninfo,
                min_size=1,
                max_size=self._pool_size,
                configure=_configure,
                open=True,
                timeout=10,
            )
        return self._pool

    def close(self) -> None:
        if self._pool is not None:
            self._pool.close()
            self._pool = None

    def _bootstrap(self) -> None:
        """Creates the extension, schema and table if missing (idempotent); checks the dimension."""
        with Connection.connect(self._conninfo, autocommit=True) as conn:
            conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
            conn.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(sql.Identifier(SCHEMA)))
            conn.execute(
                sql.SQL("""
                CREATE TABLE IF NOT EXISTS {table} (
                    id           text PRIMARY KEY,
                    course_id    text NOT NULL,
                    module_id    text NOT NULL,
                    lesson_id    text NOT NULL,
                    video_id     text NOT NULL,
                    youtube_id   text NOT NULL,
                    chunk_index  integer NOT NULL,
                    start_sec    double precision NOT NULL,
                    end_sec      double precision NOT NULL,
                    lesson_title text NOT NULL,
                    text         text NOT NULL,
                    token_count  integer NOT NULL,
                    embedding    vector({dimension}) NOT NULL,
                    updated_at   timestamptz NOT NULL DEFAULT now()
                )
                """).format(table=self._table, dimension=sql.Literal(self.dimension))
            )
            conn.execute(
                sql.SQL(
                    "CREATE INDEX IF NOT EXISTS {index} ON {table} (course_id, lesson_id)"
                ).format(index=self._index, table=self._table)
            )
            row = conn.execute(
                """
                SELECT format_type(a.atttypid, a.atttypmod)
                FROM pg_attribute a
                WHERE a.attrelid = %s::regclass AND a.attname = 'embedding'
                """,
                (self.table,),
            ).fetchone()
        expected = f"vector({self.dimension})"
        if row is None or row[0] != expected:
            raise VectorStoreError(
                f"{self.table} stores {row[0] if row else 'unknown'}, but the embedding model "
                f"produces {expected}; use a matching model or a new table"
            )

    # ─── writes ─────────────────────────────────────────────────────────────

    def replace_lesson(
        self, course_id: str, lesson_id: str, records: Sequence[VectorRecord]
    ) -> int:
        """Atomically replaces a lesson's vectors (re-processing never leaves stale chunks)."""
        for record in records:
            self._check(record, course_id, lesson_id)
        with self._connections().connection() as conn, conn.transaction():
            conn.execute(
                sql.SQL("DELETE FROM {} WHERE course_id = %s AND lesson_id = %s").format(
                    self._table
                ),
                (course_id, lesson_id),
            )
            with conn.cursor() as cur:
                cur.executemany(
                    sql.SQL("""
                    INSERT INTO {} (id, course_id, module_id, lesson_id, video_id, youtube_id,
                        chunk_index, start_sec, end_sec, lesson_title, text, token_count,
                        embedding)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET
                        course_id = EXCLUDED.course_id, module_id = EXCLUDED.module_id,
                        lesson_id = EXCLUDED.lesson_id, video_id = EXCLUDED.video_id,
                        youtube_id = EXCLUDED.youtube_id, chunk_index = EXCLUDED.chunk_index,
                        start_sec = EXCLUDED.start_sec, end_sec = EXCLUDED.end_sec,
                        lesson_title = EXCLUDED.lesson_title, text = EXCLUDED.text,
                        token_count = EXCLUDED.token_count, embedding = EXCLUDED.embedding,
                        updated_at = now()
                    """).format(self._table),
                    [
                        (
                            r.id,
                            r.course_id,
                            r.module_id,
                            r.lesson_id,
                            r.video_id,
                            r.youtube_id,
                            r.chunk_index,
                            r.start_sec,
                            r.end_sec,
                            r.lesson_title,
                            r.text,
                            r.token_count,
                            Vector(list(r.embedding)),
                        )
                        for r in records
                    ],
                )
        return len(records)

    def delete_course(self, course_id: str) -> int:
        with self._connections().connection() as conn:
            result = conn.execute(
                sql.SQL("DELETE FROM {} WHERE course_id = %s").format(self._table), (course_id,)
            )
            return result.rowcount

    def _check(self, record: VectorRecord, course_id: str, lesson_id: str) -> None:
        if (record.course_id, record.lesson_id) != (course_id, lesson_id):
            raise ValueError(f"record {record.id} belongs to a different course or lesson")
        if len(record.embedding) != self.dimension:
            raise ValueError(
                f"record {record.id} has {len(record.embedding)} dimensions, "
                f"expected {self.dimension}"
            )

    # ─── reads ──────────────────────────────────────────────────────────────

    def search(self, course_id: str, embedding: Sequence[float], k: int) -> list[SearchHit]:
        """The `k` chunks of one course closest to `embedding` (exact cosine similarity)."""
        if len(embedding) != self.dimension:
            raise ValueError(f"query has {len(embedding)} dimensions, expected {self.dimension}")
        query = Vector(list(embedding))
        with self._connections().connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                sql.SQL("""
                SELECT id, course_id, module_id, lesson_id, video_id, youtube_id, chunk_index,
                       start_sec, end_sec,
                       lesson_title, text, 1 - (embedding <=> %s) AS score
                FROM {}
                WHERE course_id = %s
                ORDER BY embedding <=> %s, chunk_index
                LIMIT %s
                """).format(self._table),
                (query, course_id, query, k),
            )
            return [SearchHit(**row) for row in cur.fetchall()]

    def count(self, course_id: str) -> int:
        with self._connections().connection() as conn:
            row = conn.execute(
                sql.SQL("SELECT count(*) FROM {} WHERE course_id = %s").format(self._table),
                (course_id,),
            ).fetchone()
        return int(row[0]) if row else 0
