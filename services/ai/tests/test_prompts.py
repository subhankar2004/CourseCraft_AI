from pathlib import Path

import pytest

from app.generation.prompts import PromptError, load_prompt, parse_prompt

VALID = """---
name: greet
version: 2
description: Says hello
variables: [name, topic]
---
Hello {{name}}! Today: {{ topic }}.
Example JSON stays as-is: {"key": "value"}
"""


def test_parses_front_matter_and_renders_strictly() -> None:
    prompt = parse_prompt(VALID)
    assert prompt.id == "greet@2"
    assert prompt.variables == {"name", "topic"}
    text = prompt.render(name="Asha", topic="SQL joins")
    assert text.startswith("Hello Asha! Today: SQL joins.")
    assert '{"key": "value"}' in text  # single braces untouched


def test_values_are_inserted_literally() -> None:
    # A value that looks like a placeholder must not be expanded again.
    assert "{{topic}}" in parse_prompt(VALID).render(name="{{topic}}", topic="x")


@pytest.mark.parametrize(
    ("values", "message"),
    [({"name": "A"}, "missing"), ({"name": "A", "topic": "B", "extra": "C"}, "unexpected")],
)
def test_render_rejects_missing_or_unexpected_values(values: dict[str, str], message: str) -> None:
    with pytest.raises(PromptError, match=message):
        parse_prompt(VALID).render(**values)


@pytest.mark.parametrize(
    ("text", "message"),
    [
        ("no front matter", "front matter"),
        ("---\nname: x\nvariables: []\n---\nhi", "version"),
        ("---\nname: x\nversion: one\nvariables: []\n---\nhi", "positive integer"),
        ("---\nname: x\nversion: 1\nvariables: [a]\n---\n{{b}}", "not declared"),
        ("---\nname: x\nversion: 1\nvariables: [a, b]\n---\n{{a}}", "never used"),
    ],
)
def test_invalid_prompt_files_are_rejected(text: str, message: str) -> None:
    with pytest.raises(PromptError, match=message):
        parse_prompt(text)


def test_load_prompt_from_directory(tmp_path: Path) -> None:
    (tmp_path / "greet.md").write_text(VALID, encoding="utf-8")
    assert load_prompt("greet", tmp_path).version == 2
    with pytest.raises(PromptError, match="not found"):
        load_prompt("missing", tmp_path)
    with pytest.raises(PromptError, match="invalid prompt name"):
        load_prompt("../secrets", tmp_path)


def test_load_prompt_checks_name_matches_filename(tmp_path: Path) -> None:
    (tmp_path / "other.md").write_text(VALID, encoding="utf-8")
    with pytest.raises(PromptError, match="doesn't match the filename"):
        load_prompt("other", tmp_path)
