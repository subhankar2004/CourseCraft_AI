"""Cognitive Load Index (issue #43): the measure on sample texts, and the simplify loop that
rewrites notes above CLI_MAX once and keeps the lighter version only if nothing was lost."""

import re
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from app.evaluation.cognitive_load import (
    CONCEPT_DENSITY_BOUNDS,
    WEIGHTS,
    cognitive_load,
    key_terms,
    prose,
)
from app.generation.notes import NotesGenerator
from tests.conftest import INTERNAL_KEY
from tests.fakes import ScriptedChatModel
from tests.test_notes import NO_WAIT, between, scripted, segments_of

DENSE = """## Normal forms [▶ 1:00]

Third normal form (**3NF**) requires that every non-prime attribute of a relation schema be
non-transitively dependent on every **candidate key**, which, combined with the prerequisite that
the schema already satisfies **second normal form** by eliminating **partial functional
dependencies** on composite keys, guarantees the elimination of a substantial class of **update
anomalies** that would otherwise compromise **referential integrity** across decomposed relations.
"""

SIMPLE = """## What is a table? [▶ 0:10]

A table stores data in rows and columns. Each row is one record. Each column holds one kind of
value.

- A **primary key** names each row.
- A row can point to another table.
"""


class TestTheIndex:
    def test_dense_academic_prose_is_heavy_and_plain_prose_is_light(self) -> None:
        dense, simple = cognitive_load(DENSE), cognitive_load(SIMPLE, ["Primary key"])
        assert dense.index > 70 and simple.index < 20
        assert dense.flesch_kincaid > simple.flesch_kincaid
        assert dense.avg_sentence_len > simple.avg_sentence_len
        assert dense.concept_density > simple.concept_density

    def test_shorter_sentences_lower_the_index(self) -> None:
        long = (
            "A join combines rows from two tables by matching a shared key value and returns"
            " them together as one result set for the query."
        )
        short = (
            "A join combines rows from two tables. It matches them by a shared key."
            " It returns one result set."
        )
        assert cognitive_load(short).index < cognitive_load(long).index

    def test_weights_sum_to_one_and_parts_are_clamped(self) -> None:
        assert sum(WEIGHTS.values()) == pytest.approx(1.0)
        terms = " ".join(f"**t{i}**" for i in range(60))  # far above the heavy bound
        assert cognitive_load(f"{terms} end.").index <= 100
        assert cognitive_load("").index == 0 and cognitive_load("```\ncode\n```").words == 0

    def test_only_prose_is_measured(self) -> None:
        text = prose(
            "## Heading [▶ 2:05]\n\nSee the [docs](https://x.test) and `SELECT`.\n\n"
            "```sql\nSELECT * FROM t WHERE a = 1;\n```\n\n"
            "- first item\n- **second** item!\n\n"
            "| Key | Meaning |\n|---|---|\n| PK | names a row |\n\n> Note: quoted"
        )
        assert text == (
            "See the docs and SELECT. first item. second item! Key, Meaning. "
            "PK, names a row. Note: quoted."
        )

    def test_key_terms_are_concepts_bold_terms_and_code_deduplicated(self) -> None:
        terms = key_terms(
            "A **Primary key** and a **foreign key** use `JOIN`; **primary key** again.\n"
            "```sql\nSELECT `ignored`\n```",
            ["Primary key", "Index"],
        )
        assert terms == {"primary key", "foreign key", "join", "index"}

    def test_density_is_terms_per_hundred_words(self) -> None:
        light = "word " * 99 + "**term**."
        load = cognitive_load(light)
        assert load.words == 100 and load.concept_density == 1.0
        assert CONCEPT_DENSITY_BOUNDS[0] > load.concept_density  # below the light bound: 0


# ─── The simplify loop ──────────────────────────────────────────────────────

Reply = Callable[[str], str]


def heavy_reduce(prompt: str) -> str:
    """Notes far above CLI_MAX: long sentences full of new terms."""
    anchors = re.findall(r"\[▶ [\d:]+\]", between(prompt, "notes"))[:2]
    sections = "\n\n".join(
        f"## Topic {i + 1} {a}\n{DENSE.split(chr(10), 2)[2]}" for i, a in enumerate(anchors)
    )
    return (
        "# Normal Forms\n\n## Summary\nNormal forms constrain relation schemas.\n\n"
        "## Key concepts\n- **3NF**: third normal form.\n- **BCNF**: Boyce-Codd normal form.\n\n"
        f"{sections}\n\n## Recap\n- Normal forms remove anomalies.\n"
    )


def simpler_doc(document: str, *, drop_anchor: bool = False, words: int = 60) -> str:
    """The same structure in short, plain sentences (optionally losing an anchor)."""
    anchors = re.findall(r"\[▶ [\d:]+\]", document)
    if drop_anchor:
        anchors = anchors[:1]
    body = " ".join(["A table keeps data tidy."] * (words // 5))
    sections = "\n\n".join(f"## Topic {i + 1} {a}\n{body}" for i, a in enumerate(anchors))
    return (
        "# Normal Forms\n\n## Summary\nNormal forms keep tables tidy.\n\n"
        "## Key concepts\n- **3NF**: a rule for tidy tables.\n\n"
        f"{sections}\n\n## Recap\n- Keep tables tidy.\n"
    )


def run(simplify: Reply, cli_max: float | None = 40) -> tuple[ScriptedChatModel, object]:
    def reply(prompt: str) -> str:
        if "too dense for beginners" in prompt:
            return simplify(between(prompt, "notes"))
        if "Turn the notes below into ONE" in prompt:
            return heavy_reduce(prompt)
        return scripted(prompt)

    model = ScriptedChatModel(reply=reply)
    notes = NotesGenerator(
        model, model_name="scripted", retry_wait=NO_WAIT, cli_max=cli_max
    ).generate("Normal forms", segments_of("whisper"))
    return model, notes


class TestSimplifyLoop:
    def test_heavy_notes_are_rewritten_once_and_the_lighter_version_kept(self) -> None:
        model, notes = run(lambda doc: simpler_doc(doc, words=400))
        load = notes.cognitive_load  # type: ignore[attr-defined]
        assert sum("too dense for beginners" in p for p in model.prompts) == 1
        assert load.simplified and load.simplify_attempted
        assert load.original_index > 40 > load.index
        assert "A table keeps data tidy." in notes.notes_markdown  # type: ignore[attr-defined]
        assert notes.prompt_ids[-1] == "lesson-notes-simplify@1"  # type: ignore[attr-defined]

    @pytest.mark.parametrize(
        ("simplify", "reason"),
        [
            (lambda doc: simpler_doc(doc, drop_anchor=True, words=400), "dropped an anchor"),
            (lambda doc: simpler_doc(doc, words=10), "lost most of the words"),
            (lambda doc: heavy_reduce(f"<notes>\n{doc}\n</notes>"), "not lighter"),
            (lambda doc: "not a lesson document", "unusable output, three times"),
        ],
    )
    def test_a_worse_or_lossy_rewrite_is_rejected(self, simplify: Reply, reason: str) -> None:
        _, notes = run(simplify)
        load = notes.cognitive_load  # type: ignore[attr-defined]
        assert load.simplify_attempted and not load.simplified, reason
        assert load.index > 40 and load.original_index is None
        assert "lesson-notes-simplify@1" not in notes.prompt_ids  # type: ignore[attr-defined]
        assert "candidate key" in notes.notes_markdown  # type: ignore[attr-defined]

    def test_light_notes_or_no_limit_are_measured_but_not_rewritten(self) -> None:
        for cli_max in (None, 99.9):
            model, notes = run(lambda doc: pytest.fail("must not simplify"), cli_max=cli_max)
            load = notes.cognitive_load  # type: ignore[attr-defined]
            assert load is not None and not load.simplify_attempted
            assert not any("too dense for beginners" in p for p in model.prompts)


def test_the_eval_endpoint_measures_notes(client: TestClient) -> None:
    res = client.post(
        "/eval/cognitive-load",
        headers={"X-Internal-Key": INTERNAL_KEY},
        json={"notesMarkdown": DENSE, "keyConcepts": ["3NF"]},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["index"] == cognitive_load(DENSE, ["3NF"]).index > 70
    assert body["simplified"] is False and body["originalIndex"] is None
    assert client.post("/eval/cognitive-load", json={"notesMarkdown": "x"}).status_code == 401
    bad = client.post(
        "/eval/cognitive-load", headers={"X-Internal-Key": INTERNAL_KEY}, json={"notesMarkdown": ""}
    )
    assert bad.status_code == 422
