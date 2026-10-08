# CourseCraft AI — Development Log

A running record of what was built, why, and how it was verified. It is written so it can be turned directly into the **Methods / Implementation** and **Results** chapters of the project report or paper.

- One entry per merged PR, newest at the bottom.
- Citations like **[R12]** refer to [REFERENCES.md](REFERENCES.md).
- Architectural decisions are also collected in the [Decision log](#decision-log) at the end.

---

## Summary

| #   | Date       | Issue / PR                                                                                                                      | Phase | Outcome                                                  |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------- |
| 0   | 2026-10-08 | — / (direct commit)                                                                                                             | —     | SPEC, AGENTS guide, 50-issue roadmap created from report |
| 1   | 2026-10-08 | [#1](https://github.com/subhankar2004/CourseCraft_AI/issues/1) / [#51](https://github.com/subhankar2004/CourseCraft_AI/pull/51) | P0    | Monorepo template, tooling, repo conventions             |
| 2   | 2026-10-09 | [#2](https://github.com/subhankar2004/CourseCraft_AI/issues/2) / [#52](https://github.com/subhankar2004/CourseCraft_AI/pull/52) | P0    | Local infrastructure (PostgreSQL, Redis, Ollama) + env   |
| 3   | 2026-10-09 | [#3](https://github.com/subhankar2004/CourseCraft_AI/issues/3) / [#53](https://github.com/subhankar2004/CourseCraft_AI/pull/53) | P0    | NestJS API skeleton: config, validation, errors, logging |

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

## Decision log

Lightweight architecture decision records [R48]. Each one gives the context, the decision, and what follows from it.

| ID  | Date       | Decision                                                                                            | Rationale                                                                                                                                                                                                 |
| --- | ---------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 2026-10-08 | AI pipeline runs as a separate **Python FastAPI** service                                           | The transcript tools, Whisper [R6] and RAGAS [R9] are Python-native. Figure 2 of the report already shows the AI pipeline as its own block. NestJS stays the only public API and the only database writer |
| D2  | 2026-10-08 | **One Pinecone namespace per course**                                                               | Retrieval can only return chunks from the course being studied. This is the "course-aware" property and limits hallucination [R1][R7]                                                                     |
| D3  | 2026-10-08 | Chunks keep **video timestamps** (`startSec`, `endSec`)                                             | Answers and notes can cite and seek to the exact moment in the video, which enables the split-view sync                                                                                                   |
| D4  | 2026-10-08 | RAG **grounding gate**: refuse when the best retrieval score < `RAG_MIN_SCORE`                      | If retrieval finds nothing relevant, the LLM is never called, so it can't hallucinate an answer [R7][R8]                                                                                                  |
| D5  | 2026-10-08 | **Cognitive Load Index** = weighted Flesch-Kincaid grade, sentence length and concept density       | Turns the report's "cognitive load" metric into something measurable with established readability formulas [R11][R12], motivated by cognitive load theory [R10]                                           |
| D6  | 2026-10-09 | API uses NestJS 12 defaults: **ESM + Vitest + oxlint** (replacing Jest/ESLint in the original SPEC) | Follow the framework's supported defaults instead of retrofitting older tooling                                                                                                                           |
| D7  | 2026-10-09 | **Fail-fast, schema-validated configuration**                                                       | A misconfiguration is found at startup, not at the first request. Placeholder secrets can't reach production [R36][R38]                                                                                   |
| D8  | 2026-10-09 | Dev infrastructure ports bound to **localhost only**                                                | Defence in depth: dev databases use weak default credentials [R38]                                                                                                                                        |
