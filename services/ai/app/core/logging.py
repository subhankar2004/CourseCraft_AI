"""Structured JSON logging with the request id attached to every record.

The request id is captured when a record is CREATED (log-record factory), not when it is
formatted, so it stays correct even if a handler formats the record later or on another thread.
"""

import json
import logging
from datetime import UTC, datetime

from app.core.request_context import request_id_var

_base_factory = logging.getLogRecordFactory()


def _record_with_request_id(*args: object, **kwargs: object) -> logging.LogRecord:
    record = _base_factory(*args, **kwargs)
    record.request_id = request_id_var.get()
    return record


logging.setLogRecordFactory(_record_with_request_id)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, object] = {
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        request_id = getattr(record, "request_id", None)
        if request_id:
            entry["requestId"] = request_id
        extra = getattr(record, "fields", None)
        if isinstance(extra, dict):
            entry.update(extra)
        if record.exc_info:
            entry["err"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    # Our middleware logs each request; uvicorn's access log would duplicate it.
    logging.getLogger("uvicorn.access").disabled = True
