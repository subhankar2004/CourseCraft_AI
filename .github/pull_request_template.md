Closes #

## What

<!-- What changed, in a few bullets. -->

## Why

<!-- The problem or issue goal this addresses. Link SPEC sections if relevant. -->

## How to verify

<!-- Exact commands / steps a reviewer can run. -->

```bash

```

## Test evidence

<!-- Test output, screenshots, or curl results. -->

## Checklist

- [ ] Scoped to the linked issue only
- [ ] `pnpm lint` / `pnpm test` (and `uv run ruff check . && uv run pytest` for `services/ai`) pass locally
- [ ] No secrets, `.env` files, model weights or media committed
- [ ] New env vars added to `.env.example` and SPEC §12
- [ ] SPEC.md / AGENTS.md updated if behaviour, contracts or commands changed
- [ ] docs/PROGRESS.md entry added (what, why, method, problems, verification)
- [ ] New technologies/methods cited in docs/REFERENCES.md + docs/references.bib
