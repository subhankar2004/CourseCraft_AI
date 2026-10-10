# AGENTS.md — CourseCraft AI

Working agreement for anyone (human or AI coding agent) contributing to this repo. Read this first, then [SPEC.md](SPEC.md).

## What this project is

CourseCraft AI turns YouTube videos into structured courses (**Domain → Course → Module → Lesson**) with AI-generated Markdown study notes, a split-view (video + notes) learning page, and a **course-aware RAG chatbot** that answers only from the course's own transcripts. It is a B.Tech minor project at VSSUT Burla (2025–26). The requirements come from [docs/report/CourseCraftAI.pdf](docs/report/CourseCraftAI.pdf). The buildable plan is in [SPEC.md](SPEC.md).

## Team

- **Subhankar Patra** is the sole developer and owns everything: frontend, backend, AI pipeline and deployment.
- **Claude Code** is the AI pair programmer. It implements tasks, writes tests and keeps these docs current, under Subhankar's direction.
- Shibani Taria (co-author of the report) is no longer working on the build. Ignore the work split in Table 2 of the report.

Since there is no second human reviewer, every change touching more than one package (for example, an API contract change) updates all affected sides in the same change. It gets a self-review (or `/code-review`) before merging.

## Architecture in one breath

`apps/web` (Next.js) → `apps/api` (NestJS, **sole PostgreSQL writer** via Prisma, BullMQ jobs on Redis) → `services/ai` (FastAPI + LangChain: transcripts, chunking, embeddings to pgvector, LLM notes, RAG, evaluation). The web app never calls the AI service. The AI service never touches the application tables; it owns only the `vector_store` schema (pgvector). Every vector query is **scoped to one courseId**. Details are in SPEC §3.

## Current status

Track progress here. Update this section at the end of every working session.

- [x] P0 Setup — monorepo, docker-compose, lint, env, health checks, shared contracts, CI (#1–#6)
- [x] P1 Core — Prisma schema, auth, domains/courses read API, seed, web auth, landing, catalog and course pages (#7–#15)
- [x] P2 Ingestion — metadata, transcripts (+ Whisper fallback), chunking, embeddings + pgvector, fixtures (#16–#22)
- [ ] P3 Generation — notes map-reduce, structuring, job + SSE progress, admin UI
- [ ] P4 Learning UX — split view, timestamp seek, progress, next lesson, dashboard
- [ ] P5 RAG chat — grounding gate, citations, chat drawer
- [ ] P6 Evaluation — faithfulness / relevance / cognitive load runs
- [ ] P7 Deploy & report

**Next up:** Issue #26 (API: AI service client module).

## How we work: 50 issues → 50 PRs

- The roadmap is [docs/ISSUES.md](docs/ISSUES.md), mirrored as GitHub issues #1–#50 on `subhankar2004/CourseCraft_AI`, with milestones P0–P7.
- Each session: "do issue #N" → branch `<type>/<N>-<short-slug>` (e.g. `feat/9-auth-api`) → implement → lint + tests → PR titled like the issue with `Closes #N` → Subhankar reviews and merges.
- Respect the issue's "Depends on" list. If scope changes, edit both the GitHub issue and docs/ISSUES.md.
- Tick the phase checkbox below when its last issue merges.

**Open decisions:** see SPEC §14.

## Commands

Run from the repo root. The full guide is [docs/setup.md](docs/setup.md).

```bash
# One-time setup
cp .env.example .env                 # single root .env for all services; replace change-me secrets
pnpm install                         # JS deps; also builds packages/shared (prepare script)
pnpm ai:sync                         # Python 3.12 venv for services/ai (uv)

# Infrastructure
pnpm infra:up                        # postgres + redis, waits until healthy
pnpm infra:down | pnpm infra:reset   # stop | stop and wipe volumes

# Run (separate terminals)
pnpm --filter api dev                # http://localhost:4000/api/v1/health
pnpm --filter web dev                # http://localhost:3000
pnpm ai:dev                          # http://localhost:8000/health (+ /docs outside production)
pnpm dev                             # web + api + shared (watch) together; AI service via ai:dev

# Quality (the same checks CI runs: .github/workflows/ci.yml)
pnpm format:check
pnpm lint                            # oxlint (api) + eslint (web) + ruff (ai)
pnpm typecheck                       # tsc (all TS packages) + mypy --strict (ai)
pnpm test                            # vitest (shared, api) + pytest (ai)
pnpm build

# Per package
pnpm --filter api test               # unit (src/**/*.spec.ts) + e2e (test/**/*.e2e-spec.ts); e2e needs PostgreSQL (infra:up)
pnpm --filter api prisma:migrate --name <change>   # create + apply a migration (dev DB)
pnpm --filter api prisma:generate    # regenerate the client (also runs on pnpm install)
pnpm --filter api prisma:deploy      # apply pending migrations (test/prod; non-destructive)
pnpm --filter api prisma:seed        # idempotent demo data (needs SEED_* in .env)
pnpm --filter api prisma:studio      # browse the database
pnpm --filter shared build           # rebuild contracts after editing packages/shared
uv --directory services/ai run pytest -m network   # opt-in live-API tests
```

## Conventions

**General**

- TypeScript `strict` everywhere. No `any` without a comment explaining why.
- Python: type hints everywhere (`mypy --strict`), Pydantic v2 models for all I/O, formatted with `ruff format`. JSON contracts are camelCase (`CamelModel` in `app/schemas.py`) to match the TypeScript side.
- AI service routes: only `/health` is public. Every other router must be included on the `internal` router in `create_app()`, so it requires `X-Internal-Key`. A test checks this through the OpenAPI schema.
- Secrets come only from env vars. Never commit `.env`. Add every new variable to `.env.example` and SPEC §12.
- **Next.js 16 is newer than most training data:** before writing web code, read [apps/web/AGENTS.md](apps/web/AGENTS.md) and the bundled docs in `apps/web/node_modules/next/dist/docs/` (e.g. error boundaries take `retry`, not `reset`).
- Keep the code idiomatic for each framework: NestJS modules/controllers/services/DTOs (ESM: relative imports end in `.js`); Next.js App Router with server components by default; FastAPI routers per feature folder.

**Auth (API)**

- **Secure by default:** the global `JwtAuthGuard` protects every route. Mark intentionally public routes with `@Public()`, and admin routes with `@Roles('ADMIN')`. Get the signed-in user with `@CurrentUser()`.
- Validate request bodies with the shared Zod schemas: `@Body(new ZodValidationPipe(schema))`.
- Never return `passwordHash`; select only public user fields.
- e2e tests: use `test/helpers.ts`. Each suite creates its own `createE2eScope()` and builds every slug, YouTube id and email from that scope's `prefix`/`emailDomain`; `cleanupE2eData(prisma, scope)` then deletes only that suite's data. Test files run **in parallel** on one database, so never clean up by a global pattern, and never assume an empty database.

**Auth (web)**

- Session state: `useMe()` / `useLogin()` / `useRegister()` / `useLogout()` in `src/lib/auth/hooks.ts` (TanStack Query, key `['auth','me']`). Don't read cookies in Server Components (it would break the static shell under Cache Components).
- Route protection lives in `src/proxy.ts` + `src/lib/auth/access.ts` and is optimistic only. Every real permission check happens in the API.
- Redirect targets from the URL go through `safeNextPath()`.
- Forms: react-hook-form + `zodResolver(<shared schema>)`, `FormField` for accessible inputs, `applyApiError()` for server errors.
- Server-side catalog reads: `'use cache'` functions in `src/lib/catalog.ts`. They **never throw**: on API failure they return `UNAVAILABLE` cached with `cacheLife('minutes')` (an error thrown inside `use cache` fails the build even if caught, and `'seconds'` entries are excluded from prerenders). Success uses `cacheLife('hours')`. Wrap readers in `<Suspense>`, and await `params` inside the boundary (ISR with Cache Components).
- `generateStaticParams` uses uncached build-time fetches and must return at least one param (placeholder when the API is down).
- `useMe()` reads `GET /auth/session` (always 200), never `/auth/me`. It is **hydration-safe**: it reports `isPending` until the component has hydrated, so session-aware components can live inside late-streamed `<Suspense>` boundaries. Always handle `isPending` (render a skeleton).
- Throttler decorators must name the throttler: `@SkipThrottle({ auth: true })`. A bare `@SkipThrottle()` only skips one called `default`.
- Avoid experimental Next.js APIs (e.g. `forbidden()` / `authInterrupts`) unless there's a strong reason.

**API contracts**

- REST under `/api/v1`. Request DTOs are validated (class-validator in Nest, Zod in web).
- Shared TS types and Zod schemas live in `packages/shared`. Python mirrors live in `services/ai/app/schemas.py`. Change both together.
- Streaming (chat tokens, job progress) uses **SSE**, not WebSockets.

**Database**

- Prisma **7** (`apps/api/prisma/schema.prisma`, config in `apps/api/prisma.config.ts`): the client is generated into `apps/api/src/generated/prisma` (git-ignored) and connects through the `@prisma/adapter-pg` driver adapter. Import it from `../generated/prisma/client.js`, and use the injected `PrismaService` (one pool per process).
- PostgreSQL names are snake_case (`@@map`/`@map`); the TypeScript stays camelCase.
- **Never** run destructive commands (`migrate reset`, `db push --force-reset`, dropping data) without the user's explicit consent. Prisma itself blocks AI agents from doing this.

- Schema changes only through Prisma migrations, with descriptive names (`add_lesson_cognitive_load`).
- Ordered children (modules, lessons) use an `order` int with a unique `(parentId, order)` pair.

**AI pipeline**

- Prompts live as files in `services/ai/app/generation/prompts/`, not inline strings, so they can be versioned and reviewed.
- All LLM / embedding calls go through `app/generation/providers.py` (`get_chat_model(settings, operation=…)` / `get_embeddings(settings)`), which respects `LLM_PROVIDER` (openai | ollama). Never hard-code a model name outside config. Pass a descriptive `operation` (it labels the token-usage log) and, for jobs, a shared `UsageTotals`.
- New embedding models must be added to `app/generation/embedding_models.py` (dimension + index suffix).
- Prompts: `load_prompt("name").render(...)`; record `prompt.id` (`name@version`) with generated content and bump `version` on any wording change.
- **Never pass user-supplied URLs to yt-dlp or any fetcher.** Parse them with `app.ingestion.youtube_urls.parse_youtube_url()` and build canonical URLs from the validated ids; keep yt-dlp's `allowed_extractors` restricted to YouTube.
- Chunks must keep `startSec/endSec`. Citations and timestamp seeking depend on it.
- The RAG answer path must keep the **grounding gate** (`RAG_MIN_SCORE`) and the "answer only from context" system prompt. Do not weaken these to make a demo look better. They are the core claim of the project.
- Use real YouTube calls only in tests marked `@pytest.mark.network`. Default unit tests use the fixtures in `services/ai/tests/fixtures/` (`tests/fixture_data.py` loads them; `pnpm ai:fixtures` re-records them). New pipeline stages extend `tests/test_ingestion_pipeline.py`, which replays the outside world and runs the real code.

**Git**

- Branches: `<type>/<issue>-<slug>` (e.g. `feat/9-auth-api`, `chore/2-local-infra`). Types: `feat`, `fix`, `chore`, `test`, `docs`.
- Commits: Conventional Commits (`feat(ai): add whisper fallback`).
- `main` must always build. Work on a branch per phase or feature, run lint + tests + a self-review (`/code-review`), then merge.

## Rules for AI coding agents

1. Read SPEC.md before starting a task. If the task conflicts with the spec, stop and ask. Do not silently diverge.
2. Work one milestone at a time (see Current status), as a vertical slice: API + AI + UI together. Keep changes scoped. Do not scaffold future phases early. If time gets tight, follow the scope guard in SPEC §13.
3. When you change behavior, update SPEC.md in the same change (endpoints, schema, env vars, metrics).
4. Run lint + tests for the affected package before declaring a task done, and report failures honestly.
5. Do not add new dependencies or services beyond SPEC §4 without asking.
6. Never commit secrets, `.env`, model weights, downloaded audio, or large transcripts.
7. **Every PR keeps the research record current** (it feeds the project report and paper):
   - [docs/PROGRESS.md](docs/PROGRESS.md): add an entry with what was built, why, the methods used, problems and how they were solved, verification results, and any new decision (D-number) in the decision log.
   - [docs/REFERENCES.md](docs/REFERENCES.md) + [docs/references.bib](docs/references.bib): add every new technology, library, method, standard or paper, in IEEE style. Mark planned entries ✅ when they are used. Never invent citation details; mark anything unverified with ⚠ verify.
8. At the end of a session, update **Current status** and **Next up** above.

## Key references

- Report: [docs/report/CourseCraftAI.pdf](docs/report/CourseCraftAI.pdf). Fig. 1 = workflow, Fig. 2 = architecture, Fig. 3 = RAG loop, Table 3 = evaluation metrics
- All citations: [docs/REFERENCES.md](docs/REFERENCES.md). Development history and decisions: [docs/PROGRESS.md](docs/PROGRESS.md)
