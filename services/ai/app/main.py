"""FastAPI application for the CourseCraft AI pipeline service.

Run locally:  uv run uvicorn app.main:app --reload --port 8000
"""

import logging
import time
from collections.abc import Awaitable, Callable

from fastapi import APIRouter, Depends, FastAPI, Request, Response

from app import __version__
from app.api import health
from app.api.deps import require_internal_key
from app.config import Settings, get_settings
from app.core.errors import register_error_handlers
from app.core.logging import configure_logging
from app.core.request_context import REQUEST_ID_HEADER, request_id_var, resolve_request_id

logger = logging.getLogger("app.http")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    docs_enabled = settings.node_env != "production"
    app = FastAPI(
        title="CourseCraft AI Service",
        version=__version__,
        description="Internal AI pipeline. Only the CourseCraft API may call it (SPEC §8.2).",
        docs_url="/docs" if docs_enabled else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )
    app.dependency_overrides[get_settings] = lambda: settings
    register_error_handlers(app)

    @app.middleware("http")
    async def request_context(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = resolve_request_id(request.headers.get(REQUEST_ID_HEADER))
        request.state.request_id = request_id
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        try:
            response = await call_next(request)
            response.headers[REQUEST_ID_HEADER] = request_id
            logger.info(
                "request completed",
                extra={
                    "fields": {
                        "method": request.method,
                        "path": request.url.path,
                        "status": response.status_code,
                        "durationMs": round((time.perf_counter() - started) * 1000, 1),
                    }
                },
            )
            return response
        finally:
            request_id_var.reset(token)

    # Public routes.
    app.include_router(health.router)

    # Every other route must sit on this router so it requires X-Internal-Key.
    # Feature routers (ingest, process, rag, eval) are added here from #17 onwards.
    internal = APIRouter(dependencies=[Depends(require_internal_key)])
    app.include_router(internal)

    return app


app = create_app()
