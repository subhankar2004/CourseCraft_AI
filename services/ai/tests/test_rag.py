"""`POST /rag/answer` (issue #39): course-scoped retrieval, the grounding gate, the grounded
prompt, SSE streaming and citations. Offline: keyword embeddings, an in-memory vector store and
a scripted streaming chat model."""

import json
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api.rag import RagModel, get_rag_model
from app.api.vectors import get_vector_index
from app.generation.usage import UsageTotals
from app.main import create_app
from app.processing.chunking import Chunk
from app.processing.indexing import Embedder, LessonRef, VectorIndex
from app.processing.vector_store import SearchHit
from app.rag.answer import (
    NOT_IN_COURSE,
    REFUSAL_MESSAGE,
    AnswerStream,
    Passage,
    Source,
    cited_sources,
    clean_citations,
    clean_standalone,
    merge_passages,
)
from tests.conftest import INTERNAL_KEY, make_settings
from tests.fakes import (
    KEYWORD_MODEL,
    FailingEmbeddings,
    InMemoryVectorStore,
    KeywordEmbeddings,
    StreamingChatModel,
)

COURSE = "course-db"
OTHER_COURSE = "course-other"


def build_index(embeddings: Any = None) -> VectorIndex:
    """Course "course-db": a lesson on joins and one on indexes. Another course holds a chunk
    that matches "join" even better: it must never be retrieved for course-db."""
    index = VectorIndex(
        InMemoryVectorStore(KEYWORD_MODEL.dimension),
        Embedder(embeddings or KeywordEmbeddings(), KEYWORD_MODEL),
    )

    def lesson(course: str, lesson_id: str, title: str, texts: list[str]) -> None:
        chunks = [
            Chunk(index=i, text=t, start_sec=60.0 * i, end_sec=60.0 * i + 55, token_count=20)
            for i, t in enumerate(texts)
        ]
        index.index_lesson(LessonRef(course, lesson_id, f"yt-{lesson_id}", title), chunks)

    lesson(COURSE, "l-joins", "Joins", ["a join combines rows, join join index", "a hash join"])
    lesson(COURSE, "l-index", "Indexes", ["an index speeds up reads, index index"])
    lesson(OTHER_COURSE, "l-x", "Elsewhere", ["join join join join"])
    return index


class Harness:
    def __init__(self, reply: Callable[[str], str] = lambda _: "", **settings: object) -> None:
        self.model = StreamingChatModel(reply=reply)
        self.index = build_index()
        self.settings = make_settings(**{"rag_min_score": 0.5, "rag_top_k": 6, **settings})
        app = create_app(self.settings)
        app.dependency_overrides[get_vector_index] = lambda: self.index
        app.dependency_overrides[get_rag_model] = lambda: RagModel(self.model, UsageTotals())
        self.client = TestClient(app, raise_server_exceptions=False)

    def ask(self, question: str, course_id: str = COURSE, **extra: Any) -> Any:
        return self.client.post(
            "/rag/answer",
            headers={"X-Internal-Key": INTERNAL_KEY},
            json={"courseId": course_id, "question": question, **extra},
        )


def events(text: str) -> list[tuple[str, dict[str, Any]]]:
    """Parses an SSE body into (event, data) pairs."""
    parsed = []
    for block in text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        parsed.append((lines["event"], json.loads(lines["data"])))
    return parsed


def answered_from_context(prompt: str) -> str:
    if "Newest message:" in prompt:  # the condensing call (#40)
        return "Explain how a join works, with an example"
    assert "<context>" in prompt
    return "A join combines rows from two tables [1]. Hash joins exist too [2]."


class TestGroundedAnswer:
    def test_streams_tokens_then_done_with_citations(self) -> None:
        harness = Harness(answered_from_context)
        res = harness.ask("How does a join work?")
        assert res.status_code == 200
        assert res.headers["content-type"].startswith("text/event-stream")
        stream = events(res.text)
        names = [name for name, _ in stream]
        assert names[-1] == "done" and names[:-1] == ["token"] * (len(names) - 1)
        assert len(names) > 3  # word by word, not one blob
        done = stream[-1][1]
        streamed = "".join(data["text"] for name, data in stream if name == "token")
        assert done["answer"] == streamed.strip()
        assert done["grounded"] is True and done["refusal"] is None
        assert [(c["n"], c["lessonId"], c["startSec"], c["endSec"]) for c in done["citations"]] == [
            (1, "l-joins", 0.0, 55.0),
            (2, "l-joins", 60.0, 115.0),
        ]
        first = done["citations"][0]
        assert first["chunkId"] == "l-joins-0"
        assert first["lessonTitle"] == "Joins" and first["youtubeId"] == "yt-l-joins"
        assert done["bestScore"] == first["score"] >= 0.5
        assert done["promptIds"] == ["rag-answer@3", "rag-question@2"]  # no history: no condensing
        assert done["standaloneQuestion"] is None
        assert [s["n"] for s in done["sources"]] == [1, 2]
        assert done["minScore"] == 0.5
        assert done["usage"]["llmCalls"] == 0  # fakes report no usage; real models do

    def test_prompt_holds_only_this_courses_passing_chunks_and_the_rules(self) -> None:
        harness = Harness(answered_from_context)
        harness.ask("How does a join work?")
        (prompt,) = harness.model.prompts
        assert "answer only from the excerpts" in prompt.lower()
        assert NOT_IN_COURSE in prompt
        assert "[1] Lesson: Joins (0:00-0:55)\na join combines rows" in prompt
        assert "Elsewhere" not in prompt  # never another course's chunks
        assert "[2] Lesson: Joins (1:00-1:55)\na hash join" in prompt
        assert "an index speeds up reads" not in prompt  # retrieved, but below the bar: dropped
        assert "Question: How does a join work?\n\nAnswer from the excerpts only" in prompt

    def test_recent_history_is_sent_in_order(self) -> None:
        harness = Harness(answered_from_context)
        history = [
            {"role": "user" if i % 2 == 0 else "assistant", "content": f"turn {i}"}
            for i in range(8)
        ]
        harness.ask("And a hash join?", history=history)
        _condense, prompt = harness.model.prompts
        assert "turn 0" not in prompt and "turn 1" not in prompt  # only the last 6
        assert prompt.index("human: turn 2") < prompt.index("ai: turn 3") < prompt.index("turn 7")


JOIN_HISTORY = [
    {"role": "user", "content": "What is a join?"},
    {"role": "assistant", "content": "A join combines rows from two tables [1]."},
]


class TestFollowUps:
    def test_a_follow_up_is_condensed_before_retrieval(self) -> None:
        harness = Harness(answered_from_context)
        done = events(harness.ask("Explain that again with an example", history=JOIN_HISTORY).text)[
            -1
        ][1]
        condense, answer = harness.model.prompts
        assert "Student: What is a join?" in condense
        assert "Assistant: A join combines rows" in condense
        assert condense.rstrip().endswith("Newest message: Explain that again with an example")
        # Retrieval and the answer use the standalone question; the history is still sent.
        assert done["standaloneQuestion"] == "Explain how a join works, with an example"
        assert done["grounded"] is True and done["citations"][0]["lessonId"] == "l-joins"
        assert "Question: Explain how a join works, with an example" in answer
        assert "human: What is a join?" in answer
        assert done["promptIds"] == ["rag-condense@2", "rag-answer@3", "rag-question@2"]

    def test_without_condensing_the_follow_up_finds_nothing(self) -> None:
        # The same follow-up without its history names no topic: the gate refuses it (the
        # condensed form above scores ~0.95 against the join chunk, well over this bar).
        harness = Harness(answered_from_context, rag_min_score=0.6)
        done = events(harness.ask("Explain that again with an example").text)[-1][1]
        assert done["refusal"] == "low_score" and done["standaloneQuestion"] is None

    def test_a_failed_condensation_falls_back_to_the_question(self) -> None:
        def reply(prompt: str) -> str:
            if "Newest message:" in prompt:
                raise ConnectionError("Failed to connect to Ollama")
            return answered_from_context(prompt)

        harness = Harness(reply)
        done = events(harness.ask("And a hash join?", history=JOIN_HISTORY).text)[-1][1]
        assert done["standaloneQuestion"] is None and done["grounded"] is True

    def test_an_off_scope_follow_up_is_still_refused_without_an_answer(self) -> None:
        def reply(prompt: str) -> str:
            if "Newest message:" in prompt:
                return "How do I traverse a graph"
            raise AssertionError("no answer may be generated")

        harness = Harness(reply)
        done = events(harness.ask("and graphs?", history=JOIN_HISTORY).text)[-1][1]
        assert done["refusal"] == "low_score" and len(harness.model.prompts) == 1

    @pytest.mark.parametrize(
        ("reply", "expected"),
        [
            ("Explain joins with an example", "Explain joins with an example"),
            ('Standalone question: "What is a hash join?"', "What is a hash join?"),
            ("\n\n  How do indexes speed up reads?\nExtra line", "How do indexes speed up reads?"),
            ("   \n ... \n", None),
            ("", None),
        ],
    )
    def test_cleaning_the_rewrite(self, reply: str, expected: str | None) -> None:
        assert clean_standalone(reply) == expected


def chunk_hit(
    lesson: str, index: int, start: float, end: float, text: str, score: float
) -> SearchHit:
    return SearchHit(
        id=f"{lesson}-{index}",
        course_id=COURSE,
        lesson_id=lesson,
        youtube_id=f"yt-{lesson}",
        chunk_index=index,
        start_sec=start,
        end_sec=end,
        lesson_title=lesson.title(),
        text=text,
        score=score,
    )


class TestPassages:
    def test_overlapping_neighbours_of_a_lesson_merge_without_repeating_text(self) -> None:
        shared = "the shared overlap sentence repeated by the chunker"
        a = chunk_hit("joins", 0, 0, 120, f"first part, {shared}", 0.7)
        b = chunk_hit("joins", 1, 100, 230, f"{shared}, second part", 0.9)
        (passage,) = merge_passages([b, a])
        assert passage.text == f"first part, {shared}, second part"
        assert (passage.start_sec, passage.end_sec) == (0, 230)
        assert passage.chunk_ids == ("joins-0", "joins-1")
        assert passage.score == 0.9
        assert passage.seek_sec == 100  # the better-matching second chunk, not the span start

    def test_distant_chunks_and_other_lessons_stay_separate_best_first(self) -> None:
        hits = [
            chunk_hit("joins", 0, 0, 100, "early", 0.6),
            chunk_hit("joins", 5, 600, 700, "much later", 0.8),
            chunk_hit("index", 0, 0, 100, "another lesson", 0.7),
        ]
        assert [p.text for p in merge_passages(hits)] == ["much later", "another lesson", "early"]

    def test_merged_passages_are_cited_with_all_their_chunks(self) -> None:
        harness = Harness(answered_from_context)
        harness.index = build_index()
        shared = "join rows by key, a join join join"
        texts = [f"intro {shared}", f"{shared} then a hash join"]
        chunks = [
            Chunk(index=i, text=t, start_sec=100.0 * i, end_sec=100.0 * i + 110, token_count=9)
            for i, t in enumerate(texts)
        ]
        harness.index.index_lesson(LessonRef(COURSE, "l-joins", "yt-l-joins", "Joins"), chunks)
        done = events(harness.ask("How does a join work?").text)[-1][1]
        first = done["citations"][0]
        assert first["chunkIds"] == ["l-joins-0", "l-joins-1"] and first["chunkId"] == "l-joins-0"
        assert (first["startSec"], first["endSec"], first["seekSec"]) == (0.0, 210.0, 0.0)
        assert len(done["sources"]) == 1  # one passage, not two copies of the shared text
        prompt = harness.model.prompts[0]
        assert prompt.count(shared) == 1


class TestGroundingGate:
    def test_off_scope_question_is_refused_without_calling_the_model(self) -> None:
        harness = Harness(answered_from_context)
        # Graphs aren't covered: the best match (a join chunk) is far below the bar.
        stream = events(harness.ask("Explain graph traversal").text)
        assert harness.model.prompts == []
        assert [name for name, _ in stream] == ["token", "done"]
        assert stream[0][1]["text"] == REFUSAL_MESSAGE
        done = stream[1][1]
        assert done["grounded"] is False and done["refusal"] == "low_score"
        assert done["answer"] == REFUSAL_MESSAGE and done["citations"] == []
        assert done["bestScore"] is not None and done["bestScore"] < 0.5

    def test_a_course_without_chunks_is_refused(self) -> None:
        harness = Harness(answered_from_context)
        done = events(harness.ask("How does a join work?", course_id="no-such-course").text)[-1][1]
        assert harness.model.prompts == []
        assert (done["refusal"], done["bestScore"]) == ("not_indexed", None)

    def test_the_threshold_is_configuration(self) -> None:
        strict = Harness(answered_from_context, rag_min_score=0.99)
        done = events(strict.ask("How does a join work?").text)[-1][1]
        assert done["refusal"] == "low_score" and strict.model.prompts == []

    def test_the_model_can_decline_and_the_sentinel_is_never_streamed(self) -> None:
        harness = Harness(lambda _: f"  {NOT_IN_COURSE}")
        stream = events(harness.ask("How does a join work?").text)
        assert len(harness.model.prompts) == 1
        assert [name for name, _ in stream] == ["token", "done"]
        assert NOT_IN_COURSE not in json.dumps(stream)
        assert stream[1][1]["refusal"] == "not_in_context"
        assert stream[1][1]["grounded"] is False


class TestFailures:
    def test_model_failure_mid_answer_ends_with_failed(self) -> None:
        harness = Harness(answered_from_context)
        harness.model.fail_after = 3
        stream = events(harness.ask("How does a join work?").text)
        assert [name for name, _ in stream] == ["token"] * 3 + ["failed"]  # 3 words, then the break
        assert stream[-1][1]["message"].startswith("The language model is unavailable")

    def test_embedding_outage_is_503_before_any_stream(self) -> None:
        harness = Harness(answered_from_context)
        harness.index = build_index()
        harness.index.embedder = Embedder(FailingEmbeddings(), KEYWORD_MODEL)
        res = harness.ask("How does a join work?")
        assert res.status_code == 503
        assert res.headers["content-type"].startswith("application/json")

    @pytest.mark.parametrize(
        "body",
        [
            {"courseId": COURSE, "question": "   "},
            {"courseId": COURSE, "question": "x" * 2001},
            {"courseId": "bad id!", "question": "join?"},
            {
                "courseId": COURSE,
                "question": "join?",
                "history": [{"role": "system", "content": "x"}],
            },
            {
                "courseId": COURSE,
                "question": "join?",
                "history": [{"role": "user", "content": "x"}] * 21,
            },
        ],
    )
    def test_invalid_requests_are_422(self, body: dict[str, Any]) -> None:
        harness = Harness(answered_from_context)
        res = harness.client.post(
            "/rag/answer", headers={"X-Internal-Key": INTERNAL_KEY}, json=body
        )
        assert res.status_code == 422
        assert harness.model.prompts == []

    def test_requires_the_internal_key(self) -> None:
        harness = Harness(answered_from_context)
        res = harness.client.post("/rag/answer", json={"courseId": COURSE, "question": "join?"})
        assert res.status_code == 401


def hit(n: int) -> Source:
    return Source(n, Passage("l", "L", "y", 0, 1, "t", (f"c-{n}",), 0.9, 0))


class TestTrailingSentinel:
    @pytest.mark.parametrize(
        ("parts", "expected"),
        [
            (["A join merges rows. ", "\n\nNOT_", "IN_COURSE"], "A join merges rows. \n\n"),
            (["Fine [1]. NOT_IN_COURSE and more."], "Fine [1].  and more."),
            (["Ends with NOT"], "Ends with NOT"),  # a prefix that never completes is kept
            (["NOTE: x"], "NOTE: x"),
        ],
    )
    def test_is_removed_from_an_answer(self, parts: list[str], expected: str) -> None:
        out = list(AnswerStream._without_sentinel(iter(parts)))
        assert None not in out and "".join(p for p in out if p) == expected

    def test_a_full_answer_followed_by_the_sentinel_stays_an_answer(self) -> None:
        harness = Harness(lambda _: "Joins merge rows [1].\n\nNOT_IN_COURSE")
        done = events(harness.ask("How does a join work?").text)[-1][1]
        assert done["grounded"] is True and done["answer"] == "Joins merge rows [1]."
        assert NOT_IN_COURSE not in done["answer"]


class TestCitations:
    def test_order_of_first_citation_groups_and_unknown_numbers(self) -> None:
        sources = [hit(1), hit(2), hit(3)]
        answer = "B [2]. A and C [1, 3]. Again [2][1]. Invented [7] and [0]."
        assert [s.n for s in cited_sources(answer, sources)] == [2, 1, 3]

    def test_an_uncited_answer_has_no_citations(self) -> None:
        assert cited_sources("No markers here.", [hit(1)]) == []

    def test_ranges_and_code_literals(self) -> None:
        sources = [hit(1), hit(2), hit(3)]
        assert [s.n for s in cited_sources("All of it [1-3].", sources)] == [1, 2, 3]
        assert [s.n for s in cited_sources("`xs = [3, 1]` then [2]", sources)] == [2]

    def test_markers_pointing_nowhere_are_removed_from_the_answer(self) -> None:
        sources = [hit(1), hit(2)]
        answer = "Real [1]. Invented [7]. Mixed [2, 9]. Code `a = [7]`."
        assert clean_citations(answer, sources) == "Real [1]. Invented. Mixed [2]. Code `a = [7]`."

    def test_the_final_answer_is_cleaned(self) -> None:
        harness = Harness(lambda p: "A join combines rows [1]. Made up [9].")
        done = events(harness.ask("How does a join work?").text)[-1][1]
        assert done["answer"] == "A join combines rows [1]. Made up."
        assert [c["n"] for c in done["citations"]] == [1]


class TestSentinel:
    @pytest.mark.parametrize(
        ("tokens", "expected"),
        [
            (["NOT_", "IN_", "COURSE"], [None]),
            (["\n NOT_IN_COURSE."], [None]),
            (["NOTE: ", "joins ", "merge"], ["NOTE: ", "joins ", "merge"]),
            (["NOT"], ["NOT"]),
            (["", "  "], [None]),  # an empty reply is no answer
            (["A ", "join"], ["A ", "join"]),
        ],
    )
    def test_detection(self, tokens: list[str], expected: list[str | None]) -> None:
        assert list(AnswerStream._sentinel_aware(iter(tokens))) == expected
