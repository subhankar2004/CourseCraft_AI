import os

# Must run before `app` is imported: tests never read the developer's .env (see app/config.py).
os.environ["NODE_ENV"] = "test"
os.environ.setdefault("INTERNAL_API_KEY", "test-internal-key-that-is-at-least-32-characters")
os.environ.setdefault("LOG_LEVEL", "warning")

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from hypothesis import settings as hypothesis_settings

from app.config import Settings
from app.main import create_app

INTERNAL_KEY = os.environ["INTERNAL_API_KEY"]

# Property-based tests: fast by default; HYPOTHESIS_PROFILE=thorough for a deep run.
hypothesis_settings.register_profile("default", max_examples=150, deadline=None)
hypothesis_settings.register_profile("thorough", max_examples=2000, deadline=None)
hypothesis_settings.load_profile(os.getenv("HYPOTHESIS_PROFILE", "default"))


def make_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {"internal_api_key": INTERNAL_KEY, **overrides}
    return Settings(_env_file=None, **values)  # type: ignore[arg-type]


@pytest.fixture
def settings() -> Settings:
    return make_settings()


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings), raise_server_exceptions=False) as test_client:
        yield test_client
