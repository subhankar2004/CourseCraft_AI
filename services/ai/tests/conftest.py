import os

# Must run before `app` is imported: tests never read the developer's .env (see app/config.py).
os.environ["NODE_ENV"] = "test"
os.environ.setdefault("INTERNAL_API_KEY", "test-internal-key-that-is-at-least-32-characters")
os.environ.setdefault("LOG_LEVEL", "warning")

from collections.abc import Callable, Iterator
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient
from hypothesis import settings as hypothesis_settings
from psycopg import sql

from app.config import Settings
from app.main import create_app
from app.processing.vector_store import PgVectorStore

INTERNAL_KEY = os.environ["INTERNAL_API_KEY"]

# Property-based tests: fast by default; HYPOTHESIS_PROFILE=thorough for a deep run.
hypothesis_settings.register_profile("default", max_examples=150, deadline=None)
hypothesis_settings.register_profile("thorough", max_examples=2000, deadline=None)
hypothesis_settings.load_profile(os.getenv("HYPOTHESIS_PROFILE", "default"))


def make_settings(**overrides: object) -> Settings:
    # Database URLs are pinned too, so an exported DATABASE_URL can't change test results.
    values: dict[str, object] = {
        "internal_api_key": INTERNAL_KEY,
        "database_url": None,
        "vector_database_url": None,
        **overrides,
    }
    return Settings(_env_file=None, **values)  # type: ignore[arg-type]


@pytest.fixture
def settings() -> Settings:
    return make_settings()


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings), raise_server_exceptions=False) as test_client:
        yield test_client


# ─── PostgreSQL (pgvector) for vector-store tests ───────────────────────────


def _test_database_url() -> str | None:
    """TEST_DATABASE_URL from the environment (CI), else from the repo-root .env (local dev)."""
    if url := os.getenv("TEST_DATABASE_URL"):
        return url
    env_file = Path(__file__).resolve().parents[3] / ".env"
    if env_file.is_file():
        for line in env_file.read_text().splitlines():
            key, _, value = line.partition("=")
            if key.strip() == "TEST_DATABASE_URL" and value.strip():
                return value.strip()
    return None


@pytest.fixture(scope="session")
def vector_db_url() -> str:
    """The test database. Skipped when unavailable, unless REQUIRE_DB_TESTS=1 (CI) makes it fail."""
    url = _test_database_url()
    problem = "TEST_DATABASE_URL is not set" if url is None else None
    if url is not None:
        try:
            psycopg.connect(url, connect_timeout=3).close()
        except psycopg.OperationalError as error:
            problem = f"test database unreachable: {error}"
    if problem is not None:
        if os.getenv("REQUIRE_DB_TESTS") == "1":
            pytest.fail(problem)
        pytest.skip(problem)
    assert url is not None
    return url


@pytest.fixture
def make_store(vector_db_url: str) -> Iterator[Callable[[int], PgVectorStore]]:
    """Builds stores on throw-away tables (unique suffix), dropped after the test."""
    suffix = f"test_{uuid4().hex[:12]}"
    stores: list[PgVectorStore] = []

    def build(dimension: int) -> PgVectorStore:
        store = PgVectorStore(vector_db_url, table_suffix=suffix, dimension=dimension)
        stores.append(store)
        return store

    yield build
    for store in stores:
        store.close()
    with psycopg.connect(vector_db_url, autocommit=True) as conn:
        conn.execute(
            sql.SQL("DROP TABLE IF EXISTS {}").format(
                sql.Identifier("vector_store", f"chunks_{suffix}")
            )
        )
