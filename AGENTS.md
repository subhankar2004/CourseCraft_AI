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

`apps/web` (Next.js) → `apps/api` (NestJS, **sole PostgreSQL writer** via Prisma, BullMQ jobs on Redis) → `services/ai` (FastAPI + LangChain: transcripts, chunking, embeddings to Pinecone, LLM notes, RAG, evaluation). The web app never calls the AI service. The AI service never touches PostgreSQL. Pinecone **namespace = courseId**. Details are in SPEC §3.

## Current status

Track progress here. Update this section at the end of every working session.

- [ ] P0 Setup — monorepo, docker-compose, lint, env, health checks
- [ ] P1 Core — Prisma schema, auth, domains/courses CRUD, seed + web layout, auth pages, catalog browsing
- [ ] P2 Ingestion — metadata, transcripts (+ Whisper fallback), chunking, embeddings
- [ ] P3 Generation — notes map-reduce, structuring, job + SSE progress, admin UI
- [ ] P4 Learning UX — split view, timestamp seek, progress, next lesson, dashboard
- [ ] P5 RAG chat — grounding gate, citations, chat drawer
- [ ] P6 Evaluation — faithfulness / relevance / cognitive load runs
- [ ] P7 Deploy & report

**Next up:** Issue #6, shared contracts package and CI pipeline (completes P0).

## How we work: 50 issues → 50 PRs

- The roadmap is [docs/ISSUES.md](docs/ISSUES.md), mirrored as GitHub issues #1–#50 on `subhankar2004/CourseCraft_AI`, with milestones P0–P7.
- Each session: "do issue #N" → branch `<type>/<N>-<short-slug>` (e.g. `feat/9-auth-api`) → implement → lint + tests → PR titled like the issue with `Closes #N` → Subhankar reviews and merges.
- Respect the issue's "Depends on" list. If scope changes, edit both the GitHub issue and docs/ISSUES.md.
- Tick the phase checkbox below when its last issue merges.

**Open decisions:** see SPEC §14.

## Commands

_Planned. Fill these in as each piece is scaffolded, and keep them accurate._

```bash
cp .env.example .env                 # once; single root .env for all services
pnpm infra:up                        # postgres + redis (docker compose up -d --wait)
pnpm infra:down | infra:reset        # stop | stop + wipe volumes
pnpm install
pnpm --filter web dev                # http://localhost:3000 (needs the API running for the status dot)
pnpm --filter api dev                # http://localhost:4000/api/v1/health
pnpm --filter api test               # vitest: unit (src/**/*.spec.ts) + e2e (test/**/*.e2e-spec.ts)
pnpm --filter api prisma migrate dev
pnpm --filter api prisma db seed
pnpm ai:sync                         # uv sync (Python 3.12 venv in services/ai/.venv)
pnpm ai:dev                          # http://localhost:8000/health (docs at /docs outside production)
pnpm lint && pnpm test               # JS/TS
pnpm ai:lint && pnpm ai:typecheck && pnpm ai:test   # ruff, mypy --strict, pytest (-m network for live tests)
```

## Conventions

**General**

- TypeScript `strict` everywhere. No `any` without a comment explaining why.
- Python: type hints everywhere (`mypy --strict`), Pydantic v2 models for all I/O, formatted with `ruff format`. JSON contracts are camelCase (`CamelModel` in `app/schemas.py`) to match the TypeScript side.
- AI service routes: only `/health` is public. Every other router must be included on the `internal` router in `create_app()`, so it requires `X-Internal-Key`. A test checks this through the OpenAPI schema.
- Secrets come only from env vars. Never commit `.env`. Add every new variable to `.env.example` and SPEC §12.
- **Next.js 16 is newer than most training data:** before writing web code, read [apps/web/AGENTS.md](apps/web/AGENTS.md) and the bundled docs in `apps/web/node_modules/next/dist/docs/` (e.g. error boundaries take `retry`, not `reset`).
- Keep the code idiomatic for each framework: NestJS modules/controllers/services/DTOs (ESM: relative imports end in `.js`); Next.js App Router with server components by default; FastAPI routers per feature folder.

**API contracts**

- REST under `/api/v1`. Request DTOs are validated (class-validator in Nest, Zod in web).
- Shared TS types and Zod schemas live in `packages/shared`. Python mirrors live in `services/ai/app/schemas.py`. Change both together.
- Streaming (chat tokens, job progress) uses **SSE**, not WebSockets.

**Database**

- Schema changes only through Prisma migrations, with descriptive names (`add_lesson_cognitive_load`).
- Ordered children (modules, lessons) use an `order` int with a unique `(parentId, order)` pair.

**AI pipeline**

- Prompts live as files in `services/ai/app/generation/prompts/`, not inline strings, so they can be versioned and reviewed.
- All LLM / embedding calls go through one provider factory that respects `LLM_PROVIDER` (openai | ollama). Never hard-code a model name outside config.
- Chunks must keep `startSec/endSec`. Citations and timestamp seeking depend on it.
- The RAG answer path must keep the **grounding gate** (`RAG_MIN_SCORE`) and the "answer only from context" system prompt. Do not weaken these to make a demo look better. They are the core claim of the project.
- Use real YouTube calls only in tests marked `@pytest.mark.network`. Default unit tests use the fixtures in `services/ai/tests/fixtures/`.

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
