# CourseCraft AI — Development Log

A running record of what was built, why, and how it was verified. It is written so it can be turned directly into the **Methods / Implementation** and **Results** chapters of the project report or paper.

- One entry per merged PR, newest at the bottom.
- Citations like **[R12]** refer to [REFERENCES.md](REFERENCES.md).
- Architectural decisions are also collected in the [Decision log](#decision-log) at the end.

---

## Summary

| #   | Date       | Issue / PR                                                                                                                        | Phase | Outcome                                                                                       |
| --- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------- |
| 0   | 2026-10-08 | — / (direct commit)                                                                                                               | —     | SPEC, AGENTS guide, 50-issue roadmap created from report                                      |
| 1   | 2026-10-08 | [#1](https://github.com/subhankar2004/CourseCraft_AI/issues/1) / [#51](https://github.com/subhankar2004/CourseCraft_AI/pull/51)   | P0    | Monorepo template, tooling, repo conventions                                                  |
| 2   | 2026-10-09 | [#2](https://github.com/subhankar2004/CourseCraft_AI/issues/2) / [#52](https://github.com/subhankar2004/CourseCraft_AI/pull/52)   | P0    | Local infrastructure (PostgreSQL, Redis, Ollama) + env                                        |
| 3   | 2026-10-09 | [#3](https://github.com/subhankar2004/CourseCraft_AI/issues/3) / [#53](https://github.com/subhankar2004/CourseCraft_AI/pull/53)   | P0    | NestJS API skeleton: config, validation, errors, logging                                      |
| 4   | 2026-10-09 | [#4](https://github.com/subhankar2004/CourseCraft_AI/issues/4) / [#55](https://github.com/subhankar2004/CourseCraft_AI/pull/55)   | P0    | Next.js web shell: theme, layout, API client, error pages                                     |
| 5   | 2026-10-09 | [#5](https://github.com/subhankar2004/CourseCraft_AI/issues/5) / [#56](https://github.com/subhankar2004/CourseCraft_AI/pull/56)   | P0    | FastAPI AI service skeleton: config, internal-key auth, health                                |
| 6   | 2026-10-09 | [#6](https://github.com/subhankar2004/CourseCraft_AI/issues/6) / [#57](https://github.com/subhankar2004/CourseCraft_AI/pull/57)   | P0    | Shared contracts package + GitHub Actions CI; **P0 complete**                                 |
| 7   | 2026-10-10 | [#7](https://github.com/subhankar2004/CourseCraft_AI/issues/7) / [#58](https://github.com/subhankar2004/CourseCraft_AI/pull/58)   | P1    | Database schema (Prisma 7, 13 tables), migration, DB health check                             |
| 8   | 2026-10-10 | [#8](https://github.com/subhankar2004/CourseCraft_AI/issues/8) / [#59](https://github.com/subhankar2004/CourseCraft_AI/pull/59)   | P1    | Idempotent demo seed: users, 4 domains, 1 real-video course; Argon2id hashing                 |
| 9   | 2026-10-10 | [#9](https://github.com/subhankar2004/CourseCraft_AI/issues/9) / [#60](https://github.com/subhankar2004/CourseCraft_AI/pull/60)   | P1    | Authentication API: register/login/logout/me, JWT cookie sessions, global guards, rate limits |
| 10  | 2026-10-10 | [#10](https://github.com/subhankar2004/CourseCraft_AI/issues/10) / [#61](https://github.com/subhankar2004/CourseCraft_AI/pull/61) | P1    | Domains API: public catalog reads, admin CRUD with slugs and delete protection                |
| 11  | 2026-10-10 | [#11](https://github.com/subhankar2004/CourseCraft_AI/issues/11) / [#62](https://github.com/subhankar2004/CourseCraft_AI/pull/62) | P1    | Courses & lessons read API: catalog list/search/pagination, course outline, lesson reader     |
| 12  | 2026-10-10 | [#12](https://github.com/subhankar2004/CourseCraft_AI/issues/12) / [#63](https://github.com/subhankar2004/CourseCraft_AI/pull/63) | P1    | Web auth: login/register forms, session hooks, user menu, proxy route protection, 403         |
| 13  | 2026-10-10 | [#13](https://github.com/subhankar2004/CourseCraft_AI/issues/13) / [#64](https://github.com/subhankar2004/CourseCraft_AI/pull/64) | P1    | Landing page, responsive navigation, footer; `/auth/session`                                  |
| 14  | 2026-10-10 | [#14](https://github.com/subhankar2004/CourseCraft_AI/issues/14) / [#65](https://github.com/subhankar2004/CourseCraft_AI/pull/65) | P1    | Domain catalog pages: ISR, search + level filter, empty states; build-resilient caching       |
| 15  | 2026-10-10 | [#15](https://github.com/subhankar2004/CourseCraft_AI/issues/15) / [#66](https://github.com/subhankar2004/CourseCraft_AI/pull/66) | P1    | Course overview page with OG/JSON-LD; hydration and rate-limit fixes; **P1 complete**         |
| 16  | 2026-10-10 | [#16](https://github.com/subhankar2004/CourseCraft_AI/issues/16) / [#67](https://github.com/subhankar2004/CourseCraft_AI/pull/67) | P2    | AI provider factory (OpenAI/Ollama), embedding registry, prompt loader, token-usage logging   |
| 17  | 2026-10-10 | [#17](https://github.com/subhankar2004/CourseCraft_AI/issues/17) / [#68](https://github.com/subhankar2004/CourseCraft_AI/pull/68) | P2    | YouTube URL parsing (SSRF-safe) and metadata via yt-dlp; `/ingest/metadata`                   |
| 18  | 2026-10-10 | [#18](https://github.com/subhankar2004/CourseCraft_AI/issues/18) / [#69](https://github.com/subhankar2004/CourseCraft_AI/pull/69) | P2    | Transcripts: youtube-transcript-api + yt-dlp VTT fallback, cleaning, `/ingest/transcript`     |
| 19  | 2026-10-10 | [#19](https://github.com/subhankar2004/CourseCraft_AI/issues/19) / [#70](https://github.com/subhankar2004/CourseCraft_AI/pull/70) | P2    | Whisper fallback (local faster-whisper), caption-language mismatch rule                       |
| 20  | 2026-10-10 | [#20](https://github.com/subhankar2004/CourseCraft_AI/issues/20) / [#71](https://github.com/subhankar2004/CourseCraft_AI/pull/71) | P2    | Timestamp-aware chunking with exact token sizing; property-based tests                        |

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
- **GitHub Actions, first run on PR #57: both jobs green.** Node job (format → lint → typecheck → test → build, with Postgres and Redis service containers) took 1 min 3 s. Python job (uv → Ruff → mypy → pytest) took 17 s. [Run 37835402977](https://github.com/subhankar2004/CourseCraft_AI/actions/runs/37835402977).

---

## Entry 7 — Database schema with Prisma (Issue #7, PR #58, 2026-10-10)

**What:** the relational data model from SPEC §6 [R86], implemented with **Prisma ORM 7** [R53] on PostgreSQL 16 [R40]:

- **13 tables** cover identity (users), the catalog hierarchy (domains → courses → modules → lessons, plus videos and chunks), generation jobs, learning progress (enrollments, lesson_progress), RAG chat (chat_sessions, chat_messages) and evaluation runs. There are **7 PostgreSQL enums**.
- **Integrity in the database itself:**
  - 15 foreign keys with explicit delete rules: 12 `CASCADE` (deleting a course removes its content) and 3 `RESTRICT` (a domain, author or shared cached video that is still referenced can't be deleted).
  - Unique constraints on slugs, emails, YouTube ids, and on `(course, order)`, `(module, order)` and `(lesson, chunk index)`, so the hierarchy can't contain duplicate positions.
- **16 indexes**, including the ones the issue requires (courses by domain and by status, lessons by module, chunks by lesson, chat messages by session) plus foreign-key lookups. **Redundant single-column indexes were dropped** where a composite unique index already starts with that column, because PostgreSQL can use the leading column of a multicolumn B-tree index [R84] and extra indexes only slow writes.
- **snake_case** table and column names in SQL; camelCase in TypeScript (D16).
- **Prisma 7 setup:** `prisma.config.ts` loads the shared root `.env` with Node's `process.loadEnvFile`. The new `prisma-client` generator emits ESM TypeScript (`.js` import extensions for `nodenext`) into `src/generated/prisma` (git-ignored, regenerated on install). Connections go through the `@prisma/adapter-pg` driver adapter on node-postgres [R83].
- **`PrismaService`**: one client and connection pool per process. It connects lazily, so the API still boots and can report the database as down, and it disconnects on shutdown.
- **`/health` now pings PostgreSQL** (`SELECT 1`, 1.5 s timeout): `200` + `database: up`, or `503` + `database: down`.
- **CI** applies the migrations to the fresh PostgreSQL service container on every run (`prisma migrate deploy`) before the tests.

**Problems and resolutions:**

- **Prisma's npm `latest` tag pointed at a release candidate** (`8.0.0-rc.22`) while `@prisma/client`'s was `7.10.0`. The CLI and client must match, so the stable **7.10.0** was pinned for both (D17).
- **Prisma 7 changed the setup.** Before writing code we generated a reference project with `prisma init` and read the official v7 references it ships (config file, driver adapters, ESM, `migrate dev` no longer running `generate`/seed).
- **pnpm 12 blocked Prisma's install scripts** (engine download). `@prisma/engines` and `prisma` were added explicitly to the `allowBuilds` allowlist.
- **Human-in-the-loop safety:** recreating the init migration needed `prisma migrate reset`. **Prisma detected the AI agent and refused** to run the destructive command without the user's explicit consent. The agent stopped and presented the command, the target (the local Docker dev database, verified to contain 0 rows), the reason, and the data-loss and production warnings. **The developer approved**, and the command was rerun with the consent recorded. This is a concrete example of guardrails on AI-assisted development.
- **Terminus failures were being hidden.** The global error filter replaced Terminus' 503 body (which dependency is down) with the generic error shape. Fixed: health-check results pass through unchanged.
- **Information disclosure on a public endpoint.** The built-in Prisma indicator returned the driver's error text ("Invalid `prisma.$queryRawUnsafe()` invocation…"). It was replaced with a small indicator that logs the reason server-side and returns only "Database unreachable" [R85] (D18).
- **Stale dev server:** the Nest watch process stopped recompiling, which briefly made a fixed bug look unfixed. It was caught by checking the compiled output and process start time, and fixed by restarting.

**Verification:**

- `prisma validate` is clean.
- `migrate dev` created all 13 tables on the dev DB, and `migrate deploy` applied the same migration **cleanly to the separate, fresh `coursecraft_test` database**.
- 13 API e2e tests, including **database up** (against real PostgreSQL) and **database down** (503, sanitised message, no driver error text).
- **Real outage test** on a running server: `200 up` → stop the Postgres container → `503 down` with "Database unreachable" → start it → `200 up`.
- Root format, lint, typecheck, test (JS and Python) and build pass.

---

## Entry 8 — Seed script with demo data (Issue #8, PR #59, 2026-10-10)

**What:**

- `apps/api/prisma/seed.ts`, run through Prisma 7's `migrations.seed` hook with `tsx` [R92]. It creates:
  - an **admin** and a **student** account;
  - **4 domains** (Web Development, Data Structures & Algorithms, Database Systems, Machine Learning);
  - one fully populated, published course, **Database Fundamentals**: 2 modules × 2 lessons.
- **Real, verified source material.** The lessons use two freeCodeCamp.org lectures [R90][R91]. Their IDs, titles, durations and **chapter start times were fetched with yt-dlp** [R23] instead of being typed from memory. Each lesson's handwritten Markdown notes contain `[▶ h:mm:ss]` anchors that are exactly those chapter starts. 20 anchors in total, **all inside their video's duration**, which was checked against the database.
- **Idempotent.** Every record is upserted on a natural unique key (email, slug, YouTube id, `(course, order)`, `(module, order)`) in one transaction. Existing accounts keep their password.
- **Password hashing: Argon2id** [R88][R89] with the **OWASP minimum parameters** (m = 19 MiB, t = 2, p = 1) [R87], in a shared `src/auth/password.ts` that the auth module (#9) will reuse. It is salted per hash and stored as a PHC string. Verification never throws on malformed input.

**Credential handling:**

- The seed reads its accounts from `SEED_*` variables, validated with Zod (valid email, password ≥ 12 characters).
- For local development, the developer chose to have strong random passwords generated **directly into the git-ignored `.env`**. They were never printed, logged or committed.
- The seed refuses to run in production unless explicitly allowed.
- CI uses throwaway demo credentials for its ephemeral database.

**Problems and resolutions:**

- **Hash algorithm (D19).** SPEC planned bcrypt, but the OWASP Password Storage Cheat Sheet recommends Argon2id first, with bcrypt for legacy systems. We switched before any password existed, so there was nothing to migrate.
- `@node-rs/argon2` exposes `Algorithm` as an ambient `const enum`, which can't be used under `isolatedModules`, so its numeric value is used with a type-only import.
- `tsx` brings in `esbuild`, whose install script pnpm 12 blocks. That script is only an optimisation (the binary comes from an optional platform package), so it was **explicitly denied** in `allowBuilds` (least privilege), and `tsx` was verified to work.

**Verification:**

- Seeded **3 times** with identical counts (2 users, 4 domains, 1 course, 2 modules, 4 lessons, 2 videos). The admin's password hash was **unchanged** across re-seeds.
- Both accounts' passwords verify against their stored Argon2id hashes (checked programmatically without printing them).
- The guards work: a weak password is rejected with a clear message, and `NODE_ENV=production` refuses.
- 4 new unit tests for password hashing (PHC format and parameters, verify/reject, unique salts, malformed hash).
- **CI now migrates and seeds the fresh database twice on every run.**

---

## Entry 9 — Authentication API (Issue #9, PR #60, 2026-10-10)

**What:** `apps/api/src/auth`:

| Concern                | Design                                                                                                                                                                                                                                                                         | Ref             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| Endpoints              | `POST /auth/register` (201), `POST /auth/login` (200), `POST /auth/logout` (204), `GET /auth/me`                                                                                                                                                                               | [R46]           |
| Credentials            | Argon2id via the shared `password.ts` (#8). Public sign-up **always creates a STUDENT**; a `role` field in the body is rejected (mass-assignment protection)                                                                                                                   | [R87][R39]      |
| Session token          | **JWT** [R54], HS256 with an explicit algorithm allow-list and `iss`/`aud` checks, following the JWT Best Current Practices [R96]. Lifetime from `JWT_EXPIRES_IN`                                                                                                              | [R54][R96]      |
| Transport              | **httpOnly, SameSite=Lax cookie** (`Secure` in production) [R93]: the token is unreadable from JavaScript (limits XSS token theft), and SameSite plus the JSON-only API and strict CORS defend against CSRF [R95]                                                              | [R93][R95][R97] |
| Authorisation          | **Secure-by-default global `JwtAuthGuard`**: every route needs a session unless marked `@Public()`. A global `RolesGuard` enforces `@Roles('ADMIN')`. The user is **reloaded from the database on each request**, so deleted accounts and role changes take effect immediately | [R38]           |
| Enumeration resistance | Login gives **one generic error** for an unknown email or a wrong password, and verifies against a dummy hash when the email is unknown, so **both paths take similar time**                                                                                                   | [R94]           |
| Brute force            | `@nestjs/throttler`: **5 logins per IP per minute**, 5 sign-ups per IP per hour → HTTP 429 [R98], in the standard error body                                                                                                                                                   | [R94][R98]      |
| Validation             | **Shared Zod schemas** (`packages/shared`: register, login, user) through a `ZodValidationPipe`. The web forms in #12 reuse the same rules. Emails are trimmed and lower-cased; passwords are 12–128 characters                                                                | [R44]           |
| Proxies                | New `TRUST_PROXY` setting: client IPs come from `X-Forwarded-For` **only** behind a known proxy (#48); off by default to prevent IP spoofing                                                                                                                                   |                 |

**Problems and resolutions:**

- **Passport vs a plain guard.** SPEC listed Passport-JWT. The current NestJS documentation shows a plain guard with `@nestjs/jwt`, which does the same with fewer dependencies, so we used that (D23).
- **Testing per-IP rate limits** without the tests blocking each other: the test environment enables `TRUST_PROXY=1`, and each test sends its own `X-Forwarded-For` address. That also exercises the proxy configuration production will use.
- A test helper declared `async` wrapped supertest's chainable request in a Promise (`.expect is not a function`). Fixed by returning the request directly.

**Verification:**

- **11 new auth e2e tests** against real PostgreSQL:
  - register → me → logout, with cookie flags (HttpOnly, SameSite=Lax, Path, Max-Age, no Secure in dev) and no hash in responses;
  - `/me` without a session → 401;
  - duplicate email, case-insensitive → 409;
  - self-assigned `role: ADMIN` → 400 with no user created;
  - every invalid field listed;
  - login success;
  - **wrong password and unknown email give an identical 401**;
  - **6th attempt from one IP → 429** while another IP still gets 401;
  - tampered and foreign-signed tokens → 401;
  - a deleted user's token → 401;
  - admin route: student → 403, anonymous → 401, admin → 200.
- New unit tests for env parsing (`JWT_EXPIRES_IN` → seconds, `TRUST_PROXY`) and the shared schemas (normalisation, role rejection).
- **Real server:** the seeded admin logs in (credentials read from `.env`, not printed) → `/me` returns `ADMIN` → logout 204 → `/me` 401. The CORS preflight from the web origin allows credentials.
- Root format, lint, typecheck, test (JS and Python) and build pass.

**Known limitation (documented):** JWTs are stateless, so logout clears the cookie but a copied token stays valid until it expires. Mitigated by the short configurable lifetime and the per-request user reload. A server-side revocation list or token versioning can be added later if needed.

---

## Entry 10 — Domains API (Issue #10, PR #61, 2026-10-10)

**What:** `apps/api/src/domains`, the top level of the Domain → Course → Module → Lesson hierarchy:

- **Public reads** (`@Public()`):
  - `GET /domains`: sorted by name, with the number of **published** courses;
  - `GET /domains/:slug`: the domain and its **published** courses, each with a `lessonCount`.

  Draft or generating courses are never exposed publicly; they are filtered in the database query itself.

- **Admin writes** (`@Roles('ADMIN')`):
  - `POST /domains`: the slug is generated from the name with a shared `slugify` ("Data Structures & Algorithms" → `data-structures-algorithms`). On a clash it becomes `-2`, `-3` and so on, or the request fails with 409 when an explicit slug is taken.
  - `PATCH /domains/:id`: the slug changes only when explicitly given, so published URLs stay stable.
  - `DELETE /domains/:id`: **refused with 409 while any course remains**, with a message saying how many. A race with a concurrent course insert is still caught by the foreign key's `RESTRICT` rule (D16, #7): defence in depth.
- **Status codes** follow HTTP semantics [R99]: 201 created, 204 deleted, 400 invalid, 401/403 auth, 404 unknown, 409 conflict.
- **Shared Zod contracts** (`domainSchema`, `domainDetailSchema`, `courseSummarySchema`, `createDomainSchema`, `updateDomainSchema`, `slugSchema`, `slugify`) for the admin UI (#29) and the catalog pages (#14).
- **Reusable e2e helpers** (`test/helpers.ts`): app factory, `signInAs(role)`, and marker-based cleanup, so tests never depend on an empty database or delete real data.

**Problems and resolutions (including a corrected claim):**

- While reviewing the service, I suspected `NOT: { id: undefined }` would make the duplicate-name check match nothing on create. To verify the fix, I ran a **mutation check** [R100]: I deliberately reinserted the suspected bug and re-ran the tests. The tests still passed. A direct query then showed that **Prisma 7 treats `NOT: {}` as "no filter"**, so **the original code was correct and there was no bug**. The explicit conditional was kept for readability, and the misleading code comment was corrected. Recorded here so the project history doesn't claim a fix that wasn't one.

**Verification:**

- **10 new e2e tests** against PostgreSQL:
  - the list counts only published courses and is sorted;
  - the detail shows only published courses with correct lesson counts;
  - unknown slug → 404;
  - generated slug de-duplicates (`-2`);
  - duplicate name (case-insensitive) → 409, taken explicit slug → 409;
  - every invalid field listed (including the unknown `courseCount`);
  - rename keeps the slug, and an explicit slug change works;
  - deleting an empty domain → 204, a busy one → 409 (drafts counted);
  - unknown id → 404;
  - anonymous → 401, student → 403 on all writes.
- 10 new shared unit tests (`slugify` with accents and symbols, slug rules, input schemas).
- **Real server with the seed data:**
  - `GET /domains` → the 4 seeded domains, with Database Systems = 1 course;
  - `GET /domains/database-systems` → _Database Fundamentals_, 4 lessons;
  - signed in as the seeded admin: create "Cloud Computing" → slug `cloud-computing`; deleting _Database Systems_ → 409 "still has 1 course(s)"; the demo domain deleted → 204.
- Root format, lint, typecheck, test (JS and Python) and build pass.

---

## Entry 11 — Courses and lessons read API (Issue #11, PR #62, 2026-10-10)

**What:** `apps/api/src/courses`, the read side of the learning content:

| Endpoint                                    | Access    | Design                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /courses?domain&q&level&page&pageSize` | public    | **Published only.** Filter by domain slug and level; `q` = case-insensitive match on title/description; **offset pagination** (`page`, `pageSize` ≤ 50) returning `{items, page, pageSize, total, totalPages}`. Count and page are read in one transaction for a consistent total. Deterministic order (title, then id) |
| `GET /courses/:slug`                        | public    | The course **outline**: modules and lessons ordered by their `order` columns, with lesson titles, reading time and video length, **without note bodies** (they load per lesson, keeping the page small). `totalVideoSec` counts each source video **once**, even when several lessons share it                          |
| `GET /lessons/:id`                          | signed in | Notes, key concepts, video (YouTube id, length, channel), module/course context, and **`prevLessonId`/`nextLessonId` across module boundaries** (ordered by module, then lesson)                                                                                                                                        |

- **Object-level access control:** a lesson belonging to an unpublished course returns **404 to students** (not 403, which would confirm it exists) and is **visible to admins** for the review screen (#31). This addresses OWASP API Security's top risk, broken object-level authorisation [R102].
- **Shared contracts:** `courseListQuerySchema` (query-string coercion, limits, unknown parameters rejected), `courseListSchema`, `courseDetailSchema`, `lessonDetailSchema`, for the catalog and lesson pages (#14, #15, #35).
- **Refactor:** the course-card selection and mapping (`course-summary.ts`) is shared by the Domains and Courses services, so there is one definition of what a course card contains.

**Problems and resolutions:**

- **Flaky-by-design test cleanup (D27).** The new suite failed only when run with the others: Vitest runs test files **in parallel** against one database, and each suite's cleanup deleted _all_ e2e-marked users, including the users another suite was still signed in as. Their sessions were then (correctly, per #9) rejected. Fixed with **per-suite fixture scopes** (`createE2eScope()`): every slug, YouTube id and email is built from the suite's own prefix, and cleanup deletes only that scope. This applies the xUnit "fresh fixture" principle of test isolation [R101]. The auth and domains suites were migrated too.
- Domains created _through the API_ get slugs generated from their names, so the domains tests now name them with the suite prefix, keeping them inside the cleanup scope.

**Verification:**

- **10 new e2e tests:**
  - fixtures are created **out of order** on purpose, to prove that ordering comes from the `order` columns;
  - list: domain filter, sorting, draft excluded, lesson counts;
  - pagination (2 pages);
  - search on description (case-insensitive) and title; level filter; no-match;
  - invalid query → 400 listing every problem;
  - outline order, `totalVideoSec` = 600 + 900 with a shared video counted once, no note bodies;
  - draft and unknown course → 404;
  - lesson: 401 without a session; notes, video and context; prev/next **across the module boundary** and null at both ends;
  - draft lesson: student 404, admin 200; unknown → 404.
- 7 new shared unit tests for the query schema.
- **Stability:** the full e2e suite (44 tests) passed in **3 consecutive parallel runs**, with **0 leftover fixtures** in the test database.
- **Real server, seeded data (done-when):**
  - `/courses` lists _Database Fundamentals_;
  - the outline shows 2 modules × 2 lessons and 12.5 h of distinct video;
  - **signed in as the seeded student, all 4 lessons were read by following `nextLessonId`** (module 1 → module 2 → end), each with its notes and 3–6 timestamp anchors;
  - anonymous lesson access → 401.
- Root format, lint, typecheck, test (JS and Python) and build pass.

---

## Entry 12 — Web authentication pages and session handling (Issue #12, PR #63, 2026-10-10)

**What:** the browser side of authentication in `apps/web`.

| Concern          | Design                                                                                                                                                                                                                                                                                                                                                                                                                           | Ref          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Forms            | `/login` and `/register` with **react-hook-form** [R103] and `zodResolver` over the **same shared Zod schemas the API uses** (#9). Inline field errors; API errors mapped back to fields (400) or shown as a form alert (401 generic, 409 duplicate, 429 rate-limited, network)                                                                                                                                                  | [R103][R44]  |
| Accessibility    | Labelled inputs, `aria-invalid` and `aria-describedby` linking each field to its error, `role="alert"` for form errors, appropriate `autocomplete` values                                                                                                                                                                                                                                                                        | [R105]       |
| Session state    | `useMe()` (TanStack Query, `GET /auth/me`, 401 → `null`) shared by every component through the cache. Login and register write the user into the cache; logout **clears the whole cache** so no previous user's data survives                                                                                                                                                                                                    | [R62]        |
| Header           | User menu: initials, name and email, Dashboard, Admin (admins only), Log out. Skeleton while loading; Sign in when signed out                                                                                                                                                                                                                                                                                                    |              |
| Route protection | `src/proxy.ts` (Next.js 16's renamed middleware) makes **optimistic checks** as the Next.js authentication guide recommends [R106]. No cookie on `/dashboard`, `/learn/*` or `/admin/*` → redirect to `/login?next=…`. On `/admin/*`, the role claim is read **without verifying the JWT** (the web app never holds the secret) and non-admins get a **real HTTP 403** page. **The API remains the authority** for every request | [R106][R102] |
| Redirect safety  | `safeNextPath()` accepts only same-site relative paths, rejecting `//host`, `/\host`, `javascript:` and control-character tricks (unvalidated-redirect prevention)                                                                                                                                                                                                                                                               | [R104]       |
| Rendering        | No cookie reads on the server, so **every page stays statically prerendered** under Cache Components; session UI streams in on the client (Next.js "authentication with Cache Components" guidance)                                                                                                                                                                                                                              | [R106]       |

**Decisions:** D29 (same-site deployment), D30 (optimistic proxy plus client session), D31 (no experimental `forbidden()`).

**Problems and resolutions:**

- **Next.js 16 changes**, read from the bundled docs before coding: middleware is now `proxy.ts`; with Cache Components, request-time reads must sit behind `<Suspense>` (the forms read `?next=`, so they're wrapped); `forbidden()` is still experimental, so a normal `/forbidden` page is served with status 403 instead.
- **Browser-test findings, all in the test harness, none in the app:**
  - Next's accessible **route announcer** repeats the page heading and uses `role="alert"`, which made text and alert locators ambiguous. The tests now target headings and in-form alerts specifically.
  - A **hydration-mismatch warning** came from Playwright hiding the text cursor (`caret-color: transparent`) during a screenshot taken before hydration. It disappeared when caret hiding was turned off, which confirms the app itself was clean.
  - Repeated runs from one IP hit **our own rate limits** (5 logins per minute, 5 sign-ups per hour). Restarting the API reset the in-memory counters, and the limiter is shown working as designed.

**Verification:**

- **13 web unit tests** (Vitest): route decisions (public, signed-out, student, admin, malformed token, prefix-vs-segment) and redirect safety (7 attack strings).
- **Real-browser test** (headless Chrome via playwright-core) against the running API and web app, **16/16 checks** with **0 console errors or warnings**:
  1. signed-out `/dashboard` → `/login?next=/dashboard`;
  2. inline Zod errors and `aria-invalid`;
  3. **register → signed in on `/dashboard`**, account menu visible;
  4. **refresh keeps the session**;
  5. duplicate email → 409 message;
  6. wrong password → generic error;
  7. **login → returns to the `?next=` path** (with its query string);
  8. student on `/admin` → **HTTP 403** page;
  9. **logout via the menu** → home with Sign in, and `/dashboard` requires login again;
  10. `?next=//evil.example` ignored;
  11. the seeded admin can open `/admin`, and the menu shows the Admin link.
- The test accounts created by the browser runs were deleted afterwards; only the seeded users remain.
- Production build: all 7 routes static, plus the proxy. Root format, lint, typecheck, test (shared 28, web 13, API 12 + 44, Python) and build pass.

---

## Entry 13 — Landing page and global navigation (Issue #13, PR #64, 2026-10-10)

**What:**

- **Landing page** (`/`), with sections taken from the project report's abstract:
  - hero with CTAs that adapt to the visitor (_Start learning free_ / _Continue learning_ + _Browse domains_);
  - **the problem** (scattered content, time lost searching, long videos);
  - **how it works** (Ingest → Structure → Learn & ask);
  - **what you get** (learning path, study notes, course-aware assistant);
  - **featured domains** from the API.

  No invented statistics or testimonials.

- **Featured domains are fetched on the server and cached** with Next.js 16 `'use cache'` + `cacheLife('hours')` + `cacheTag('domains')` [R107], so the page is a **static page that revalidates in the background** (stale-while-revalidate semantics [R108]). If the API can't be reached, the function returns a fallback with `cacheLife('seconds')`. The build then still succeeds (CI has no API) and the section recovers within about a minute.
- **Responsive navigation** [R109]: inline links from 640 px up, a slide-in **Sheet** menu on phones; `aria-current` on the active link. _Dashboard_ and _Admin_ appear only for signed-in users and admins.
- **Footer:** project summary, academic credits (Dept. of CSE, VSSUT Burla, supervisor Dr. Sucheta Panda), links to the domains page, the GitHub repository and the report PDF, the licence, and the API status.
- **New API endpoint `GET /auth/session`** (D32): always **200**, `{ user | null }`. The guard's token logic moved into `AuthService.resolveSession()`, so the guard and the endpoint share one implementation. `useMe()` now uses it.

**Problems and resolutions:**

- **Builds must not depend on a running API.** We verified both cases: with the API up, `/` is **fully static** with the domains baked into the HTML (revalidate 1 h, expire 1 d). With the API unreachable, the build succeeds and `/` becomes a **partial prerender**: a static shell plus a skeleton, with the domains streamed later.
- **Console noise for signed-out visitors.** The browser test found `401 Unauthorized` logged on every signed-out page view, because `useMe()` called `/auth/me`. That's correct HTTP, but a poor experience and it hides real errors. Fixed with the always-200 session endpoint, the same approach common auth libraries take. The #12 login-flow test was re-run as a regression check and **no longer needs any filter for expected 401s**.

**Verification:**

- **Responsive browser test** (headless Chrome) at **360, 768 and 1280 px in light and dark: 27/27 checks, 0 console errors or warnings.**
  - No horizontal scrolling at any width.
  - The hero and all 4 domain cards render.
  - The correct navigation for each width (phone menu below 640 px).
  - **The phone menu opens, navigates and closes.**
  - The hero CTA goes to `/register`.
  - The footer credits VSSUT and the supervisor.
- **#12 regression:** the login flow is still 16/16 with 0 console errors.
- New API e2e test: `/auth/session` returns `{user:null}` for no cookie and for a garbage cookie, and the user when signed in. API e2e total: 45.
- Root format, lint, typecheck, test (shared 28 · web 13 · API 12 + 45 · Python) and build pass.

---

## Entry 14 — Domain catalog pages (Issue #14, PR #65, 2026-10-10)

**What:**

- **`/domains`**: grid of domain cards (description, published-course count), with a skeleton while loading.
- **`/domains/[slug]`**: breadcrumb, heading, description and count, then the domain's **course cards** (YouTube thumbnail through `next/image`, title, description, level, lesson count) with:
  - **search** (case-insensitive and **accent-insensitive**; every word must match, across title and description) and **level filter** (`aria-pressed` toggle buttons);
  - filtering runs **client-side** over the already-loaded list (instant, no extra requests), and the **state lives in the URL** (`?q=&level=`, search debounced 250 ms), so filtered views can be shared and bookmarked;
  - **empty states**: a domain with no courses, and "no courses match" with _Clear filters_. Unknown slug → 404.
- **Incremental Static Regeneration with Cache Components** [R110]: `generateStaticParams` prerenders every known domain at build time (`cacheLife('hours')`). Domains created later are served instantly through the **App Shell** and filled in on demand (Partial Prefetching). `params` is awaited inside `<Suspense>`, as the Next.js guide requires.
- **Images:** YouTube's CDN (`i.ytimg.com/vi/**`) is allow-listed in `remotePatterns`. **First-row thumbnails load eagerly** (they are often the Largest Contentful Paint [R111]); the rest load lazily.
- Shared `DomainCards`, used by both the landing page and `/domains`.

**Problems and resolutions: making builds independent of the API (D34).** This needed four hypotheses, each tested by building with the API reachable, unreachable, and **absent (CI-like)**, and checking exit codes:

1. _Shared `cacheLife('seconds')` failure entries_ (the #13 approach) produced **"Unexpected cache miss after cache warming phase"** once a second route (`/domains`) and `generateStaticParams` used the same function. The docs explain why: entries with `expire` under 5 minutes are **excluded from prerenders**.
2. _Shared constant vs fresh object_: hypothesis **rejected** by experiment (the error remained).
3. _Throw inside `use cache` and catch in the page, deferring with `connection()`_: **failed the build**. An error thrown inside a cached function fails the prerender even when the caller catches it, and the error **loses its class across the cache boundary**, so `instanceof` checks don't work.
4. **Adopted:** cached functions **never throw**. On failure they return `UNAVAILABLE` cached with **`cacheLife('minutes')`**, which is long enough to be included in prerenders and **revalidates every minute**, so pages heal soon after the API is back. Success caches for hours. `generateStaticParams` uses a separate **uncached** build-time fetch with a placeholder param, since Cache Components needs at least one.

Result: **all three build scenarios exit 0 with no errors**. With the API up, domain pages are static (revalidate 1 h); without it, static with revalidate 1 min.

- A clean **git worktree of `main`** was used to compare builds, after a `git stash` comparison turned out invalid (untracked files stayed in place). Recorded so the method can be reproduced.
- The browser test flagged the thumbnail as the LCP element loaded lazily, so first-row images became eager. The optimizer itself was verified separately (HTTP 200, a 14 KB optimized JPEG).

**Verification:**

- **19 web unit tests** (6 new for `filterCourses`/`parseCourseFilter`: empty filter, title and description, all terms required, accents, level, combined, unknown level, length cap).
- **Browser test** (headless Chrome), **16/16 checks, twice in a row, 0 console problems**:
  - `/domains` shows 4 cards;
  - navigating into Database Systems shows the breadcrumb and the seeded course card (title, _Beginner_, _4 lessons_);
  - the **thumbnail loads, eager-loaded**;
  - search `sql` → 1 and `?q=` updates; `quantum` → the empty state; Clear filters resets the UI and URL;
  - level Advanced → 0 (`aria-pressed`), Beginner → 1;
  - a **deep link** `?level=Beginner&q=normaliz` restores the state;
  - an empty domain shows the no-courses message; an unknown domain → 404;
  - **360 px: no horizontal scroll**.
- Root format, lint, typecheck, test (shared 28 · web 19 · API 12 + 45 · Python) and build pass.

---

## Entry 15 — Course overview page (Issue #15, PR #66, 2026-10-10) · P1 complete

**What:** `/courses/[slug]`:

- **Header:** breadcrumb (Domains / domain / course); title; description; facts (level, modules, lessons, **total video time** formatted as e.g. "12h 28m", counting each source video once); thumbnail; and an **enroll CTA** that is a placeholder until #33. Signed-out visitors see _Sign in to enroll_, which returns them to the course via `?next=`; signed-in students see a disabled _Enroll_ with "Enrollment opens soon".
- **Curriculum:** an accessible **accordion** (Radix via shadcn; `aria-expanded`), first module open, each lesson with its order and reading time.
- **Sharing and search:**
  - **Open Graph and Twitter Card metadata** [R113] (title, description, absolute URL and thumbnail image via `metadataBase` from the new `NEXT_PUBLIC_SITE_URL`, canonical URL);
  - **schema.org `Course` JSON-LD** [R112], with `<` escaped as `\u003c` so database content can't break out of the script tag (Next.js JSON-LD guidance).
- **ISR**, same pattern as the domain pages: known courses prerendered (`generateStaticParams` walks the paginated course list at build), the App Shell for new ones, `UNAVAILABLE` cached for minutes when the API is down.

**Two bugs found by the regression run and fixed:**

1. **Hydration mismatch (latent since #12).** The course content streams in through a nested `<Suspense>`. When that late HTML hydrated, the client's session query had _already_ resolved, so `EnrollButton` rendered differently from the server's skeleton, and React threw _"Hydration failed"_. The fix was made **once, in `useMe()`**: a `useHydrated()` hook (`useSyncExternalStore` with a server snapshot of `false`, React's standard hydration-safe pattern [R114]) makes the hook report "pending" until hydration finishes, so server and client HTML always match. Every session-aware component benefits.
2. **Rate limit on `/auth/session` (introduced in #13).** Re-running the earlier browser suites produced `429 Too Many Requests` on page views. `@SkipThrottle()` without arguments only skips a throttler named `default`, and ours is `auth`, so session checks counted against the 20-per-minute auth limit: a user opening more than 20 pages a minute would have looked signed out. Fixed with `@SkipThrottle({ auth: true })`. A **new e2e test** (30 rapid session checks from one IP, all 200) was **mutation-checked**: it fails with the bug restored and passes with the fix.

- A browser check of the phone menu became timing-sensitive once `/domains` existed: client-side navigation now plays the close animation. The test now waits for the menu to hide, with a timeout.

**Verification:**

- **Course browser test, 16/16, 0 console problems:**
  - reached from the domain page; breadcrumb; facts (Beginner, 2 modules, 4 lessons, 12h 28m of video); description;
  - module 1 open, module 2 collapsed (`aria-expanded=false`); expanding shows its lessons; reading times;
  - **signed-out CTA → login → back to the course as the seeded student → disabled Enroll placeholder**;
  - OG image = the thumbnail; JSON-LD `@type: Course`;
  - unknown course → 404; **360 px with no horizontal scroll**.
- **Regression, all browser suites with 0 console problems:** #12 login 16/16, #13 landing 27/27, #14 domains 16/16.
- Build: **API up**, `/courses/database-fundamentals` is prerendered with OG and JSON-LD in the HTML; **API unreachable and CI-like**, exit 0 with no prerender errors (only our own `[catalog]` log lines).
- Unit tests: web 28 (new duration and plural formatting tests), shared 28, API 12 + **46** e2e. Root format, lint, typecheck, test (JS + Python) and build pass.

**Phase P1 complete (#7–#15):** schema and migrations, seed, authentication, domains and courses API, and the web auth, landing, catalog and course pages. A visitor can now sign up, browse domains, filter courses and read a course outline.

---

## Entry 16 — LLM/embedding provider factory and prompt loader (Issue #16, PR #67, 2026-10-10) · P2 begins

**What:** the foundation of the AI pipeline in `services/ai/app/generation/`, on **LangChain 1.x** [R20] (`langchain-core` 1.6, `langchain-openai` 1.7, `langchain-ollama` 1.1). Only the core and the two provider integrations are installed, not the full `langchain` package.

| Module                    | Design                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `providers.py`            | `get_chat_model(settings, operation=…)` and `get_embeddings(settings)` return **OpenAI** (`ChatOpenAI`, `OpenAIEmbeddings`) or **Ollama** (`ChatOllama`, `OllamaEmbeddings`) models depending on `LLM_PROVIDER`. **Every model name comes from configuration.** Timeouts and retries are configurable (`LLM_TIMEOUT_S`, `LLM_MAX_RETRIES`). A missing OpenAI key raises a clear `ProviderNotConfiguredError`               |
| `embedding_models.py`     | Registry of supported embedding models: **dimension** and **Pinecone index suffix** (`text-embedding-3-small` 1536-d `-te3s`, `-3-large` 3072-d `-te3l`, `nomic-embed-text` 768-d `-nomic`, `mxbai-embed-large` 1024-d `-mxbai`)                                                                                                                                                                                           |
| config validation         | The service **refuses to start if `PINECONE_INDEX` doesn't match the embedding model** (D38). Switching to Ollama while pointing at the OpenAI index would otherwise mix 768-d and 1536-d vectors and break retrieval                                                                                                                                                                                                      |
| `prompts.py` + `prompts/` | **Versioned prompt files** (D39): Markdown with front matter (`name`, `version`, `description`, `variables`) and `{{variable}}` placeholders. Single braces stay literal, so prompts can contain JSON or code. **Strict:** undeclared placeholders, unused variables, and missing or unexpected values are all errors. `name@version` will be **stored with generated content** for provenance and reproducible evaluation |
| `usage.py`                | `TokenUsageCallback` (a LangChain callback) is attached to every chat model by the factory. It logs **one JSON line per call** (operation, model, input/output/total tokens, request id) and can add to a thread-safe `UsageTotals` for a whole job (#27). It reads the standard `usage_metadata`, falling back to OpenAI's `token_usage` (D40)                                                                            |
| `/health`                 | Now also reports `embeddingDimension` (the shared TypeScript schema is updated to match)                                                                                                                                                                                                                                                                                                                                   |

**Problems and resolutions:**

- **mypy and LangChain aliases.** `OpenAIEmbeddings` accepts `api_key`/`timeout` at runtime, but its typed constructor doesn't expose those aliases, so the real field names (`openai_api_key`, `request_timeout`) are used. In tests the key is narrowed with `isinstance(..., SecretStr)`, because LangChain also accepts key-provider callables.
- **Request ids in logs (D41).** A test showed the formatter read the request id at **format** time, so a record formatted later (or on another thread) could lose it. Fixed at the root: a **log-record factory** stamps the request id onto each record **when it is created**.
- Config errors that span several fields had no field name (`- : …`); they are now labelled `CONFIG`.

**Verification:**

- **20 new Python tests**, all offline, using LangChain's fake models:
  - the factory builds OpenAI models from config (model, temperature, retries, key);
  - **switching to Ollama swaps both models with no code change**;
  - every chat model carries the usage callback;
  - a missing key fails clearly;
  - prompt parsing and strict rendering: 5 invalid-file cases, missing and unexpected values, literal insertion, path-traversal names rejected, name/filename check;
  - usage totals across calls;
  - **a JSON log line with request id, operation and token counts**;
  - the OpenAI fallback and missing usage;
  - embedding dimensions; **index/model mismatch rejected**; unknown model rejected.
- **Real service (done-when):**
  - default → `openai | gpt-4o-mini | text-embedding-3-small (1536-d)`;
  - `LLM_PROVIDER=ollama` with `PINECONE_INDEX=coursecraft-nomic` → `ollama | llama3.1:8b | nomic-embed-text (768-d)`, **with no code changes**;
  - `LLM_PROVIDER=ollama` with the OpenAI index → **refuses to start** and explains the required suffix.
- Python: 44 tests, Ruff, mypy `--strict` (27 files). JS: shared, web, API and build pass.

No real model calls are made yet; the first will be in #21 (embeddings) and #23 (notes), which need an OpenAI API key.

---

## Entry 17 — YouTube URL parsing and metadata via yt-dlp (Issue #17, PR #68, 2026-10-10)

**What:** SPEC §7.1 step 1, in `services/ai/app/ingestion/`:

- **`youtube_urls.py`: a strict parser** for `watch`, `youtu.be`, `shorts`, `embed`, `live` and `playlist` URLs, including `m.`, `music.` and `youtube-nocookie.com`. It extracts an 11-character video id or a playlist id.
  - **Rejected:** other sites, look-alike hosts (`youtube.com.evil.example`), credentials in URLs, unusual ports, non-HTTP schemes (`javascript:`, `file:`), malformed ids, channels and searches, and over-long input.
  - A watch URL carrying `list=` is treated as the single video it points to; whole playlists use `/playlist?list=`.
- **SSRF defence (D42).** yt-dlp supports over a thousand sites, so a user's URL **never reaches it**. Only **canonical URLs rebuilt from validated ids** are passed to yt-dlp, which is also restricted to the `youtube`, `youtube:playlist` and `youtube:tab` extractors (`allowed_extractors`, anchored regexes). This follows the OWASP SSRF guidance of allow-listing inputs rather than trying to filter bad ones [R116].
- **`metadata.py`: yt-dlp** [R23] with `skip_download` (nothing is downloaded):
  - per video: title, channel, duration, language, **chapters** (start and title), and a stable `i.ytimg.com/.../hqdefault.jpg` thumbnail (already allow-listed by the web app);
  - **playlists are listed flat** (no per-video resolution) and fetch one extra entry to detect truncation beyond `MAX_VIDEOS_PER_COURSE` (now shared by the API and the AI service);
  - per-video lookups run **in parallel** (4 threads, input order kept);
  - duplicates are removed;
  - **unavailable videos (private, removed, live or upcoming, no duration) are reported with a clean reason instead of failing the batch** (D43).
- **`POST /ingest/metadata`** (internal key required): `{urls[]}` or `{playlistUrl}` → `{videos, failed, truncated, maxVideos}`. **Every invalid URL is listed at once** (`urls[1]: …`). The error handler now passes lists of messages through as arrays, as the shared error contract allows.

**Problems and resolutions:**

- **A crash found by the tests:** `javascript:alert(...)` became `https://javascript:alert(...)`, and Python's `urlsplit` raises `ValueError` _lazily_ when `.port` is read on a non-numeric port. The port is now read inside the guarded block.
- **Readable failure reasons:** yt-dlp errors (`ERROR: [youtube] <id>: Private video`) are cleaned with one anchored pattern, leaving just `Private video`.
- **Typing:** yt-dlp has no inline types, so the typeshed stubs (`types-yt-dlp`) were added, keeping strict mypy meaningful rather than ignoring the module.
- `HTTP_422_UNPROCESSABLE_ENTITY` is deprecated in Starlette in favour of `…_CONTENT` (the RFC 9110 name) [R99]. The suite now runs cleanly with deprecation warnings treated as errors.
- The #5 "network tests must be opt-in" canary (a test that always fails if network tests run) was retired, now that real network tests exist.

**Verification:**

- **33 URL tests:** 13 valid video forms, 2 playlist forms, and **17 rejected inputs**, including the cloud metadata address `169.254.169.254`, `file://`, a look-alike host, credentials, an odd port, `javascript:` and script injection in the id.
- **Metadata and endpoint tests** (fake extractor):
  - canonical URL and options passed to yt-dlp; field mapping, chapters and thumbnail;
  - live, upcoming and no-duration videos rejected; clean error reasons (3 cases);
  - flat playlist listing with truncation;
  - de-duplication, order, failure collection, the cap;
  - endpoint: camelCase response, playlist, every invalid URL listed, 5 bad request shapes, wrong internal key → 401.
- **Live YouTube (`pytest -m network`): 2/2 in about 6 s**: the seed's SQL course (title, channel, over 4 h, 20+ chapters) and a 6-video freeCodeCamp playlist capped at 3 (`truncated: true`).
- **Real service with the internal key:**
  - playlist → 6 videos, `truncated: false`;
  - a mixed list with a duplicate, a `&t=` timestamp and a non-existent id → 2 videos plus `failed: "This video is unavailable"`;
  - **SSRF attempt** with `http://169.254.169.254/…` → 422, nothing fetched;
  - no key → 401.
- Python: 97 offline + 2 network tests, Ruff, mypy `--strict` (33 files). JS: all checks and build pass.

---

## Entry 18 — Transcript fetching (Issue #18, PR #69, 2026-10-10)

**What:** SPEC §7.1 step 2 (before Whisper), `services/ai/app/ingestion/transcripts.py`:

- **Source order:**
  1. **youtube-transcript-api** [R22] (v1.2): **manual English → auto-generated English → YouTube's translation to English → the original-language captions**, labelled honestly;
  2. **yt-dlp subtitle tracks** [R23] as **WebVTT** (manual, then automatic English), used when the first source is blocked, fails or finds nothing.
- **Normalisation:** `{text, start, duration}` segments; HTML entities unescaped; non-speech noise removed (`[Music]`, `[Applause]`, `(laughs)`, `♪`, `>>`); whitespace collapsed; empty segments dropped; sorted by time.
- **WebVTT parser** [R117] that handles YouTube's **"rolling" auto-captions**: each line first appears with inline word timings, then repeats in 10 ms hold cues and in the next cue. Lines matching one of the last few emitted lines are dropped, and inline tags are stripped. The same algorithm handles manual captions, where a cue's two lines form one sentence.
- **Two error types for the job pipeline:**
  - `NoTranscriptError` → **404**: no captions exist, or the video is inaccessible. Definitive; Whisper (#19) takes over.
  - `TranscriptUnavailableError` → **503** + `Retry-After: 60`: YouTube blocked or couldn't be reached. Retry later.
- **Defence in depth:** caption files are only downloaded from `https://*.youtube.com` URLs, on top of the #17 SSRF rule.
- **`POST /ingest/transcript`** (internal key): `{youtubeId}` (11-character id validated) → `source`, `language`, `translatedFrom`, `fetchedWith`, `segmentCount`, `coveredSec`, `segments`.

**Problems found by testing, and their fixes:**

1. **Mis-timed auto captions (a real bug).** YouTube's auto cues contain a line holding a single space, and the cue splitter treated "newline, whitespace, newline" as a separator. That cut each cue in two and attached its text to the _next_ cue's time, about 1.5 s late, which would have pushed every timestamp anchor in auto-captioned lessons late. Cues are now split only on **empty** lines, as the WebVTT spec defines. The fixture test now asserts the start times, and a **mutation check** confirmed it fails with the old splitter. On real data the parser's timestamps now **match youtube-transcript-api's exactly** (first five: 2.24, 3.84, 5.28, 7.40, 8.92 s; 1,640 vs 1,642 segments, the difference being noise-only segments).
2. **A misleading 503 (design fix).** For one real video the only captions were auto-generated and **labelled Hindi, but the speech was English**, written phonetically in Devanagari (YouTube mis-detection). YouTube refused to translate them (`NotTranslatable`), so the code fell through to yt-dlp, whose machine-translated track request failed, and the result was "temporarily unavailable", although YouTube was reachable. Now each translation attempt is independent, and the **original-language captions are returned with their real language** (200, `language: "hi"`, 2,204 segments). That is correct for genuinely non-English lectures, which the LLM can still turn into English notes.
3. **Recorded for #19 (GitHub issue and ISSUES.md updated):** mislabelled captions like these are unusable, so Whisper should also run when the **caption language differs from the video's spoken language** (from #17's metadata).

**Verification:**

- **26 new offline tests**:
  - noise cleaning (6 cases);
  - manual VTT (two-line cue, HTML entities, hour timestamps, NOTE block);
  - **rolling auto VTT** (no repeats, **correct start times**);
  - the decision tree with fake APIs: manual over auto; auto fallback with noise removed; translation; **refused translation → original language without calling yt-dlp**; untranslatable track; inaccessible video → 404 with no fallback; disabled → yt-dlp → none;
  - **blocked or network failure → yt-dlp VTT** (3 error kinds); `en-orig` mapping; **captions from non-YouTube hosts never fetched**; both sources failing → temporary error;
  - endpoint: shape, 404, 503 with `Retry-After`, 3 invalid ids.
- **Live YouTube (`pytest -m network`): 6/6 in about 20 s**:
  - **manual English** (the seed's SQL course: over 1,000 segments);
  - **auto English** (`kqtD5dpn9C8`);
  - **no captions → `NoTranscriptError`** (`LXb3EKWsInQ`);
  - **the yt-dlp fallback parsing real VTT** with no rolling repeats;
  - plus #17's metadata tests.
- **Real service:** the SQL course → 200, 4,514 segments covering 15,638.6 s (the full video); the mislabelled video → 200 with `hi`; no-captions video → 404.
- Python: 123 offline + 6 network tests, Ruff, mypy `--strict`. JS: all checks and build pass.

---

## Entry 19 — Whisper transcription fallback (Issue #19, PR #70, 2026-10-10)

**What:** speech-to-text for videos without usable captions, **running locally and free** (`services/ai/app/ingestion/whisper.py`):

- **Whisper** [R6] through **faster-whisper** [R24] (CTranslate2 [R119]), on the **CPU with int8 quantisation** (CTranslate2 has no Apple GPU backend). **Voice-activity detection** (Silero VAD [R120]) skips silence and music, which also reduces Whisper's known tendency to hallucinate text over non-speech audio. Each 30 s window is decoded independently (`condition_on_previous_text=False`) to avoid the repetition loops long lectures can trigger.
- **Audio only** is downloaded with yt-dlp as the **original stream, with no conversion**, so **no ffmpeg binary is needed**: faster-whisper decodes it with PyAV [R118]. It goes into a **temporary directory that is always deleted**, even when transcription fails. The **length is checked before downloading** against `WHISPER_MAX_MINUTES` (default 90). The download is retried once.
- **When Whisper runs** (D47):
  1. **no captions exist** (404 from the caption sources);
  2. **the caption language ≠ the spoken language** (`spokenLanguage` from #17's metadata), for YouTube auto-captions generated in the wrong language (found in #18).

  It never runs for inaccessible videos. If Whisper can't run in case 2 (too long, download failed), the existing captions are kept rather than failing.

- **Outcomes:** `source: WHISPER`, `fetchedWith: whisper`, the detected language, cleaned segments. Music-only audio → "no speech detected" (404). Too long → 404 with the reason. Download failure → 503 (retry).
- New settings: `WHISPER_ENABLED`, `WHISPER_MAX_MINUTES` (plus the existing `WHISPER_MODEL`: tiny, base, small or medium).

**Problems found while building it:**

1. **Dependency incompatibility.** faster-whisper 1.2.1 (the latest) calls `av.open(metadata_errors=…)`, which **PyAV 19 removed**, so every transcription crashed. Testing PyAV versions showed **18.1 is the newest compatible one**; it is pinned `>=18,<19`, with a comment to lift the pin once faster-whisper supports PyAV 19.
2. **Music-only videos.** Two candidate "no-caption" videos produced **0 segments** with low language confidence (about 0.55): they contain no speech, and VAD correctly removed everything. This confirmed the "no speech detected" path.
3. **Transient HTTP 403** from YouTube's media servers on one audio download. A format probe minutes later downloaded every format successfully, so the error was transient. It is retried once, and still surfaces as a retryable 503 if it persists.
4. faster-whisper has no type information and no stubs package, so a **targeted mypy override** for that module only keeps `--strict` everywhere else; its results are wrapped in typed dataclasses.

**Measured on the developer's MacBook (Apple M5, `base` model, CPU int8):**

| Video                                                                      | Audio | Time                       | Result                                                                                                      |
| -------------------------------------------------------------------------- | ----- | -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `Tk1t3WKK-ZY` "What is a database in under 4 minutes" (**no captions**)    | 226 s | **9.1 s (~25× real time)** | 59 segments, English (p = 1.0)                                                                              |
| `jNQXAC9IVRw` "Me at the zoo" (2005 phone audio, human captions available) | 19 s  | 0.9 s                      | Near-identical to the human captions, with 2 word errors ("one of" for "in front of", "punks" for "trunks") |

**Known limitation:** for the #18 video, **YouTube's own metadata language is also `hi`**: YouTube mis-detected the whole video, not just its captions. The mismatch rule therefore can't fire automatically for such videos (it was exercised by passing `spokenLanguage: "en"` manually). A possible improvement is a **language probe**: let Whisper detect the language from a short audio sample when the captions are auto-generated and non-English.

**Verification (done-when ✅):**

- **A no-caption video produces a transcript locally:** `Tk1t3WKK-ZY` → `WHISPER`, 59 segments covering the full 226 s, through the real endpoint (19 s end to end).
- **16 new offline tests:**
  - no captions → Whisper (with cleaning);
  - an inaccessible video never reaches Whisper;
  - **the mismatch rule** in 5 cases (Hindi captions vs English speech → Whisper; same base language; unknown spoken language; YouTube translation is intentional);
  - captions kept when Whisper can't run (3 failure kinds);
  - too long → definitive; download failure → temporary; music only → "no speech"; Whisper disabled;
  - **the length guard skips before downloading**;
  - **audio deleted even when the model crashes**.
- **Live (`pytest -m network`): 7/7 in about 41 s**, including real Whisper on the no-caption video.
- **Real mismatch path:** `4ZZrP68yXCI` + `spokenLanguage: "en"` → Whisper attempted → skipped (126 min > 90) → captions kept, all visible in the logs.
- Python: 139 offline + 7 network tests, Ruff, mypy `--strict`. JS: all checks and build pass.

---

## Entry 20 — Timestamp-aware chunking (Issue #20, PR #71, 2026-10-10)

**What:** SPEC §7.1 step 3, `services/ai/app/processing/chunking.py`:

- **Whole transcript segments** are packed in order into chunks of **≤ 800 tokens**, and each chunk begins with **≤ 120 tokens repeated from the previous one**, so ideas that cross a boundary stay retrievable [R8]. Sizes come from `CHUNK_TARGET_TOKENS` and `CHUNK_OVERLAP_TOKENS`.
- **Real timestamps:** each chunk's `startSec`/`endSec` are actual caption boundaries, needed for citations and "jump to this moment" links. Each chunk also records **`overlapChars`**, how much of its text repeats the previous chunk, which retrieval will use to de-duplicate neighbours (#40).
- **Exact token sizing** with tiktoken `cl100k_base` [R29] (the tokenizer of the `text-embedding-3` models): sizes are measured on the **joined text**, not summed per segment.
- Oversized segments (rare) are split **word by word** under the same exact check, with their time span shared in proportion to length. A pathological single "word" is cut by tokens.

**Property-based testing** [R121] with **Hypothesis** [R122]. Instead of a few hand-picked cases, the generator produces hundreds of random transcripts (random words, durations and segment counts; random chunk and overlap sizes) and checks the invariants on every one:

- **no text lost:** the chunks with their overlaps removed rebuild the transcript **exactly**;
- no chunk exceeds the target, and the reported token counts are exact;
- start and end times never go backwards;
- the repeated text really is the previous chunk's ending, and is ≤ the overlap limit;
- **every chunk adds new text.**

**Bugs found by property testing (each reduced to a minimal counterexample):**

1. **Token sums overshoot.** BPE tokenisation is context-sensitive at word boundaries (`"normalization"` vs `" normalization"`), so adding up per-segment counts let chunks exceed the limit. A 2-word counterexample showed it. Fixed by measuring the joined text exactly.
2. **LangChain's token splitter only approximates its limit:** it estimates merged sizes the same way, so the oversized-segment test produced pieces over 100 tokens. It was replaced with exact word packing, and the `langchain-text-splitters` dependency was dropped (a deliberate deviation from the issue text).
3. **A flawed test oracle.** Detecting overlap by string matching gave false positives on repetitive text ("database database …"). Overlap became explicit data (`overlapChars`), which the tests now check exactly.
4. **Repeat-only chunks.** Found by a **2,000-example run** that the default 150 examples missed: with target 20 and overlap 10, carrying a 5-token segment forward left no room for the next 16-token segment, producing a chunk made entirely of repeated text. The overlap now always leaves room for the next new segment. A regression test pins the minimal case, and **CI now runs the thorough profile** (2,000 examples, about 5 s).

**Verification:**

- **The issue's acceptance case:** a deterministic **1-hour transcript** (1,200 caption segments of 3 s) → chunks start at 0.0 s and **end at exactly 3600.0 s**; every boundary is a real 3 s segment boundary; chunks are well filled (> 600 tokens each).
- **Real data:** the seed's **4 h 20 min SQL course** (4,514 caption segments, 61,784 tokens) → **91 chunks in 0.33 s**; tokens min/avg/max **564/789/800**; average overlap **112 tokens**; no repeat-only chunks; the last chunk ends at 15,638.6 s, the full video.
- 11 chunking tests (incl. the property test and the minimal regression), new config validation (overlap < chunk). The thorough profile passed 3 consecutive random runs.
- Python: 151 offline + 7 network tests, Ruff, mypy `--strict`. JS: all checks and build pass.

---

## Decision log

Lightweight architecture decision records [R48]. Each one gives the context, the decision, and what follows from it.

| ID  | Date       | Decision                                                                                                                                                   | Rationale                                                                                                                                                                                                 |
| --- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 2026-10-08 | AI pipeline runs as a separate **Python FastAPI** service                                                                                                  | The transcript tools, Whisper [R6] and RAGAS [R9] are Python-native. Figure 2 of the report already shows the AI pipeline as its own block. NestJS stays the only public API and the only database writer |
| D2  | 2026-10-08 | **One Pinecone namespace per course**                                                                                                                      | Retrieval can only return chunks from the course being studied. This is the "course-aware" property and limits hallucination [R1][R7]                                                                     |
| D3  | 2026-10-08 | Chunks keep **video timestamps** (`startSec`, `endSec`)                                                                                                    | Answers and notes can cite and seek to the exact moment in the video, which enables the split-view sync                                                                                                   |
| D4  | 2026-10-08 | RAG **grounding gate**: refuse when the best retrieval score < `RAG_MIN_SCORE`                                                                             | If retrieval finds nothing relevant, the LLM is never called, so it can't hallucinate an answer [R7][R8]                                                                                                  |
| D5  | 2026-10-08 | **Cognitive Load Index** = weighted Flesch-Kincaid grade, sentence length and concept density                                                              | Turns the report's "cognitive load" metric into something measurable with established readability formulas [R11][R12], motivated by cognitive load theory [R10]                                           |
| D6  | 2026-10-09 | API uses NestJS 12 defaults: **ESM + Vitest + oxlint** (replacing Jest/ESLint in the original SPEC)                                                        | Follow the framework's supported defaults instead of retrofitting older tooling                                                                                                                           |
| D7  | 2026-10-09 | **Fail-fast, schema-validated configuration**                                                                                                              | A misconfiguration is found at startup, not at the first request. Placeholder secrets can't reach production [R36][R38]                                                                                   |
| D8  | 2026-10-09 | Dev infrastructure ports bound to **localhost only**                                                                                                       | Defence in depth: dev databases use weak default credentials [R38]                                                                                                                                        |
| D9  | 2026-10-09 | Own ~60-line theme store + inline pre-paint script instead of `next-themes`                                                                                | Avoids React 19's console warning for scripts rendered by Client Components. Follows the official Next.js 16 guide. No flash, and one less dependency [R50]                                               |
| D10 | 2026-10-09 | Web reads the shared root `.env` via `node:util` `parseEnv` and exposes only `NEXT_PUBLIC_*` through `next.config` `env`                                   | Keeps one `.env` for the whole monorepo [R36]. `@next/env` caches the first directory it loads, so it can't be used for this. Real environment variables still take precedence                            |
| D11 | 2026-10-09 | AI service pinned to **Python 3.12**, managed by uv                                                                                                        | The planned ML/AI dependencies publish wheels for established Python versions first. uv makes the interpreter reproducible without touching the system Python [R68]                                       |
| D12 | 2026-10-09 | AI service mirrors the API's **error shape, camelCase JSON and `x-request-id`**                                                                            | One error format and one correlation ID across services make debugging and the API's AI client (#26) simpler [R37]                                                                                        |
| D13 | 2026-10-09 | Internal-key auth uses **constant-time comparison**; only `/health` is public; OpenAPI docs off in production                                              | Prevents timing side channels [R76] and reduces exposed surface. Protection is checked automatically through the OpenAPI schema                                                                           |
| D14 | 2026-10-09 | `packages/shared` is a **compiled ESM package** (built on `prepare`), not raw TypeScript                                                                   | The NestJS API runs compiled ESM under Node, which can't import `.ts` from a workspace package. One build artefact works for Node, Next.js and Vitest                                                     |
| D15 | 2026-10-09 | CI actions **pinned by commit SHA**, least-privilege token, lockfile-frozen installs                                                                       | Supply-chain hardening recommended by GitHub [R82]: a moved or compromised tag can't change what runs                                                                                                     |
| D16 | 2026-10-10 | **snake_case** SQL names via `@@map`/`@map`; camelCase in TypeScript                                                                                       | Follows PostgreSQL convention (unquoted identifiers, friendlier raw SQL and BI tools) without changing the application code                                                                               |
| D17 | 2026-10-10 | Pin **Prisma 7.10.0** (CLI and client), not the `8.0.0-rc` that npm marked `latest`                                                                        | Stable release; the CLI and client versions must match. Upgrade deliberately later                                                                                                                        |
| D18 | 2026-10-10 | Custom database health indicator returning a **generic "Database unreachable"**                                                                            | `/health` is public; driver errors can reveal internals. Details go to the server log only [R85]                                                                                                          |
| D19 | 2026-10-10 | Passwords hashed with **Argon2id** (m=19 MiB, t=2, p=1), not bcrypt                                                                                        | OWASP's first recommendation [R87]; Argon2 won the Password Hashing Competition and is standardised in RFC 9106 [R88][R89]. Switched before any password existed                                          |
| D20 | 2026-10-10 | Seed course uses **real videos with yt-dlp-verified chapter timestamps**                                                                                   | Demo data that behaves like real data: anchors seek to real moments, and no fabricated video IDs                                                                                                          |
| D21 | 2026-10-10 | Seed credentials only via `SEED_*` env (generated into `.env`, never printed); production guard                                                            | Secrets never enter code, git or chat logs [R38]; demo accounts can't be created in production by accident                                                                                                |
| D22 | 2026-10-10 | **Secure-by-default** global auth guard with an explicit `@Public()` opt-out                                                                               | Forgetting a decorator can't expose a route; public routes are a visible, reviewable choice [R38]                                                                                                         |
| D23 | 2026-10-10 | JWT in an **httpOnly SameSite=Lax cookie**, `@nestjs/jwt` + plain guard (no Passport), user reloaded per request                                           | Keeps the token away from JavaScript; CSRF mitigated by SameSite, JSON-only bodies and strict CORS [R93][R95]; fewer dependencies; instant effect of deletions and role changes                           |
| D24 | 2026-10-10 | Request validation for auth uses the **shared Zod schemas** via a `ZodValidationPipe`                                                                      | One definition of the rules for API and web forms, which can't drift apart [R44]                                                                                                                          |
| D25 | 2026-10-10 | `TRUST_PROXY` off by default; per-IP login/register rate limits                                                                                            | Prevents IP spoofing through `X-Forwarded-For`, and slows brute-force and sign-up abuse [R94][R98]                                                                                                        |
| D26 | 2026-10-10 | Public catalog shows **published** courses only (filtered in the query); slugs stable unless explicitly changed; domain delete blocked while courses exist | No draft leaks; shareable URLs don't break; no orphaned or accidentally deleted content (application check + FK RESTRICT)                                                                                 |
| D27 | 2026-10-10 | **Per-suite e2e fixture scopes**; cleanup never by a global pattern                                                                                        | Test files run in parallel on one database; isolation keeps them deterministic and safe on a seeded database [R101]                                                                                       |
| D28 | 2026-10-10 | Unpublished lessons → **404 for students**, visible to admins; outline excludes note bodies                                                                | Object-level authorisation without revealing that drafts exist [R102]; smaller course payloads                                                                                                            |
| D29 | 2026-10-10 | Web and API must be served from the **same site** in production (one domain, `/api` → API)                                                                 | Lets the web proxy see the httpOnly session cookie for route protection; also keeps cookies first-party. Implemented in #48/#50                                                                           |
| D30 | 2026-10-10 | **Optimistic** route checks in `proxy.ts` (cookie presence, unverified role claim) + client-side session via `useMe()`                                     | Follows the Next.js 16 guidance: no secret in the web tier, no DB/API calls in the proxy, static pages preserved; the API enforces all real authorisation [R106]                                          |
| D31 | 2026-10-10 | No experimental Next.js APIs (`forbidden()` / `authInterrupts`); plain `/forbidden` page with status 403                                                   | Stability for a graded project; the same user-facing result                                                                                                                                               |
| D32 | 2026-10-10 | `GET /auth/session` always returns 200 (`user: null` when signed out); `/auth/me` keeps 401                                                                | Clean browser consoles for anonymous visitors; strict semantics preserved for API clients; one shared resolution function                                                                                 |
| D33 | 2026-10-10 | Server-side catalog data via `'use cache'` + explicit `cacheLife` (`hours`, or `seconds` on failure)                                                       | Static, fast pages that refresh in the background [R107][R108]; builds and CI don't need a running API                                                                                                    |
| D34 | 2026-10-10 | Cached catalog reads **never throw**; on failure return `UNAVAILABLE` with `cacheLife('minutes')`; uncached build-time fetch for `generateStaticParams`    | Builds succeed without an API (CI); avoids prerender failures and cache-warming misses; pages recover within about a minute (found by four tested hypotheses, Entry 14)                                   |
| D35 | 2026-10-10 | Course search and filter run **client-side** with state in the URL                                                                                         | Instant results over a small, already-loaded list; shareable and bookmarkable filtered views; pages stay static                                                                                           |
| D36 | 2026-10-10 | `useMe()` is **hydration-safe** (pending until hydrated via `useSyncExternalStore`)                                                                        | Session-aware client components can sit inside late-streamed Suspense boundaries without hydration mismatches [R114]; fixed centrally instead of per component                                            |
| D37 | 2026-10-10 | Course pages publish **Open Graph/Twitter metadata and schema.org Course JSON-LD**                                                                         | Rich link previews and search-engine understanding of courses [R112][R113]; escaped against script injection                                                                                              |
| D38 | 2026-10-10 | Embedding-model registry; **startup check that `PINECONE_INDEX` matches the embedding model**                                                              | Mixing vector sizes in one index silently breaks retrieval; fail fast with a clear fix instead                                                                                                            |
| D39 | 2026-10-10 | **Versioned Markdown prompts** with strict `{{variable}}` rendering; `name@version` stored with outputs                                                    | Prompts are reviewable and diffable; no silently blank variables; generated content is traceable to the exact prompt (reproducible evaluation)                                                            |
| D40 | 2026-10-10 | Token usage logged per call via a LangChain callback, with job totals                                                                                      | Cost visibility and control (SPEC §11) without touching call sites                                                                                                                                        |
| D41 | 2026-10-10 | Request id captured at **log-record creation** (record factory)                                                                                            | Correct correlation even when records are formatted later or on another thread [R115]                                                                                                                     |
| D42 | 2026-10-10 | **User URLs never reach yt-dlp**: strict parse → canonical URL from the id; yt-dlp limited to YouTube extractors                                           | yt-dlp can fetch over a thousand sites; allow-listing prevents server-side request forgery through the ingestion API [R116]                                                                               |
| D43 | 2026-10-10 | Unavailable videos are **reported per video**, not fatal to the batch                                                                                      | One private or removed video shouldn't block a whole course; admins see why in the job (#27/#30)                                                                                                          |
| D44 | 2026-10-10 | Transcript order: manual EN → auto EN → translation → original language (labelled) → yt-dlp VTT; **404 = no captions, 503 = retry later**                  | Best available text with honest labelling; the job pipeline can tell "use Whisper" apart from "try again later"                                                                                           |
| D45 | 2026-10-10 | Own WebVTT parser with rolling-caption de-duplication; split cues on **empty lines only** (per the spec)                                                   | YouTube auto-captions repeat lines and contain whitespace-only lines; correct timing is essential for timestamp anchors and citations [R117]                                                              |
| D46 | 2026-10-10 | Whisper runs **locally** (faster-whisper, CPU int8, VAD, `base` default); audio downloaded without conversion; length checked first                        | Free and private (matches the free-models plan and the report's Future Work); fast enough on Apple Silicon (~25× real time); no ffmpeg dependency                                                         |
| D47 | 2026-10-10 | Whisper when there are **no captions** or the **caption language ≠ spoken language**; otherwise keep captions                                              | Captions are cheaper and usually accurate; Whisper fixes the two failure cases seen on real data. If Whisper can't run, keep what exists instead of failing                                               |
| D48 | 2026-10-10 | Chunks = whole segments packed to ≤ 800 tokens with ≤ 120-token overlap, **sizes measured exactly** on joined text; overlap recorded per chunk             | Real timestamp boundaries for citations; strict size guarantees (summing or approximate splitters overshoot); explicit overlap enables de-duplication in retrieval                                        |
| D49 | 2026-10-10 | **Property-based tests** (Hypothesis), thorough profile (2,000 examples) in CI                                                                             | Found four defects that example tests missed, each reduced to a minimal case [R121][R122]                                                                                                                 |
