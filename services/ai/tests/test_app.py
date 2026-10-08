from collections.abc import Iterator

import pytest
from fastapi import APIRouter, Depends
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.api.deps import INTERNAL_KEY_HEADER, require_internal_key
from app.config import Settings
from app.main import create_app
from tests.conftest import INTERNAL_KEY, make_settings


class EchoBody(BaseModel):
    name: str
    count: int


# Test-only protected routes, mounted the same way feature routers will be.
probe = APIRouter(dependencies=[Depends(require_internal_key)])


@probe.get("/probe")
def get_probe() -> dict[str, str]:
    return {"ok": "yes"}


@probe.post("/probe/echo")
def echo(body: EchoBody) -> EchoBody:
    return body


@probe.get("/probe/boom")
def boom() -> None:
    raise RuntimeError("secret internal detail")


@pytest.fixture
def probe_client(settings: Settings) -> Iterator[TestClient]:
    app = create_app(settings)
    app.include_router(probe)
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


def auth(key: str = INTERNAL_KEY) -> dict[str, str]:
    return {INTERNAL_KEY_HEADER: key}


class TestHealth:
    def test_is_public_and_reports_providers(self, client: TestClient) -> None:
        res = client.get("/health")
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "ok"
        assert body["service"] == "coursecraft-ai"
        assert body["providers"]["llm"] == {
            "provider": "openai",
            "chatModel": "gpt-4o-mini",
            "embeddingModel": "text-embedding-3-small",
            "configured": False,
        }
        assert body["providers"]["vectorStore"]["configured"] is False

    def test_reflects_ollama_provider(self) -> None:
        app = create_app(make_settings(llm_provider="ollama"))
        with TestClient(app) as test_client:
            llm = test_client.get("/health").json()["providers"]["llm"]
        assert llm["provider"] == "ollama"
        assert llm["configured"] is True

    def test_never_exposes_secrets(self) -> None:
        app = create_app(make_settings(openai_api_key="sk-secret-value"))
        with TestClient(app) as test_client:
            res = test_client.get("/health")
        assert res.json()["providers"]["llm"]["configured"] is True
        assert "sk-secret-value" not in res.text


class TestInternalKey:
    def test_missing_key_is_rejected(self, probe_client: TestClient) -> None:
        res = probe_client.get("/probe")
        assert res.status_code == 401
        assert res.json()["message"] == "Invalid or missing internal API key"

    def test_wrong_key_is_rejected(self, probe_client: TestClient) -> None:
        assert probe_client.get("/probe", headers=auth("x" * 40)).status_code == 401

    def test_correct_key_is_accepted(self, probe_client: TestClient) -> None:
        res = probe_client.get("/probe", headers=auth())
        assert res.status_code == 200
        assert res.json() == {"ok": "yes"}

    def test_every_non_public_route_requires_the_key(self, settings: Settings) -> None:
        # Checked through the public OpenAPI schema: protected operations declare the
        # X-Internal-Key security scheme. Includes the probe routes to prove the check works.
        app = create_app(settings)
        app.include_router(probe)
        operations = [
            (path, op)
            for path, item in app.openapi()["paths"].items()
            for op in item.values()
            if path != "/health"
        ]
        assert operations, "expected at least the probe routes"
        for path, op in operations:
            assert {"APIKeyHeader": []} in op.get("security", []), f"{path} is not protected"

    def test_health_does_not_require_the_key(self, client: TestClient) -> None:
        op = client.app.openapi()["paths"]["/health"]["get"]  # type: ignore[attr-defined]
        assert "security" not in op


class TestRequestId:
    def test_generated_when_absent(self, client: TestClient) -> None:
        assert len(client.get("/health").headers["x-request-id"]) == 36

    def test_propagated_from_the_api(self, client: TestClient) -> None:
        res = client.get("/health", headers={"x-request-id": "trace-abc.123"})
        assert res.headers["x-request-id"] == "trace-abc.123"

    def test_unsafe_value_replaced(self, client: TestClient) -> None:
        res = client.get("/health", headers={"x-request-id": "bad id<script>"})
        assert res.headers["x-request-id"] != "bad id<script>"


class TestErrorShape:
    def test_not_found_matches_the_api_shape(self, client: TestClient) -> None:
        res = client.get("/nope", headers={"x-request-id": "rid-1"})
        assert res.status_code == 404
        body = res.json()
        assert body["statusCode"] == 404
        assert body["error"] == "Not Found"
        assert body["path"] == "/nope"
        assert body["requestId"] == "rid-1"
        assert "timestamp" in body

    def test_validation_errors_list_each_field(self, probe_client: TestClient) -> None:
        res = probe_client.post("/probe/echo", headers=auth(), json={"name": 1})
        assert res.status_code == 422
        messages = res.json()["message"]
        assert any("name" in m for m in messages)
        assert any("count" in m for m in messages)

    def test_internal_errors_are_hidden(self, probe_client: TestClient) -> None:
        res = probe_client.get("/probe/boom", headers=auth() | {"x-request-id": "rid-500"})
        assert res.status_code == 500
        assert res.json()["message"] == "Internal server error"
        assert res.json()["requestId"] == "rid-500"
        assert "secret internal detail" not in res.text


def test_docs_disabled_in_production() -> None:
    app = create_app(make_settings(node_env="production"))
    with TestClient(app) as test_client:
        assert test_client.get("/docs").status_code == 404
        assert test_client.get("/openapi.json").status_code == 404


@pytest.mark.network
def test_network_marker_is_deselected_by_default() -> None:
    raise AssertionError("network tests must be opt-in (uv run pytest -m network)")
