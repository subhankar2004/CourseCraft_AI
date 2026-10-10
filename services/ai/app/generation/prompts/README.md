# Prompts

Prompt templates live here as versioned `.md` files, not inline strings (AGENTS.md), so they can be
reviewed and compared over time. Load them with `app.generation.prompts.load_prompt("<name>")`.

```markdown
---
name: <same as the filename, without .md>
version: 1
description: What the prompt does
variables: [lesson_title, transcript]
---
Prompt text using {{lesson_title}} and {{transcript}}. Single {braces} are left as-is.
```

- Bump `version` whenever the wording changes. `name@version` is stored with generated content.
- Every `{{placeholder}}` must be declared in `variables`, and every declared variable must be used.
- Rendering fails on missing or unexpected values (no silent blanks in prompts).
