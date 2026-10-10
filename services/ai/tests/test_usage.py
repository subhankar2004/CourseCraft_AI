import json
import logging

import pytest
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import LLMResult

from app.core.request_context import request_id_var
from app.generation.usage import TokenUsageCallback, UsageTotals, extract_usage


def fake_chat(*replies: AIMessage, callback: TokenUsageCallback) -> GenericFakeChatModel:
    return GenericFakeChatModel(messages=iter(replies), callbacks=[callback])


def reply(text: str, input_tokens: int, output_tokens: int) -> AIMessage:
    return AIMessage(
        content=text,
        usage_metadata={
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
        },
    )


def test_usage_is_totalled_across_calls() -> None:
    totals = UsageTotals()
    callback = TokenUsageCallback(operation="notes", model="fake", totals=totals)
    chat = fake_chat(reply("a", 100, 20), reply("b", 50, 5), callback=callback)
    chat.invoke("first")
    chat.invoke("second")
    assert totals.calls == 2
    assert (totals.counts.input_tokens, totals.counts.output_tokens) == (150, 25)
    assert totals.counts.total_tokens == 175


def test_each_call_is_logged_with_the_request_id(caplog: pytest.LogCaptureFixture) -> None:
    from app.core.logging import JsonFormatter

    callback = TokenUsageCallback(operation="structure", model="fake-model")
    chat = fake_chat(reply("ok", 12, 3), callback=callback)
    token = request_id_var.set("rid-123")
    try:
        with caplog.at_level(logging.INFO, logger="app.llm.usage"):
            chat.invoke("hi")
    finally:
        request_id_var.reset(token)
    entry = json.loads(JsonFormatter().format(caplog.records[-1]))
    assert entry["requestId"] == "rid-123"
    assert entry["operation"] == "structure"
    assert entry["model"] == "fake-model"
    assert (entry["inputTokens"], entry["outputTokens"], entry["totalTokens"]) == (12, 3, 15)


def test_falls_back_to_openai_token_usage_and_tolerates_missing_usage() -> None:
    legacy = LLMResult(
        generations=[], llm_output={"token_usage": {"prompt_tokens": 7, "completion_tokens": 2}}
    )
    counts = extract_usage(legacy)
    assert counts is not None
    assert (counts.input_tokens, counts.output_tokens) == (7, 2)
    assert extract_usage(LLMResult(generations=[])) is None
