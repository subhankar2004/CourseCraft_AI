"""Shared FastAPI dependencies."""

import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader

from app.config import Settings, get_settings

INTERNAL_KEY_HEADER = "X-Internal-Key"

_internal_key_header = APIKeyHeader(
    name=INTERNAL_KEY_HEADER,
    auto_error=False,
    description="Shared secret sent by the CourseCraft API (INTERNAL_API_KEY).",
)


def require_internal_key(
    provided: Annotated[str | None, Depends(_internal_key_header)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    """Only the CourseCraft API may call this service (SPEC §8.2)."""
    expected = settings.internal_api_key.get_secret_value()
    # Constant-time comparison so the key can't be guessed byte by byte from response timing.
    if provided is None or not secrets.compare_digest(provided.encode(), expected.encode()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing internal API key",
        )
