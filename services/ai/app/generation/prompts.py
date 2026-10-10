"""Versioned prompt templates stored as Markdown files in app/generation/prompts/ (AGENTS.md).

File format:

    ---
    name: lesson-notes-map
    version: 1
    description: One chunk of transcript → partial study notes
    variables: [lesson_title, transcript]
    ---
    You are writing study notes for "{{lesson_title}}" ...

- `{{variable}}` placeholders are filled by `Prompt.render()`. Single braces are left alone, so
  prompts can contain JSON or code examples.
- Rendering is strict: a missing or unexpected variable is an error, and so is a placeholder that
  isn't declared in `variables`.
- `name@version` is recorded with generated content, so outputs can be traced back to the exact
  prompt that produced them.
"""

import re
from dataclasses import dataclass
from functools import cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).parent / "prompts"
_PLACEHOLDER = re.compile(r"\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}")
_FRONT_MATTER = re.compile(r"\A---\n(.*?)\n---\n(.*)\Z", re.DOTALL)


class PromptError(ValueError):
    pass


@dataclass(frozen=True)
class Prompt:
    name: str
    version: int
    description: str
    variables: frozenset[str]
    template: str

    @property
    def id(self) -> str:
        """Provenance id stored with outputs, e.g. `lesson-notes-map@1`."""
        return f"{self.name}@{self.version}"

    def render(self, **values: str) -> str:
        missing = self.variables - values.keys()
        unexpected = values.keys() - self.variables
        if missing or unexpected:
            raise PromptError(
                f"{self.id}: missing {sorted(missing)}, unexpected {sorted(unexpected)}"
            )
        return _PLACEHOLDER.sub(lambda m: values[m.group(1)], self.template)


def _parse_front_matter(raw: str, source: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in raw.splitlines():
        if not line.strip():
            continue
        key, sep, value = line.partition(":")
        if not sep:
            raise PromptError(f"{source}: bad front-matter line {line!r}")
        fields[key.strip()] = value.strip()
    return fields


def parse_prompt(text: str, source: str = "<prompt>") -> Prompt:
    match = _FRONT_MATTER.match(text.replace("\r\n", "\n"))
    if not match:
        raise PromptError(f"{source}: missing '---' front matter")
    fields = _parse_front_matter(match.group(1), source)
    for required in ("name", "version", "variables"):
        if required not in fields:
            raise PromptError(f"{source}: front matter needs '{required}'")
    if not fields["version"].isdigit():
        raise PromptError(f"{source}: version must be a positive integer")

    raw_vars = fields["variables"].strip()
    if not (raw_vars.startswith("[") and raw_vars.endswith("]")):
        raise PromptError(f"{source}: variables must be a list like [a, b]")
    variables = frozenset(v.strip() for v in raw_vars[1:-1].split(",") if v.strip())

    template = match.group(2).strip() + "\n"
    used = set(_PLACEHOLDER.findall(template))
    if undeclared := used - variables:
        raise PromptError(f"{source}: placeholders not declared in variables: {sorted(undeclared)}")
    if unused := variables - used:
        raise PromptError(f"{source}: declared variables never used: {sorted(unused)}")

    return Prompt(
        name=fields["name"],
        version=int(fields["version"]),
        description=fields.get("description", ""),
        variables=variables,
        template=template,
    )


@cache
def load_prompt(name: str, directory: Path = PROMPTS_DIR) -> Prompt:
    """Loads `<directory>/<name>.md` (cached). The file's `name` must match its filename."""
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", name):
        raise PromptError(f"invalid prompt name {name!r}")
    path = directory / f"{name}.md"
    if not path.is_file():
        raise PromptError(f"prompt not found: {path}")
    prompt = parse_prompt(path.read_text(encoding="utf-8"), source=str(path))
    if prompt.name != name:
        raise PromptError(f"{path}: front-matter name '{prompt.name}' doesn't match the filename")
    return prompt
