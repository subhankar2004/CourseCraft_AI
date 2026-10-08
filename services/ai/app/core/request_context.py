"""Per-request correlation id (`x-request-id`), shared with the API for cross-service tracing."""

import re
import uuid
from contextvars import ContextVar

REQUEST_ID_HEADER = "x-request-id"
# Accept a caller-provided id only if it is short and safe to log (same rule as the API).
_VALID_REQUEST_ID = re.compile(r"^[\w.-]{1,128}$")

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)


def resolve_request_id(incoming: str | None) -> str:
    if incoming and _VALID_REQUEST_ID.fullmatch(incoming):
        return incoming
    return str(uuid.uuid4())
