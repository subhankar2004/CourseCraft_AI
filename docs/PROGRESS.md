# CourseCraft AI — Development Log

A running record of what was built, why, and how it was verified. It is written so it can be turned directly into the **Methods / Implementation** and **Results** chapters of the project report or paper.

- One entry per merged PR, newest at the bottom.
- Citations like **[R12]** refer to [REFERENCES.md](REFERENCES.md).
- Architectural decisions are also collected in the [Decision log](#decision-log) at the end.

---

## Summary

| #   | Date       | Issue / PR                                                                                                                      | Phase | Outcome                                                        |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------- |
| 0   | 2026-10-08 | — / (direct commit)                                                                                                             | —     | SPEC, AGENTS guide, 50-issue roadmap created from report       |
| 1   | 2026-10-08 | [#1](https://github.com/subhankar2004/CourseCraft_AI/issues/1) / [#51](https://github.com/subhankar2004/CourseCraft_AI/pull/51) | P0    | Monorepo template, tooling, repo conventions                   |
| 2   | 2026-10-09 | [#2](https://github.com/subhankar2004/CourseCraft_AI/issues/2) / [#52](https://github.com/subhankar2004/CourseCraft_AI/pull/52) | P0    | Local infrastructure (PostgreSQL, Redis, Ollama) + env         |
| 3   | 2026-10-09 | [#3](https://github.com/subhankar2004/CourseCraft_AI/issues/3) / [#53](https://github.com/subhankar2004/CourseCraft_AI/pull/53) | P0    | NestJS API skeleton: config, validation, errors, logging       |
| 4   | 2026-10-09 | [#4](https://github.com/subhankar2004/CourseCraft_AI/issues/4) / [#55](https://github.com/subhankar2004/CourseCraft_AI/pull/55) | P0    | Next.js web shell: theme, layout, API client, error pages      |
| 5   | 2026-10-09 | [#5](https://github.com/subhankar2004/CourseCraft_AI/issues/5) / [#56](https://github.com/subhankar2004/CourseCraft_AI/pull/56) | P0    | FastAPI AI service skeleton: config, internal-key auth, health |
| 6   | 2026-10-09 | [#6](https://github.com/subhankar2004/CourseCraft_AI/issues/6) / [#57](https://github.com/subhankar2004/CourseCraft_AI/pull/57) | P0    | Shared contracts package + GitHub Actions CI; **P0 complete**  |

---

## Entry 0 — Requirements analysis and planning (2026-10-08)

**What:** We studied the project report ([docs/report/CourseCraftAI.pdf](report/CourseCraftAI.pdf)) and turned it into:

- [SPEC.md](../SPEC.md): scope, architecture, data model, pipelines, API surface, evaluation metrics, milestones.
- [AGENTS.md](../AGENTS.md): conventions for contributors and AI coding agents.
- [docs/ISSUES.md](ISSUES.md): a 50-issue roadmap in 8 phases (P0–P7), created as GitHub issues #1–#50 with labels and milestones by `scripts/create_issues.py`.

**Key decisions:** D1–D5 (see the decision log).

**Method notes for the paper:**

- Work is split into small, verifiable increments: one issue → one branch → one pull request. Each issue has explicit acceptance criteria ("Done when").
- Development is done by one developer with an AI pair programmer (Claude Code). Every change is reviewed by the human developer before merge.

---

## Entry 1 — Monorepo template (Issue #1, PR #51, 2026-10-08)

**What:**

- A **pnpm workspace monorepo** [R30][R31] (`apps/web`, `apps/api`, `services/ai`, `packages/shared`) with root scripts for dev, build, lint, typecheck, test and format.
- Node.js 24 LTS pinned via `.nvmrc` and `engines` [R32].
- Prettier and EditorConfig.
- A `.gitignore` that keeps secrets, model weights and downloaded media out of git.
- README, a PR template, and GitHub issue forms.
- Branch and commit conventions follow Conventional Commits [R33].

**Why:** a single repository keeps the frontend, API and AI service in step. API contracts change atomically across all three in one PR [R31].

**Verification:** `pnpm install`, `pnpm format:check` and the root `lint`/`test`/`typecheck`/`build` scripts all exit 0.

**Issues met:**

- pnpm was not installed globally, and Node 25 no longer bundles Corepack. We used `npx pnpm@12.10.1` instead of changing the machine's global tools.
- Prettier merged the "Done when" lines into the preceding list items. Fixed with blank lines, and `create_issues.py --update` was added to re-sync the GitHub issues.

---

## Entry 2 — Local infrastructure (Issue #2, PR #52, 2026-10-09)

**What:**

- `docker-compose.yml` [R34] running **PostgreSQL 16** [R40] and **Redis 7** [R41], each with a named volume and a health check.
- **Ollama** [R26] is optional, behind a Compose profile.
- An init script creates a separate `coursecraft_test` database.
- `.env.example` documents every configuration variable.
- `docs/setup.md` is the setup guide.

**Why:**

- **Containers** give every developer the same database and cache versions, and reproduce the same way in CI and production [R34][R35].
- **Environment-variable configuration** follows the Twelve-Factor App methodology [R36]. Secrets never enter the codebase [R38].

**Security measures:**

- Ports are bound to `127.0.0.1`, so the dev databases are not reachable from the local network.
- Images are pinned to exact versions instead of `latest`.
- Secrets are generated with `openssl rand` and must be at least 32 characters.

**Verification:**

- Both services reported healthy.
- Both databases exist, and Redis answers `PONG`.
- Data survived a stop and start.
- With the Ollama profile, all three services were healthy.

---

## Entry 3 — NestJS API skeleton (Issue #3, PR #53, 2026-10-09)

**What:** `apps/api`, built on **NestJS 12** [R42] (TypeScript strict [R49], ESM), with the following:

| Concern             | Method                                                                                                                      | Ref        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Configuration       | Schema validation with **Zod** [R44] at boot. The process exits on invalid configuration (fail-fast)                        | [R36][R44] |
| Input validation    | Global `ValidationPipe` (class-validator) with whitelisting, which rejects unknown fields (mass-assignment protection)      | [R38][R39] |
| Error handling      | One error schema for all responses. Internal errors are logged, never exposed                                               | [R38]      |
| Observability       | Structured JSON logging (**pino** [R45]) with a per-request **correlation ID** (`x-request-id`). Sensitive headers redacted | [R37][R45] |
| Health checks       | `GET /api/v1/health` (`@nestjs/terminus`)                                                                                   | [R42]      |
| Cross-origin access | CORS limited to the web app's origin, with credentials                                                                      | [R47]      |
| API style           | Resource-oriented REST under a versioned prefix `/api/v1`                                                                   | [R46]      |

**Testing:** **Vitest** [R43] with 18 tests:

- 6 unit tests for configuration validation.
- 12 end-to-end HTTP tests (supertest) covering health, request IDs, the error shape, validation and CORS.

**Problems and resolutions:**

- **NestJS 12 changed its project defaults.** It now uses ESM modules, Vitest and oxlint instead of CommonJS, Jest and ESLint. We generated a reference project with the official CLI and adopted those defaults. SPEC was updated (D6).
- **`supertest/types` cannot be imported** under `nodenext` module resolution. We removed that type-only import.
- The default Vitest config merge concatenates `include` arrays. Unit and e2e configs were made independent so each runs only its own tests.

**Verification:**

- `pnpm --filter api test`, `lint`, `typecheck` and `build` all pass.
- Running the dev server: `/api/v1/health` → 200 with an `x-request-id` header, and an unknown route → 404 in the standard error shape.
- Booting with an invalid configuration exits and lists every problem.

---

## Entry 4 — Next.js web shell (Issue #4, PR #55, 2026-10-09)

**What:** `apps/web`, built on **Next.js 16** [R50] (App Router, Cache Components, Turbopack), **React 19** [R61], TypeScript strict [R49], **Tailwind CSS 4** [R51] and **shadcn/ui** [R52] on **Radix UI** primitives [R63]:

| Concern       | Method                                                                                                                                                                                                                          | Ref                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Design system | shadcn/ui components (Button, Card, Input, Dialog, Sheet, Skeleton, Dropdown menu), toasts with Sonner [R65], Lucide icons [R64], CSS-variable design tokens                                                                    | [R52][R63][R64][R65] |
| Theming       | Light / dark / system. An **inline script in `<head>` applies the saved theme before first paint**, so there is no flash. React stays in sync through `useSyncExternalStore`. System mode follows the OS `prefers-color-scheme` | [R66][R67]           |
| Layout        | Root layout with sticky header (navigation, theme toggle, sign-in placeholder), footer, a `not-found` page and two error boundaries (`error`, `global-error`)                                                                   | [R50]                |
| Data access   | Typed `api()` client: sends cookies, maps the API's standard error body to `ApiError`, optional Zod response validation [R44]. **TanStack Query** [R62] handles server state (no retries on 4xx)                                | [R44][R62]           |
| Configuration | `NEXT_PUBLIC_API_URL` comes from the shared root `.env` and is inlined at build time; secrets can never be exposed this way                                                                                                     | [R36][R50]           |

**Problems and resolutions:**

- **Next.js 16 differs from older versions.** The generated `AGENTS.md` warns about breaking changes, so we read the docs bundled in `node_modules/next/dist/docs` before writing code. Example: error boundaries now receive `retry()` instead of `reset()`.
- **`next-themes` dropped (D9).** It renders a `<script>` from a Client Component, which React 19 warns about in the console, and the issue requires a clean console. We followed the official Next.js "preventing flash before hydration" pattern instead, which also removes a dependency.
- **A Server Component can't import a constant from a `'use client'` module** (it would receive a client reference). The theme script and constants were moved to a module without the directive (`theme-script.ts`).
- **Root `.env` not reaching the browser (D10).** Next.js only reads `.env` from the app folder. A first attempt with `@next/env`'s `loadEnvConfig` failed silently because it caches the first directory it loads. We found this with a headless-browser test: the status showed "API offline" and no request was made. Fixed by reading the root file with Node's built-in `util.parseEnv` and passing `NEXT_PUBLIC_*` values through `next.config` `env`.
- **Lucide removed brand icons** (no `YoutubeIcon`); a generic `MonitorPlayIcon` is used instead.
- shadcn now uses the `cn` package (from the shadcn-ui organisation) in place of `clsx` + `tailwind-merge`. We checked who publishes it before accepting the dependency.

**Verification:**

- Root `lint`, `typecheck`, `test` and `build` all pass. Both routes prerender as static pages.
- **Headless Chrome smoke test** (Playwright [R57], run outside the repo) with the API and web dev servers running:
  - OS light → light theme; OS dark → dark theme applied before hydration.
  - Choosing Dark in the toggle persists across a reload, and System restores the OS theme.
  - The footer shows "API online", which proves the client, CORS and env wiring work end to end.
  - `/does-not-exist` returns 404 with the custom page.
  - At 360 px width there is no horizontal overflow.
  - **There were no console errors or warnings**, apart from the browser's own expected log line for the 404 resource.

---

## Entry 5 — FastAPI AI service skeleton (Issue #5, PR #56, 2026-10-09)

**What:** `services/ai`, a **Python 3.12** [R75] service on **FastAPI** [R25] / Starlette [R73] served by **Uvicorn** (ASGI) [R72], managed with **uv** [R68]. The folders follow SPEC §5 (`ingestion/`, `processing/`, `generation/prompts/`, `rag/`, `evaluation/`).

| Concern                 | Method                                                                                                                                                                                      | Ref         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Configuration           | **pydantic-settings** [R28] model reading the shared root `.env`. Fail-fast validation with a readable list of problems. Secrets typed as `SecretStr`, so they are masked in logs and reprs | [R28][R36]  |
| Service-to-service auth | Every route except `/health` requires an `X-Internal-Key` header, checked with a **constant-time comparison** (`secrets.compare_digest`) to prevent timing attacks                          | [R76][R38]  |
| Contracts               | Pydantic models with **camelCase** JSON aliases to match the TypeScript side. Errors use **the same body as the NestJS API** (`statusCode, error, message, path, timestamp, requestId`)     | [R28]       |
| Observability           | `x-request-id` is propagated from the API (or generated and sanitised) and attached to every **JSON log line** with method, path, status and duration                                       | [R37]       |
| Health                  | Public `GET /health` reports the selected LLM/embedding provider and vector store and whether each is configured, **without network calls or secrets**                                      |             |
| API docs                | OpenAPI 3.1 [R74] / Swagger UI at `/docs`, **disabled in production**                                                                                                                       | [R74]       |
| Quality gates           | **Ruff** [R69] (lint + format, including Bandit-derived security rules), **mypy `--strict`** [R70][R77], **pytest** [R71] with a `network` marker so live-API tests are opt-in              | [R69]–[R71] |

**Problems and resolutions:**

- **Python version (D11).** The only local interpreters were 3.14 (Homebrew) and 3.9 (system). The AI libraries planned for later issues (CTranslate2/faster-whisper, RAGAS, LangChain, Pinecone SDK) publish wheels for established versions first, so the service pins **3.12** through uv. uv downloads and manages that interpreter, leaving the system Python untouched.
- `uv init` generated a packaged `src/` layout. It was replaced with an application layout (`[tool.uv] package = false`) to match SPEC and `uvicorn app.main:app`. The generated `authors` entry (personal email) was removed so it isn't published.
- **FastAPI 0.143 changed router internals.** Included routers are now `_IncludedRouter` objects, which broke a test that walked `app.routes`. It was rewritten against the **public OpenAPI schema**, where every protected operation declares the `X-Internal-Key` security scheme.
- **Starlette 1.7 deprecates `httpx`** for its test client. Switched to `httpx2`.
- The 500 handler runs outside the request middleware, after the context variable has been reset, so the request ID is also stored on `request.state`.

**Verification:**

- **24 pytest tests**, with 1 network test correctly deselected:
  - configuration defaults, coercion and fail-fast cases; secrets masked;
  - `/health` public, with no secrets;
  - internal-key reject/accept, and a check through OpenAPI that every non-public route is protected;
  - request-ID generation, propagation and sanitising;
  - 404, 422 and 500 error shapes (500 hides details);
  - docs disabled in production.
- `ruff check`, `ruff format --check` and `mypy --strict` are clean.
- `uvicorn app.main:app` with the real `.env`: `/health` → 200 with providers (`configured: false` until the keys are set) and an `x-request-id` header; `/nope` → 404 in the shared error shape; one JSON log line per request. With invalid env (`INTERNAL_API_KEY=change-me`, `LLM_PROVIDER=gemini`) the service exits and lists both problems.

---

## Entry 6 — Shared contracts and CI (Issue #6, PR #57, 2026-10-09) · P0 complete

**What:**

- **`packages/shared`**: Zod [R44] schemas, with inferred TypeScript types, for the cross-service contracts so far:
  - the **error body** used by every service;
  - the API health response (`@nestjs/terminus` shape);
  - the AI service health response.

  It is an ESM package compiled with `tsc`. A `prepare` script builds it on every `pnpm install`, so consumers always resolve real JavaScript and declaration files.

- **Consumers:**
  - The API's exception filter types its responses with the shared `ErrorResponse`, and its e2e tests validate real responses against the schemas.
  - The web app's `api()` client and footer health check use the shared types and the shared `apiHealthSchema`.
- **Contract tests:** the shared package's tests parse **real response bodies captured from the running NestJS and FastAPI services** (#3, #5). This proves both services emit the same error shape, a lightweight form of contract testing [R80].
- **Continuous integration** [R78][R79] with **GitHub Actions** [R81] (`.github/workflows/ci.yml`), on every PR and every push to `main`:
  - **Node job**: install with a frozen lockfile → format → lint → typecheck → test → build. PostgreSQL 16 and Redis 7 run as service containers, ready for #7/#27.
  - **Python job**: uv sync with `--locked` → Ruff lint and format → mypy `--strict` → pytest.
- **Root scripts:** `pnpm lint | typecheck | test` now cover JS and Python together. `:js` variants exist for the Node CI job.

**Security practices in the pipeline** [R82]:

- Third-party actions are **pinned to full commit SHAs**. The tags were resolved through the GitHub API at the time of writing.
- The token has **read-only `contents` permission**.
- Superseded runs are cancelled (`concurrency`), and every job has a timeout.
- Installs are reproducible from lockfiles (`--frozen-lockfile`, `uv sync --locked`).
- The action inputs were checked against each action's `action.yml` for the new major versions (checkout v7, setup-node v7, pnpm v6, setup-uv v10).

**Verification:**

- Locally: `pnpm install` rebuilds `packages/shared/dist` through `prepare`, and the shared package's 5 contract tests pass.
- Root `lint`, `typecheck`, `test` and `build` pass for both JS and Python.
- The compiled API (`node dist/main.js`) runs and returns the shared error shape.
- **CI results are recorded in PR #57** (first run of the workflow).

---

## Decision log

Lightweight architecture decision records [R48]. Each one gives the context, the decision, and what follows from it.

| ID  | Date       | Decision                                                                                                                 | Rationale                                                                                                                                                                                                 |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 2026-10-08 | AI pipeline runs as a separate **Python FastAPI** service                                                                | The transcript tools, Whisper [R6] and RAGAS [R9] are Python-native. Figure 2 of the report already shows the AI pipeline as its own block. NestJS stays the only public API and the only database writer |
| D2  | 2026-10-08 | **One Pinecone namespace per course**                                                                                    | Retrieval can only return chunks from the course being studied. This is the "course-aware" property and limits hallucination [R1][R7]                                                                     |
| D3  | 2026-10-08 | Chunks keep **video timestamps** (`startSec`, `endSec`)                                                                  | Answers and notes can cite and seek to the exact moment in the video, which enables the split-view sync                                                                                                   |
| D4  | 2026-10-08 | RAG **grounding gate**: refuse when the best retrieval score < `RAG_MIN_SCORE`                                           | If retrieval finds nothing relevant, the LLM is never called, so it can't hallucinate an answer [R7][R8]                                                                                                  |
| D5  | 2026-10-08 | **Cognitive Load Index** = weighted Flesch-Kincaid grade, sentence length and concept density                            | Turns the report's "cognitive load" metric into something measurable with established readability formulas [R11][R12], motivated by cognitive load theory [R10]                                           |
| D6  | 2026-10-09 | API uses NestJS 12 defaults: **ESM + Vitest + oxlint** (replacing Jest/ESLint in the original SPEC)                      | Follow the framework's supported defaults instead of retrofitting older tooling                                                                                                                           |
| D7  | 2026-10-09 | **Fail-fast, schema-validated configuration**                                                                            | A misconfiguration is found at startup, not at the first request. Placeholder secrets can't reach production [R36][R38]                                                                                   |
| D8  | 2026-10-09 | Dev infrastructure ports bound to **localhost only**                                                                     | Defence in depth: dev databases use weak default credentials [R38]                                                                                                                                        |
| D9  | 2026-10-09 | Own ~60-line theme store + inline pre-paint script instead of `next-themes`                                              | Avoids React 19's console warning for scripts rendered by Client Components. Follows the official Next.js 16 guide. No flash, and one less dependency [R50]                                               |
| D10 | 2026-10-09 | Web reads the shared root `.env` via `node:util` `parseEnv` and exposes only `NEXT_PUBLIC_*` through `next.config` `env` | Keeps one `.env` for the whole monorepo [R36]. `@next/env` caches the first directory it loads, so it can't be used for this. Real environment variables still take precedence                            |
| D11 | 2026-10-09 | AI service pinned to **Python 3.12**, managed by uv                                                                      | The planned ML/AI dependencies publish wheels for established Python versions first. uv makes the interpreter reproducible without touching the system Python [R68]                                       |
| D12 | 2026-10-09 | AI service mirrors the API's **error shape, camelCase JSON and `x-request-id`**                                          | One error format and one correlation ID across services make debugging and the API's AI client (#26) simpler [R37]                                                                                        |
| D13 | 2026-10-09 | Internal-key auth uses **constant-time comparison**; only `/health` is public; OpenAPI docs off in production            | Prevents timing side channels [R76] and reduces exposed surface. Protection is checked automatically through the OpenAPI schema                                                                           |
| D14 | 2026-10-09 | `packages/shared` is a **compiled ESM package** (built on `prepare`), not raw TypeScript                                 | The NestJS API runs compiled ESM under Node, which can't import `.ts` from a workspace package. One build artefact works for Node, Next.js and Vitest                                                     |
| D15 | 2026-10-09 | CI actions **pinned by commit SHA**, least-privilege token, lockfile-frozen installs                                     | Supply-chain hardening recommended by GitHub [R82]: a moved or compromised tag can't change what runs                                                                                                     |
