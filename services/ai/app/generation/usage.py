"""Token-usage accounting for every model call (cost control, SPEC §11).

`TokenUsageCallback` is attached to each chat model by the provider factory. It logs one JSON line
per call (with the request id from app.core.request_context) and can add to a shared
`UsageTotals`, so a whole ingestion job's usage can be reported (#27).
"""

import logging
from dataclasses import dataclass
from threading import Lock
from typing import Any
from uuid import UUID

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.messages import BaseMessage
from langchain_core.outputs import ChatGeneration, LLMResult

logger = logging.getLogger("app.llm.usage")


@dataclass
class TokenCounts:
    input_tokens: int = 0
    output_tokens: int = 0

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


class UsageTotals:
    """Thread-safe running totals across many calls (e.g. one ingestion job)."""

    def __init__(self) -> None:
        self._lock = Lock()
        self.calls = 0
        self.counts = TokenCounts()

    def add(self, counts: TokenCounts) -> None:
        with self._lock:
            self.calls += 1
            self.counts.input_tokens += counts.input_tokens
            self.counts.output_tokens += counts.output_tokens


def extract_usage(response: LLMResult) -> TokenCounts | None:
    """Token counts from a chat result: standard `usage_metadata`, else OpenAI's `token_usage`."""
    counts = TokenCounts()
    found = False
    for generations in response.generations:
        for generation in generations:
            message: BaseMessage | None = (
                generation.message if isinstance(generation, ChatGeneration) else None
            )
            usage = getattr(message, "usage_metadata", None)
            if usage:
                counts.input_tokens += int(usage.get("input_tokens", 0))
                counts.output_tokens += int(usage.get("output_tokens", 0))
                found = True
    if not found and response.llm_output:
        token_usage = response.llm_output.get("token_usage") or {}
        if token_usage:
            counts.input_tokens = int(token_usage.get("prompt_tokens", 0))
            counts.output_tokens = int(token_usage.get("completion_tokens", 0))
            found = True
    return counts if found else None


class TokenUsageCallback(BaseCallbackHandler):
    def __init__(self, *, operation: str, model: str, totals: UsageTotals | None = None) -> None:
        self.operation = operation
        self.model = model
        self.totals = totals

    def on_llm_end(self, response: LLMResult, *, run_id: UUID, **kwargs: Any) -> None:
        counts = extract_usage(response)
        if counts is None:
            # Still a call: count it (with zero tokens) so job reports show every call.
            if self.totals is not None:
                self.totals.add(TokenCounts())
            logger.info(
                "llm call (usage not reported)",
                extra={"fields": {"operation": self.operation, "model": self.model}},
            )
            return
        if self.totals is not None:
            self.totals.add(counts)
        logger.info(
            "llm call",
            extra={
                "fields": {
                    "operation": self.operation,
                    "model": self.model,
                    "inputTokens": counts.input_tokens,
                    "outputTokens": counts.output_tokens,
                    "totalTokens": counts.total_tokens,
                }
            },
        )
