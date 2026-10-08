"""Exception handlers producing the same error body as the NestJS API."""

import logging
from collections.abc import Mapping
from datetime import UTC, datetime
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.request_context import REQUEST_ID_HEADER, request_id_var
from app.schemas import ErrorResponse

logger = logging.getLogger("app.errors")


def _error_response(
    request: Request,
    status_code: int,
    message: str | list[str],
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    # request.state survives into the outermost (500) handler; the contextvar may not.
    request_id = getattr(request.state, "request_id", None) or request_id_var.get()
    body = ErrorResponse(
        status_code=status_code,
        error=HTTPStatus(status_code).phrase,
        message=message,
        path=request.url.path,
        timestamp=datetime.now(UTC).isoformat(),
        request_id=request_id,
    )
    response_headers = dict(headers or {})
    if request_id:
        response_headers[REQUEST_ID_HEADER] = request_id
    return JSONResponse(
        body.model_dump(by_alias=True), status_code=status_code, headers=response_headers
    )


async def http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, StarletteHTTPException):  # narrows the type for mypy
        raise exc
    return _error_response(request, exc.status_code, str(exc.detail), exc.headers)


async def validation_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, RequestValidationError):
        raise exc
    messages = [
        f"{'.'.join(str(part) for part in err['loc'])}: {err['msg']}" for err in exc.errors()
    ]
    return _error_response(request, HTTPStatus.UNPROCESSABLE_ENTITY, messages)


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Logged with the stack trace, never leaked to the caller.
    logger.exception("Unhandled error", exc_info=exc)
    return _error_response(request, HTTPStatus.INTERNAL_SERVER_ERROR, "Internal server error")


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
