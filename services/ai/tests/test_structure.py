"""Course structuring with a scripted chat model, on a 10-lesson fixture (issue #25)."""

import json
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from hypothesis import given
from hypothesis import strategies as st

from app.api.process import get_course_structurer
from app.generation.notes import LlmUnavailableError
from app.generation.structure import (
    CourseStructurer,
    LessonInput,
    ModuleDraft,
    OutlineDraft,
    StructureFormatError,
    parse_draft,
    repair_outline,
)
from app.generation.usage import TokenUsageCallback, UsageTotals
from app.main import create_app
from tests.conftest import INTERNAL_KEY, make_settings
from tests.fakes import ScriptedChatModel
from tests.test_notes import NO_WAIT, assert_snapshot

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures/structure/sql-10-lessons.json").read_text(encoding="utf-8")
)
LESSONS = [
    LessonInput(item["ref"], item["title"], item["summary"], item["keyConcepts"])
    for item in FIXTURE["lessons"]
]
REFS = [lesson.ref for lesson in LESSONS]

GOOD: dict[str, Any] = {
    "title": "SQL and Relational Databases for Beginners",
    "description": "Learn what databases are and how to query them with SQL.",
    "level": "Beginner",
    "modules": [
        {"title": "Database Fundamentals", "summary": "Core ideas.", "lessons": [1, 2, 3]},
        {"title": "Setting Up MySQL", "summary": "Installation.", "lessons": [4, 5]},
        {"title": "Working with Data", "summary": "Tables and rows.", "lessons": [6, 7]},
        {"title": "Querying and Design", "summary": "Joins and ER.", "lessons": [8, 9, 10]},
    ],
}


def structurer(*replies: str | Exception) -> tuple[CourseStructurer, ScriptedChatModel]:
    queue = list(replies)

    def reply(prompt: str) -> str:
        item = queue.pop(0) if len(queue) > 1 else queue[0]
        if isinstance(item, Exception):
            raise item
        return item

    totals = UsageTotals()
    usage = TokenUsageCallback(operation="course-structure", model="scripted", totals=totals)
    model = ScriptedChatModel(reply=reply, callbacks=[usage])
    return CourseStructurer(model, model_name="scripted", retry_wait=NO_WAIT, usage=totals), model


def run(*replies: str | Exception, title_hint: str | None = None) -> Any:
    instance, model = structurer(*replies)
    outline = instance.structure(LESSONS, domain=FIXTURE["domain"], title_hint=title_hint)
    return outline, model


def placed(outline: Any) -> list[str]:
    return [ref for module in outline.modules for ref in module.lesson_refs]


# ─── The 10-lesson fixture ──────────────────────────────────────────────────


def test_valid_outline_is_used_as_is() -> None:
    outline, model = run(json.dumps(GOOD))
    assert outline.title == GOOD["title"]
    assert outline.level == "Beginner"
    assert [m.title for m in outline.modules] == [m["title"] for m in GOOD["modules"]]
    assert outline.modules[1].lesson_refs == ["lsn04", "lsn05"]  # numbers mapped to refs
    assert placed(outline) == REFS
    assert (outline.repairs, outline.fallback) == ([], False)
    assert outline.prompt_id == "course-structure@1"
    assert len(model.prompts) == 1
    assert_snapshot("course-structure.sql-10.txt", model.prompts[0])


def test_small_mistakes_are_repaired_and_reported() -> None:
    draft = {
        "title": "SQL Course",
        "description": "",
        "level": " beginner ",
        "modules": [
            {"title": "Basics", "lessons": [1, 2, 3, 3]},  # 3 twice
            {"title": "", "lessons": [4, 5, 6, 11]},  # no title; 11 doesn't exist; 7 missing
            {"title": "Empty", "lessons": []},
            {"title": "Queries", "lessons": ["8", 9, 10]},  # a number as a string
        ],
    }
    outline, _ = run(f"Sure! Here is the outline:\n```json\n{json.dumps(draft)}\n```")
    assert placed(outline) == REFS  # every lesson exactly once; 7 went right after 6
    assert outline.modules[1].title == "Module 2"
    assert outline.level == "Beginner"
    assert [m.title for m in outline.modules] == ["Basics", "Module 2", "Queries"]
    assert outline.repairs == [
        "lesson 3 was placed twice; kept its first place",
        "module 2 had no title",
        "dropped unknown lesson 11 from 'Module 2'",
        "lesson 7 was missing; placed after lesson 6",
        "removed empty module 'Empty'",
    ]
    assert outline.fallback is False


def test_far_off_outlines_are_retried() -> None:
    wrong = {**GOOD, "modules": [{"title": "Some", "lessons": [1, 2, 3]}]}  # 7 lessons missing
    outline, model = run(json.dumps(wrong), "not json at all", json.dumps(GOOD))
    assert len(model.prompts) == 3
    assert placed(outline) == REFS
    assert outline.repairs == []


def test_falls_back_to_the_given_order_after_three_failures() -> None:
    outline, model = run("no JSON here", title_hint="SQL Full Course")
    assert len(model.prompts) == 3
    assert outline.fallback is True
    assert outline.title == "SQL Full Course"
    assert [len(m.lesson_refs) for m in outline.modules] == [5, 5]
    assert placed(outline) == REFS
    assert outline.modules[0].title == "Part 1: What is a Database?"
    assert "3 attempts" in outline.repairs[0]


def test_unknown_level_is_left_empty() -> None:
    outline, _ = run(json.dumps({**GOOD, "level": "Expert"}))
    assert outline.level is None
    assert outline.repairs == ["unknown level 'Expert'; left empty"]


def test_model_outage_is_not_hidden_by_the_fallback() -> None:
    with pytest.raises(LlmUnavailableError):
        run(ConnectionError("Failed to connect to Ollama"))


def test_a_single_lesson_course() -> None:
    instance, _ = structurer(
        json.dumps({"title": "T", "level": "Beginner", "modules": [{"title": "M", "lessons": [1]}]})
    )
    outline = instance.structure(LESSONS[:1], domain="Databases")
    assert placed(outline) == ["lsn01"]


def test_parse_errors() -> None:
    with pytest.raises(StructureFormatError, match="no JSON"):
        parse_draft("nothing")
    with pytest.raises(StructureFormatError, match="invalid outline"):
        parse_draft('{"title": "x"}')  # no modules


# ─── Property: any outline is repaired into a valid one ────────────────────


@given(
    count=st.integers(1, 30),
    modules=st.lists(
        st.lists(st.integers(-3, 35), max_size=12),  # out-of-range numbers and duplicates
        min_size=1,
        max_size=10,
    ),
)
def test_repair_places_every_lesson_exactly_once(count: int, modules: list[list[int]]) -> None:
    draft = OutlineDraft(
        title="t", modules=[ModuleDraft(title=f"m{i}", lessons=ls) for i, ls in enumerate(modules)]
    )
    result = repair_outline(draft, count)
    numbers = [n for module in result.modules for n in module.lessons]
    assert sorted(numbers) == list(range(1, count + 1))  # each lesson exactly once
    assert all(module.lessons for module in result.modules)  # no empty module
    valid = {n for ls in modules for n in ls if 1 <= n <= count}
    assert result.misplaced == sum(len(ls) for ls in modules) - len(valid) + (count - len(valid))


def test_an_outline_without_modules_is_rejected() -> None:
    with pytest.raises(StructureFormatError, match="no modules"):
        repair_outline(OutlineDraft(title="t", modules=[]), 3)


# ─── HTTP ───────────────────────────────────────────────────────────────────


@pytest.fixture
def api() -> Iterator[Callable[..., TestClient]]:
    clients: list[TestClient] = []

    def build(*replies: str | Exception) -> TestClient:
        app = create_app(make_settings())
        app.dependency_overrides[get_course_structurer] = lambda: structurer(*replies)[0]
        client = TestClient(app, raise_server_exceptions=False)
        client.headers["X-Internal-Key"] = INTERNAL_KEY
        clients.append(client)
        return client

    yield build
    for client in clients:
        client.close()


def request_body(**overrides: Any) -> dict[str, Any]:
    return {"domain": FIXTURE["domain"], "lessons": FIXTURE["lessons"], **overrides}


def test_endpoint_returns_the_outline(api: Callable[..., TestClient]) -> None:
    res = api(json.dumps(GOOD)).post("/process/structure", json=request_body())
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["modules"][0] == {
        "title": "Database Fundamentals",
        "summary": "Core ideas.",
        "lessonRefs": ["lsn01", "lsn02", "lsn03"],
    }
    assert (body["fallback"], body["promptId"], body["chatModel"]) == (
        False,
        "course-structure@1",
        "scripted",
    )
    assert body["usage"]["llmCalls"] == 1


def test_endpoint_validation_and_outage(api: Callable[..., TestClient]) -> None:
    client = api(ConnectionError("down"))
    duplicated = request_body(lessons=[FIXTURE["lessons"][0]] * 2)
    assert client.post("/process/structure", json=duplicated).status_code == 422
    assert client.post("/process/structure", json=request_body(lessons=[])).status_code == 422
    res = client.post("/process/structure", json=request_body())
    assert res.status_code == 503
