# CourseCraft AI — 50-Issue Roadmap

One issue = one branch = one PR. Do the issues in order unless "Depends on" allows otherwise. Each PR closes its issue (`Closes #N`) and updates the AGENTS.md status.

Milestones map to the phases in SPEC §13. `scripts/create_issues.py` parses this file; keep the format: `## N. Title`, then a `Meta:` line, then the body.

---

# P0 Setup

## 1. Project template: monorepo, tooling and repo conventions

Meta: phase=P0 | area=infra,docs | type=chore | depends=
**Goal:** An empty but well-formed monorepo that every later issue builds on (SPEC §5).
**Tasks**

- [ ] pnpm workspaces (`apps/*`, `packages/*`), root `package.json` with `dev`/`lint`/`test`/`format` scripts
- [ ] Root `.gitignore` (node, python, `.env*`, model weights, audio), `.editorconfig`, `.nvmrc`, Prettier config
- [ ] `README.md`: project summary, architecture diagram, quick start (placeholder commands)
- [ ] `.github/` PR template (Closes #, what/why, test evidence) and issue templates (feature, bug)
- [ ] Move `CourseCraftAI.pdf` to `docs/report/` and update the links to it in AGENTS.md and SPEC.md

**Done when:** `pnpm install` works at the root and the repo tree matches SPEC §5 (with empty app folders).

## 2. Local infrastructure: Docker Compose and environment config

Meta: phase=P0 | area=infra | type=chore | depends=1
**Goal:** One command starts every backing service.
**Tasks**

- [ ] `docker-compose.yml`: PostgreSQL 16 and Redis 7 with named volumes and healthchecks; optional `ollama` service behind a compose profile
- [ ] `.env.example` with every variable from SPEC §12, grouped and commented
- [ ] `docs/setup.md`: prerequisites (Node, pnpm, Python 3.12, uv, Docker, ffmpeg)

**Done when:** `docker compose up -d` gives two healthy containers, and `docker compose --profile ollama up` also starts Ollama.

## 3. Scaffold the NestJS API (`apps/api`)

Meta: phase=P0 | area=api | type=chore | depends=1,2
**Goal:** A running API skeleton with the cross-cutting concerns in place.
**Tasks**

- [ ] NestJS app with TypeScript strict and global prefix `/api/v1`
- [ ] `@nestjs/config` with schema-validated env (fail fast on missing vars)
- [ ] Global `ValidationPipe` (whitelist, transform), global exception filter with a consistent error shape
- [ ] Structured JSON logging (pino) with a request-id middleware
- [ ] `GET /api/v1/health` (with DB/Redis checks stubbed for now), CORS configured for the web origin
- [ ] Test runner set up with one e2e test for `/health` (Vitest, the NestJS 12 default)

**Done when:** `pnpm --filter api dev` serves `/api/v1/health` and `pnpm --filter api test` passes.

## 4. Scaffold the Next.js web app (`apps/web`)

Meta: phase=P0 | area=web | type=chore | depends=1
**Goal:** A frontend shell with the design system ready.
**Tasks**

- [ ] Next.js App Router, TypeScript strict, Tailwind CSS, shadcn/ui initialized (Button, Card, Input, Dialog, Sheet, Skeleton, Sonner toasts, Dropdown menu)
- [ ] Dark/light/system theme toggle (inline pre-paint script per the Next.js 16 guide), base typography, app font
- [ ] Root layout with header/footer placeholders, 404 and error pages
- [ ] API client wrapper (`lib/api.ts`) using `NEXT_PUBLIC_API_URL` and credentials `include`; TanStack Query provider

**Done when:** `pnpm --filter web dev` renders the shell in both themes with no console errors.

## 5. Scaffold the FastAPI AI service (`services/ai`)

Meta: phase=P0 | area=ai | type=chore | depends=1
**Goal:** A Python service skeleton matching SPEC §5's folder layout.
**Tasks**

- [ ] `uv` project, Python 3.12, FastAPI and uvicorn, `pydantic-settings` config loaded from env
- [ ] Package layout: `ingestion/`, `processing/`, `generation/prompts/`, `rag/`, `evaluation/`, `schemas.py`
- [ ] `X-Internal-Key` dependency applied to every route except `/health`
- [ ] `GET /health` reports the configured LLM and embedding providers
- [ ] Ruff (lint and format), mypy, pytest with a `network` marker excluded by default

**Done when:** `uv run uvicorn app.main:app` serves `/health`, and `ruff`, `mypy` and `pytest` all pass.

## 6. Shared contracts package and CI pipeline

Meta: phase=P0 | area=infra | type=chore | depends=3,4,5
**Goal:** Type-safe contracts between web and api, and automated checks on every PR.
**Tasks**

- [ ] `packages/shared`: Zod schemas and inferred TS types (start with `HealthResponse`, error shape), built and consumed by web and api
- [ ] GitHub Actions workflow `ci.yml`: install, lint, typecheck and test for web, api (with Postgres and Redis service containers) and ai
- [ ] Root `pnpm lint` / `pnpm test` run all packages
- [ ] Fill in the Commands section of AGENTS.md with real commands

**Done when:** CI is green on the PR, and web imports a type from `@coursecraft/shared`.

---

# P1 Core

## 7. Database schema with Prisma and the initial migration

Meta: phase=P1 | area=api | type=feat | depends=3
**Goal:** Implement the data model from SPEC §6.
**Tasks**

- [ ] `prisma/schema.prisma` with all models and enums from SPEC §6 (User, Domain, Course, Module, Video, Lesson, Chunk, IngestionJob, Enrollment, LessonProgress, ChatSession, ChatMessage, EvaluationRun)
- [ ] Indexes: `Course.domainId`, `Course.status`, `Lesson.moduleId`, `Chunk.lessonId`, `ChatMessage.sessionId`
- [ ] Initial migration; `PrismaService` module with graceful shutdown; the health check pings the DB

**Done when:** `prisma migrate dev` applies cleanly on a fresh DB and the health check shows the DB as up.

## 8. Seed script with demo data

Meta: phase=P1 | area=api | type=chore | depends=7
**Goal:** Realistic data so UI work doesn't wait for the AI pipeline.
**Tasks**

- [ ] `prisma/seed.ts`: an admin user (credentials from env), a student user, 4 domains (Web Dev, DSA, DBMS, ML)
- [ ] One fully populated sample course (2 modules, 4 lessons with real YouTube ids and handwritten Markdown notes with `[▶ mm:ss]` anchors)
- [ ] Idempotent: re-running it doesn't duplicate data

**Done when:** `prisma db seed` runs twice without errors and the data is visible in Prisma Studio.

## 9. Authentication API: register, login, JWT and role guards

Meta: phase=P1 | area=api | type=feat | depends=7
**Goal:** Secure auth as described in SPEC §8.1 and §11.
**Tasks**

- [ ] `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- [ ] Argon2id hashing via `src/auth/password.ts` (added in #8), JWT issued in an httpOnly, SameSite=Lax cookie (Secure in prod)
- [ ] `JwtAuthGuard`, `RolesGuard` and an `@Roles('ADMIN')` decorator; `@CurrentUser()` param decorator
- [ ] Login rate limiting (`@nestjs/throttler`)
- [ ] Shared Zod schemas for register/login/user in `packages/shared`
- [ ] E2E tests: register → me → logout; wrong password; duplicate email; admin-only route as a student → 403

**Done when:** All auth e2e tests pass.

## 10. Domains API

Meta: phase=P1 | area=api | type=feat | depends=9
**Goal:** Catalog domains.
**Tasks**

- [ ] `GET /domains` (with published course counts), `GET /domains/:slug` (with published courses)
- [ ] Admin `POST/PATCH/DELETE /domains` with slug generation and uniqueness validation; blocks deleting a domain that has courses
- [ ] E2E tests

**Done when:** Public reads and admin writes work, and the tests pass.

## 11. Courses and lessons read API

Meta: phase=P1 | area=api | type=feat | depends=10
**Goal:** Everything the catalog and lesson pages need to read.
**Tasks**

- [ ] `GET /courses?domain=&q=&level=&page=` (published only, paginated, search by title/description)
- [ ] `GET /courses/:slug`: course + ordered modules + ordered lesson titles (no notes body)
- [ ] `GET /lessons/:id` (auth): lesson + notes + video info + prev/next lesson ids
- [ ] Shared response schemas; e2e tests against the seed data

**Done when:** The seeded course can be fully read through the API.

## 12. Web: authentication pages and session handling

Meta: phase=P1 | area=web | type=feat | depends=4,9
**Goal:** Users can sign up, log in and stay logged in.
**Tasks**

- [ ] `/register` and `/login` forms (react-hook-form + shared Zod schemas, inline errors)
- [ ] Session hook (`useMe`), user menu with logout in the header
- [ ] Route protection: middleware redirects unauthenticated users away from `/dashboard`, `/learn/*`, `/admin/*`; non-admins get a 403 page on `/admin/*`

**Done when:** The register → login → refresh → logout flow works in the browser.

## 13. Web: landing page and global navigation

Meta: phase=P1 | area=web | type=feat | depends=4
**Goal:** A first impression that explains the product.
**Tasks**

- [ ] Hero (the problem and the solution from the report's abstract), a "how it works" section with three steps (Ingest → Structure → Learn + Ask), featured domains
- [ ] Responsive header (logo, Domains, Dashboard, auth buttons) and footer (project credits, VSSUT, supervisor)

**Done when:** The landing page is responsive at 360px, 768px and 1280px.

## 14. Web: domain catalog pages

Meta: phase=P1 | area=web | type=feat | depends=11,13
**Goal:** Browse Domain → Courses.
**Tasks**

- [ ] `/domains`: domain card grid with course counts
- [ ] `/domains/[slug]`: course cards (thumbnail, title, level, lesson count), level filter, search box
- [ ] Server components with ISR; loading skeletons; empty states

**Done when:** The seeded domains and course can be browsed.

## 15. Web: course overview page

Meta: phase=P1 | area=web | type=feat | depends=14
**Goal:** The course detail page (SPEC §10).
**Tasks**

- [ ] `/courses/[slug]`: header (title, description, level, domain breadcrumb, total duration), module accordion with lessons
- [ ] CTA placeholder ("Enroll", wired up in #33)
- [ ] OG metadata for sharing

**Done when:** The seeded course shows its full structure.

---

# P2 Ingestion

## 16. AI: LLM/embedding provider factory and prompt loader

Meta: phase=P2 | area=ai | type=feat | depends=5
**Goal:** One place that decides between OpenAI and Ollama (SPEC F14).
**Tasks**

- [ ] `providers.py`: `get_chat_model()` and `get_embeddings()` driven by `LLM_PROVIDER`, with model names only from config
- [ ] An embedding-dimension lookup that ensures the Pinecone index name matches the embedding model
- [ ] `prompts/` loader (versioned `.md` templates with variables)
- [ ] Token usage callback that logs tokens per call along with a correlation id
- [ ] Unit tests using fake models

**Done when:** Switching `LLM_PROVIDER` swaps the models with no code changes, and the tests pass.

## 17. AI: YouTube URL parsing and metadata via yt-dlp

Meta: phase=P2 | area=ai | type=feat | depends=5
**Goal:** SPEC §7.1 step 1.
**Tasks**

- [ ] Validate and normalize YouTube URLs (watch, youtu.be, shorts, playlist); reject anything that isn't YouTube
- [ ] Resolve a playlist to video ids (respect `MAX_VIDEOS_PER_COURSE`)
- [ ] Fetch title, channel, duration, thumbnail and language with yt-dlp (no download)
- [ ] `POST /ingest/metadata` endpoint and Pydantic schemas

**Done when:** Unit tests (URL parsing) and a network test (a real playlist) pass.

## 18. AI: transcript fetching with youtube-transcript-api and a yt-dlp fallback

Meta: phase=P2 | area=ai | type=feat | depends=17
**Goal:** SPEC §7.1 step 2 (without Whisper).
**Tasks**

- [ ] Prefer manual English subtitles, then auto-generated, then any language translated to English if available
- [ ] Fall back to yt-dlp subtitle extraction (VTT parsed into segments)
- [ ] Normalize to `[{text, start, duration}]` and clean up (strip `[Music]`, collapse whitespace)
- [ ] `POST /ingest/transcript` returns `{source, language, segments}`; raises a typed `NoTranscriptError` when nothing works

**Done when:** Tests cover a manual-subtitle video, an auto-subtitle video, and the no-transcript path.

## 19. AI: Whisper transcription fallback

Meta: phase=P2 | area=ai | type=feat | depends=18
**Goal:** Handle videos that have no subtitles.
**Tasks**

- [ ] Download audio only with yt-dlp to a temp dir (ffmpeg), and always clean up
- [ ] Transcribe with faster-whisper (`WHISPER_MODEL`), returning timestamped segments with `source=WHISPER`
- [ ] Guard: skip videos longer than `WHISPER_MAX_MINUTES` (add to env and SPEC)
- [ ] Wire it in as the last fallback of `/ingest/transcript`
- [ ] Also transcribe when captions exist but their language doesn't match the video's spoken language (found in #18: YouTube auto-captions of English speech mislabelled `hi`, written phonetically in Devanagari). Compare the caption language with the metadata language from #17

**Done when:** A no-subtitle test video produces a transcript locally. _(This can be cut per the SPEC §13 scope guard.)_

## 20. AI: timestamp-aware semantic chunking

Meta: phase=P2 | area=ai | type=feat | depends=18
**Goal:** SPEC §7.1 step 3: chunks that keep their timestamps.
**Tasks**

- [ ] Build chunks from transcript segments: target ~800 tokens, ~120 overlap (tiktoken length function, LangChain splitter for oversized segments)
- [ ] Each chunk has `index, text, startSec, endSec, tokenCount`
- [ ] Property tests: no text lost, timestamps are monotonic, overlap is respected

**Done when:** Chunking a 1-hour fixture transcript gives correct timestamps and the tests pass.

## 21. AI: embeddings and the vector store (pgvector)

Meta: phase=P2 | area=ai | type=feat | depends=16,20
**Goal:** SPEC §6 vector store layout and §7.1 step 4.
**Scope change:** pgvector in PostgreSQL instead of Pinecone, with Ollama `nomic-embed-text` embeddings (free; PROGRESS D50).
**Tasks**

- [x] Create the extension, schema and per-model table if missing (dimension from the embedding model, cosine distance); refuse a dimension mismatch
- [x] Batch-embed chunks and store them scoped to `courseId` with the full metadata from SPEC §6; row id = chunk id (deterministic `{lessonId}-{index}`)
- [x] `similarity_search(courseId, query, k)` helper that returns scores
- [x] `DELETE /vectors/{courseId}`
- [x] Tests against a real PostgreSQL (pgvector) with offline embeddings; one network test with real Ollama embeddings

**Done when:** Upsert → search → delete works on a real store.

## 22. AI: ingestion fixtures and integration tests

Meta: phase=P2 | area=ai | type=test | depends=19,21
**Goal:** A reliable, offline test base for everything that follows.
**Tasks**

- [x] `tests/fixtures/`: 3 recorded transcripts (manual, auto, Whisper) and metadata JSON
- [x] Integration test: fixture → chunk → embed (fake) → store (in-memory and real pgvector)
- [x] A `uv` script that refreshes fixtures from the network (`pnpm ai:fixtures`)
- [x] Mark P2 done in AGENTS.md

**Done when:** `pytest` (offline) covers the whole ingestion path; `pytest -m network` passes locally.

---

# P3 Generation

## 23. AI: lesson notes generation (map-reduce)

Meta: phase=P3 | area=ai | type=feat | depends=16,20
**Goal:** SPEC §7.1 step 5: readable Markdown study notes.
**Tasks**

- [x] Map prompt: chunk → partial notes that keep `[▶ mm:ss]` anchors from the chunk's timestamps
- [x] Reduce prompt: partial notes → one lesson document: title, summary, key concepts, sections with anchors, code blocks where relevant, recap
- [x] Structured output (Pydantic): `{title, summary, keyConcepts[], notesMarkdown, readingTimeMin}` (parsed from a fixed Markdown layout, PROGRESS D62)
- [x] Retry with backoff (3 attempts), per-call timeout
- [x] Snapshot-style tests with a fake LLM; one manual quality check recorded in `docs/eval/notes-samples/`

**Done when:** A fixture transcript produces well-formed notes with valid anchors.

## 24. AI: `/process/lesson` endpoint

Meta: phase=P3 | area=ai | type=feat | depends=21,23
**Goal:** One call that turns a video's transcript into a finished lesson.
**Tasks**

- [x] `POST /process/lesson {courseId, lessonId (allocated by the API), youtubeId, videoTitle, segments}` → chunk, embed and upsert, generate notes → `{chunks[], notes, summary, keyConcepts, readingTimeMin}`
- [x] Idempotent: re-running it overwrites the same vector ids
- [x] Correlation id passed through to the logs

**Done when:** An integration test with fakes passes, and a manual run against real services works.

## 25. AI: course structuring (`/process/structure`)

Meta: phase=P3 | area=ai | type=feat | depends=16
**Goal:** SPEC §7.1 step 6: build the Domain → Course → Module → Lesson outline.
**Tasks**

- [x] Prompt: lesson titles and summaries → course title, description, level, modules (title, summary) with ordered lesson refs
- [x] Validation: every lesson is placed exactly once and no module is empty; repair or retry if not
- [x] Tests with a fake LLM, including the repair path

**Done when:** A 10-lesson fixture produces a valid outline.

## 26. API: AI service client module

Meta: phase=P3 | area=api | type=feat | depends=3,5
**Goal:** A typed, resilient NestJS client for the internal AI API.
**Tasks**

- [x] `AiClientModule` with methods for each internal endpoint (SPEC §8.2) and an `X-Internal-Key` header
- [x] Timeouts per endpoint, retries on outages (network, 429/503/504; not 500/502/4xx, see PROGRESS D71), request-id forwarding
- [x] Support for SSE passthrough (used in #41)
- [x] Unit tests with a mocked HTTP server

**Done when:** The health check includes the AI service's status.

## 27. API: BullMQ ingestion pipeline and persistence

Meta: phase=P3 | area=api | type=feat | depends=8,24,25,26
**Goal:** Orchestrate SPEC §7.1 end to end.
**Tasks**

- [x] BullMQ queue `ingestion` on Redis; processor runs the stages METADATA → TRANSCRIPT → (per video) PROCESS → STRUCTURING → DONE
- [x] Updates `IngestionJob.stage/progress` and publishes progress events (Redis pub/sub)
- [x] Caches `Video` rows by `youtubeId` (skips re-fetching transcripts)
- [x] Per-video failures are recorded but don't stop the job; the job fails only if every video fails
- [x] Final persistence of Modules, Lessons, Chunks in **one transaction**; `Course.status = DRAFT`

**Done when:** An integration test (AI client mocked) produces a full course in the DB.

## 28. API: course generation endpoints, job status, SSE progress and retry

Meta: phase=P3 | area=api | type=feat | depends=27
**Goal:** The public side of generation.
**Tasks**

- [x] `POST /courses/generate` (admin) `{domainId, urls[] | playlistUrl, titleHint?}` → `{courseId, jobId}`; validates YouTube URLs
- [x] `GET /jobs/:id`, `GET /jobs/:id/events` (SSE: stage, progress, per-video status, done/error)
- [x] `POST /jobs/:id/retry`: restarts from the last completed stage
- [x] Rate limit on generate

**Done when:** Running `curl` against generate and then watching the SSE stream shows progress through to DONE with real services.

## 29. Web: admin area layout and domain management

Meta: phase=P3 | area=web | type=feat | depends=10,12
**Goal:** The admin shell.
**Tasks**

- [ ] `/admin` layout with sidebar (Courses, Domains, Generate), admin-only access
- [ ] `/admin/domains`: table with create/edit/delete dialogs
- [ ] `/admin/courses`: table of all courses with status badges (DRAFT/GENERATING/PUBLISHED/FAILED)

**Done when:** An admin can manage domains and see all courses.

## 30. Web: generate course page with a live progress stepper

Meta: phase=P3 | area=web | type=feat | depends=28,29
**Goal:** The SPEC §10 `/admin/courses/new` page.
**Tasks**

- [ ] Form: domain select, textarea for URLs or a playlist URL, optional title hint; client-side URL validation
- [ ] After submitting: a stepper over the job stages via SSE, per-video status list, error display with a Retry button
- [ ] When the job is done, redirect to the review page

**Done when:** A real playlist goes through all stages in the UI.

## 31. Admin course review: reorder, edit metadata, publish

Meta: phase=P3 | area=api,web | type=feat | depends=28,30
**Goal:** Human review before a course is published.
**Tasks**

- [ ] API: `PATCH /courses/:id` (title, description, level, domain), reorder modules and lessons (transactional reindex), rename modules, `POST /courses/:id/publish|unpublish`, `DELETE /courses/:id` (also deletes its vectors)
- [ ] Web `/admin/courses/[id]`: outline with drag-and-drop reordering (dnd-kit), inline renaming, lesson preview, Publish button

**Done when:** The generated course can be reordered and published, and it then appears in the public catalog.

## 32. Admin lesson notes editor

Meta: phase=P3 | area=api,web | type=feat | depends=31
**Goal:** Fix AI mistakes by hand.
**Tasks**

- [ ] API `PATCH /lessons/:id` (title, summary, keyConcepts, notesMarkdown)
- [ ] Web: split Markdown editor and live preview (reuse the renderer from #34 once it exists; use a basic preview until then), unsaved-changes guard
- [ ] Mark P3 done in AGENTS.md

**Done when:** The edited notes show up on the lesson page. _(This can be cut per the SPEC §13 scope guard.)_

---

# P4 Learning UX

## 33. API: enrollment, progress and next-lesson recommendation

Meta: phase=P4 | area=api | type=feat | depends=11
**Goal:** SPEC §7.3, rule-based pathing.
**Tasks**

- [ ] `POST /courses/:id/enroll`, `GET /me/courses` (with progress %, last lesson)
- [ ] `PUT /lessons/:id/progress {status?, lastPositionSec}` (opening a lesson marks it IN_PROGRESS)
- [ ] `GET /courses/:id/next`: first non-completed lesson in order
- [ ] E2E tests covering the progress rules

**Done when:** Enroll → progress → next behaves as specified.

## 34. Web: Markdown notes renderer with timestamp anchors

Meta: phase=P4 | area=web | type=feat | depends=4
**Goal:** Readable, attractive study notes.
**Tasks**

- [ ] `<NotesRenderer>`: react-markdown + remark-gfm + rehype-highlight (code copy button), table and callout styles, typography plugin
- [ ] Turns `[▶ mm:ss]` into clickable chips that emit `onSeek(seconds)`
- [ ] Auto-generated table of contents from the headings
- [ ] Component tests (Vitest + Testing Library)

**Done when:** The seeded notes render correctly and clicking an anchor fires `onSeek`.

## 35. Web: split-view lesson page with a synced YouTube player

Meta: phase=P4 | area=web | type=feat | depends=33,34
**Goal:** The main learning experience (SPEC §10, Outcome 2).
**Tasks**

- [ ] `/learn/[courseSlug]/[lessonId]`: resizable split, player on the left (react-youtube), notes on the right
- [ ] Timestamp chips seek the player; the player resumes from `lastPositionSec`
- [ ] Saves position periodically (debounced) and on leave
- [ ] Mobile: tabs (Video / Notes) instead of the split

**Done when:** Clicking timestamps seeks the video, and reloading resumes from the saved position.

## 36. Web: lesson navigation, sidebar tree and completion

Meta: phase=P4 | area=web | type=feat | depends=35
**Goal:** Moving through a course.
**Tasks**

- [ ] Collapsible sidebar: module/lesson tree with completion ticks and the current lesson highlighted
- [ ] Prev/Next buttons, "Mark complete", auto-complete at 90% watched
- [ ] Enroll / "Continue learning" CTA on the course page, using `/next`

**Done when:** A student can finish the seeded course from start to end.

## 37. Web: student dashboard

Meta: phase=P4 | area=web | type=feat | depends=33,36
**Goal:** `/dashboard`.
**Tasks**

- [ ] Enrolled courses with progress bars, "Continue where you left off" card, recently completed lessons
- [ ] Empty state linking to the domains page

**Done when:** The dashboard reflects real progress.

## 38. Web: responsiveness and accessibility pass

Meta: phase=P4 | area=web | type=chore | depends=37
**Goal:** Polish before adding chat.
**Tasks**

- [ ] Check every page at 360px, 768px and 1280px; fix overflow
- [ ] Keyboard navigation, focus rings, aria labels, colour contrast (axe checks)
- [ ] Lighthouse ≥ 90 for accessibility on the landing, course and lesson pages
- [ ] Mark P4 done in AGENTS.md

**Done when:** The Lighthouse/axe reports are attached to the PR.

---

# P5 RAG Chat

## 39. AI: RAG retrieval, grounding gate and streaming answers

Meta: phase=P5 | area=ai | type=feat | depends=21
**Goal:** SPEC §7.2 steps 2–5 (Outcome 3).
**Tasks**

- [ ] `POST /rag/answer {courseId, question, history[]}`: embed → query namespace `courseId` top-k `RAG_TOP_K`
- [ ] **Grounding gate**: best score < `RAG_MIN_SCORE` → fixed refusal message, `grounded=false`, no LLM call
- [ ] Grounded system prompt (answer only from the context, say when it's insufficient, cite as [n])
- [ ] SSE stream: `token` events, then a final `done` event with citations `{lessonId, chunkId, startSec, endSec, score}` and `grounded`
- [ ] Tests: in-scope answer has citations; off-scope question is refused without calling the LLM

**Done when:** Asking questions with `curl` against a real generated course behaves correctly.

## 40. AI: follow-up question condensation and citation quality

Meta: phase=P5 | area=ai | type=feat | depends=39
**Goal:** Multi-turn chat that stays grounded.
**Tasks**

- [ ] Rewrite follow-up questions as standalone questions using the last N turns before retrieval
- [ ] Deduplicate overlapping chunks; map [n] markers to citation objects; drop unused citations
- [ ] Tune `RAG_MIN_SCORE` on the demo course; record the chosen value in SPEC

**Done when:** Follow-ups like "explain that again with an example" retrieve the right context.

## 41. API: chat sessions, SSE proxy and rate limiting

Meta: phase=P5 | area=api | type=feat | depends=26,33,39
**Goal:** SPEC §7.2 steps 1 and 6.
**Tasks**

- [ ] `POST /courses/:id/chat {sessionId?, message}`: checks enrollment, loads history, proxies the AI SSE stream to the client
- [ ] Saves both user and assistant messages with citations and `grounded`
- [ ] `GET /courses/:id/chat/sessions`, `GET .../sessions/:sid`; per-user rate limit

**Done when:** An E2E test with a mocked AI stream passes.

## 42. Web: course chat drawer with streaming and citations

Meta: phase=P5 | area=web | type=feat | depends=35,41
**Goal:** Students can ask questions while learning.
**Tasks**

- [ ] Floating "Ask this course" button → Sheet drawer on lesson and course pages
- [ ] Streams tokens with a typing indicator; Markdown answers; distinct style for refusals
- [ ] Citation chips "Lesson title · mm:ss" deep-link to `/learn/...?t=seconds` (the player seeks on load)
- [ ] Session history list; new chat button
- [ ] Mark P5 done in AGENTS.md

**Done when:** Asking a question in the browser gives a cited answer, and clicking a citation jumps to the right moment.

---

# P6 Evaluation

## 43. AI: cognitive load index and the simplify loop

Meta: phase=P6 | area=ai | type=feat | depends=23
**Goal:** SPEC §9, Cognitive Load Index.
**Tasks**

- [ ] `evaluation/cognitive_load.py`: Flesch-Kincaid grade, average sentence length, concept density (key terms per 100 words) → normalized index 0–100 (document the weights)
- [ ] In `/process/lesson`: if the index is above `CLI_MAX`, regenerate once with the "simplify" prompt and keep the better version; return the metrics
- [ ] API stores the metrics in `Lesson.cognitiveLoad`; the admin review page shows them

**Done when:** Unit tests on sample texts pass, and the metrics appear on generated lessons.

## 44. AI: RAG evaluation endpoint (RAGAS)

Meta: phase=P6 | area=ai | type=feat | depends=40
**Goal:** SPEC §9: Faithfulness, Relevance and Off-scope refusal.
**Tasks**

- [ ] `POST /eval/rag {courseId, qa[]}`: runs each question through the RAG pipeline (non-streaming) and scores it with RAGAS `faithfulness`, `answer_relevancy`, `context_precision`
- [ ] Off-scope set: computes the refusal rate
- [ ] Returns per-question rows and aggregates

**Done when:** It runs end-to-end on one demo course.

## 45. Evaluation datasets, CLI runner and report export

Meta: phase=P6 | area=ai,docs | type=test | depends=44
**Goal:** Reproducible numbers for the report's Results chapter.
**Tasks**

- [ ] Pick 2–3 short beginner playlists (resolves SPEC §14 Q2) and generate those courses
- [ ] `eval/datasets/<slug>.jsonl`: 30 in-scope questions (with reference answers) and 10 off-scope questions per course
- [ ] `uv run python -m app.evaluation.cli --course <slug>` writes `docs/eval/<slug>-<date>.md` and a JSON file with the Table 3 metrics
- [ ] Compare OpenAI and Ollama if time allows

**Done when:** The `docs/eval/` results meet or explain the SPEC §9 targets.

## 46. Admin evaluation UI

Meta: phase=P6 | area=api,web | type=feat | depends=44
**Goal:** Run and view evaluations from the app.
**Tasks**

- [ ] API `POST /courses/:id/evaluate` (admin, async), stores an `EvaluationRun`; `GET /courses/:id/evaluations`
- [ ] Web: Evaluation tab on the admin course page: metric cards against the targets, per-question table, cognitive load per lesson
- [ ] Mark P6 done in AGENTS.md

**Done when:** An admin can trigger an evaluation and see the results.

---

# P7 Deploy & Report

## 47. End-to-end tests for critical flows (Playwright)

Meta: phase=P7 | area=web | type=test | depends=42
**Goal:** Confidence before production.
**Tasks**

- [ ] Playwright against docker-compose with the AI service mocked: register/login, browse → enroll → learn → complete, chat with citation, admin generate (mock) → publish
- [ ] Runs in CI on PRs to `main`

**Done when:** The E2E suite is green in CI.

## 48. Production hardening and Dockerfiles

Meta: phase=P7 | area=infra | type=chore | depends=47
**Goal:** Images and settings that are ready for production.
**Tasks**

- [ ] Multi-stage Dockerfiles for web (Next standalone), api (with a `prisma migrate deploy` entrypoint) and ai (slim, ffmpeg); non-root users
- [ ] `docker-compose.prod.yml` (web, api, worker, ai, redis, caddy reverse proxy with automatic HTTPS)
- [ ] Security: helmet, strict CORS, secure cookies, request size limits; the AI service is only on the internal network
- [ ] Global rate limits, log level from env, graceful shutdown

**Done when:** The prod compose stack runs locally behind Caddy.

## 49. AWS S3 storage and Cloudflare CDN

Meta: phase=P7 | area=infra,api | type=feat | depends=48
**Goal:** Static media off the app servers.
**Tasks**

- [ ] S3 bucket (private plus a CDN origin); API uploads course thumbnails, and the AI service uses S3 for temporary Whisper audio (with a lifecycle rule to delete it)
- [ ] Cloudflare in front for `CDN_BASE_URL`; web uses CDN URLs through `next/image`
- [ ] IAM user/role with least privilege; documented in `docs/deploy.md`

**Done when:** Thumbnails are served from the CDN. _(Can fall back to YouTube thumbnails per the scope guard.)_

## 50. AWS production deployment and final documentation

Meta: phase=P7 | area=infra,docs | type=chore | depends=48,49
**Goal:** A public, production CourseCraft AI (resolves SPEC §14 Q3: AWS).
**Tasks**

- [ ] AWS: EC2 instance (Docker) for the prod compose stack, RDS PostgreSQL, security groups, Elastic IP, domain + HTTPS (Caddy/Cloudflare)
- [ ] Secrets in AWS SSM Parameter Store, loaded at deploy time
- [ ] GitHub Actions `deploy.yml`: build and push images (GHCR/ECR) → SSH/SSM deploy → run migrations → smoke test `/health`
- [ ] Production data: seed domains, generate and publish the demo courses
- [ ] Final docs: README (live URL, screenshots, architecture), `docs/deploy.md`, runbook (backups, rollback), update the report's Results chapter with screenshots and `docs/eval` numbers
- [ ] Mark P7 and the whole project as done in AGENTS.md

**Done when:** The live URL serves the full flow (browse → learn → chat), and CI/CD deploys on merge to `main`.
