# CourseCraft AI — Technical Specification

> AI-Integrated Intelligent Learning Management System
> B.Tech minor project (Project-I), Dept. of CSE, VSSUT Burla, 2025–26
> Report authors: Subhankar Patra (2302080033), Shibani Taria (2302080001) · Supervisor: Dr. Sucheta Panda
> Implementation: Subhankar Patra, working with Claude Code as AI pair programmer. Shibani Taria is no longer working on the build, so the Table 2 work split in the report no longer applies.
> Source of truth for requirements: [`docs/report/CourseCraftAI.pdf`](docs/report/CourseCraftAI.pdf) (project report). This spec turns that report into a buildable plan.

---

## 1. Problem & Goal

Beginners in computer science face plenty of free YouTube content, but it is unorganized, has no step-by-step order, and is often slow to consume as long videos.

**CourseCraft AI** takes YouTube videos and turns them into **structured courses** with **readable study notes**. It also includes a **course-aware RAG chatbot** that answers questions using only that course's content.

Content hierarchy: **Domain → Course → Module → Lesson**.

### Expected outcomes (from the report, §5.1)

1. A responsive web app that ingests YouTube links and generates coherent course hierarchies.
2. A **split-view learning interface**: video playback synchronized with AI-generated Markdown notes.
3. A **context-grounded RAG chatbot** with minimal hallucination, answering only from the course's content.

---

## 2. Scope

### In scope (MVP)

| #   | Feature                                              | Notes                                                                               |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| F1  | Auth (register/login, JWT)                           | Roles: `STUDENT`, `ADMIN` (curator who generates courses)                           |
| F2  | Domain catalog                                       | e.g. Web Dev, DSA, ML, DBMS. Admin CRUD                                             |
| F3  | Course generation from YouTube URLs / playlist       | Async job with live progress                                                        |
| F4  | Transcript ingestion                                 | `youtube-transcript-api` first, then `yt-dlp` subtitles, then Whisper fallback      |
| F5  | Semantic chunking                                    | Overlapping, timestamp-preserving chunks (LangChain)                                |
| F6  | Embeddings → Pinecone                                | One namespace per course                                                            |
| F7  | AI notes generation                                  | Markdown per lesson, sections anchored to video timestamps                          |
| F8  | Hierarchical structuring                             | LLM groups lessons into ordered modules; stored in PostgreSQL                       |
| F9  | Course discovery & navigation UI                     | Domain → Course → Module → Lesson views                                             |
| F10 | Split-view lesson page                               | YouTube player + notes; clicking a timestamp seeks the video                        |
| F11 | Course-aware RAG chatbot                             | Streaming answers with citations (lesson + timestamp); refuses off-course questions |
| F12 | Progress tracking + rule-based "next lesson" pathing | Enrollment, per-lesson completion, resume position                                  |
| F13 | Quality evaluation                                   | Faithfulness, answer relevance, cognitive load index (see §9)                       |
| F14 | Model provider switch                                | OpenAI `gpt-4o-mini` (default) or local Ollama, chosen by env config                |

### Out of scope (Future Work, report §5.2)

- Fully agentic architecture (LangGraph Strategist / Designer / Coach agents)
- Reinforcement-learning-based adaptive pathing
- Educational Knowledge Graph visualization
- Multi-modal (frame/visual) video indexing à la VideoRAG

### Stretch (only if MVP is done)

- Auto-generated quizzes per lesson that feed into the rule-based pathing
- Splitting long videos into multiple lessons using YouTube chapters
- Export notes as PDF

---

## 3. Architecture

```
┌──────────────┐  HTTP/JSON + SSE   ┌──────────────────┐  HTTP (internal)  ┌─────────────────────┐
│  Next.js Web │ ─────────────────▶ │  NestJS API      │ ────────────────▶ │  AI Service (Python)│
│  (apps/web)  │ ◀───────────────── │  (apps/api)      │ ◀──────────────── │  FastAPI + LangChain│
└──────────────┘                    └──────────────────┘                   └─────────────────────┘
                                       │        │                              │         │
                                Prisma │        │ BullMQ                       │         │
                                       ▼        ▼                              ▼         ▼
                                ┌───────────┐ ┌───────┐                 ┌──────────┐ ┌──────────────┐
                                │PostgreSQL │ │ Redis │                 │ Pinecone │ │ OpenAI/Ollama│
                                └───────────┘ └───────┘                 └──────────┘ └──────────────┘
                                                         AWS S3 (+ Cloudflare CDN): thumbnails, audio for Whisper
```

### 3.1 Responsibilities by component

| Component                | Owns                                                                                                       | Does not do                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Web** (Next.js)        | UI, client validation (Zod), auth cookie handling, SSE consumption                                         | Call the AI service or the DB directly                           |
| **API** (NestJS)         | Auth, REST API, **only writer to PostgreSQL** (Prisma), job orchestration (BullMQ), progress, chat history | LLM calls, embeddings                                            |
| **AI Service** (FastAPI) | Transcript fetching, chunking, embeddings, Pinecone read/write, LLM generation, RAG, evaluation metrics    | Touch PostgreSQL; it is stateless and returns results to the API |

### 3.2 Key decision: a separate Python AI service

The report lists LangChain, `youtube-transcript-api`, `yt-dlp`, and Whisper. All of these are Python-native, and so is the evaluation tooling (RAGAS, textstat). Figure 2 of the report already shows the "LangChain AI Pipeline" as its own block. So the AI pipeline runs as a small FastAPI service, and NestJS stays the single public API and the single database owner.

_Alternative considered:_ LangChain.js inside NestJS. It means one less service, but transcript fetching and Whisper would need workarounds and there is no RAGAS. This can be revisited if running two runtimes becomes a burden.

---

## 4. Tech Stack

| Layer      | Technologies                                                                                                                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend   | Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, Zod, TanStack Query, react-markdown + remark-gfm + rehype-highlight, react-youtube                                                                         |
| API server | Node.js, NestJS, TypeScript, Prisma ORM, Passport-JWT, class-validator, BullMQ                                                                                                                                        |
| AI service | Python 3.11+, FastAPI, Pydantic v2, LangChain (`langchain`, `langchain-openai`, `langchain-ollama`, `langchain-pinecone`), youtube-transcript-api, yt-dlp, openai-whisper / faster-whisper, tiktoken, ragas, textstat |
| Data       | PostgreSQL 16, Pinecone (serverless index), Redis 7                                                                                                                                                                   |
| LLMs       | `gpt-4o-mini` (default), Ollama (`llama3.1:8b` or similar)                                                                                                                                                            |
| Embeddings | `text-embedding-3-small` (1536-d). Ollama alternative: `nomic-embed-text` (768-d), which needs a **separate Pinecone index** because the dimension differs                                                            |
| Infra      | Docker Compose (local), AWS EC2 or Railway (deploy), AWS S3 + Cloudflare CDN                                                                                                                                          |
| Tooling    | Node 24 LTS, pnpm 12 workspaces, Prettier, oxlint + Vitest (API, NestJS 12 ESM defaults), ESLint + Vitest/Playwright (web), Ruff + mypy + pytest (AI)                                                                 |

---

## 5. Repository Layout

```
CourseCraft_AI/
├── AGENTS.md                 # working agreement for humans + AI agents
├── SPEC.md                   # this file
├── README.md
├── docker-compose.yml        # postgres, redis (+ ollama optional)
├── .env.example
├── pnpm-workspace.yaml
├── apps/
│   ├── web/                  # Next.js frontend
│   └── api/                  # NestJS backend + Prisma
│       └── prisma/schema.prisma
├── services/
│   └── ai/                   # FastAPI AI pipeline
│       ├── app/
│       │   ├── main.py
│       │   ├── ingestion/    # transcripts, metadata, whisper
│       │   ├── processing/   # chunking, embeddings
│       │   ├── generation/   # notes, course structure, prompts/
│       │   ├── rag/          # retrieval + answer
│       │   └── evaluation/   # faithfulness, relevance, cognitive load
│       └── tests/
├── packages/
│   └── shared/               # shared TS types + Zod schemas (web <-> api)
├── scripts/                  # repo automation (GitHub issue generator)
└── docs/
    ├── ISSUES.md             # 50-issue roadmap
    ├── report/               # CourseCraftAI.pdf (requirements source)
    └── eval/                 # evaluation results
```

---

## 6. Data Model (PostgreSQL / Prisma)

```prisma
enum Role            { STUDENT ADMIN }
enum CourseStatus    { DRAFT GENERATING PUBLISHED FAILED }
enum JobStatus       { QUEUED RUNNING SUCCEEDED FAILED }
enum JobStage        { METADATA TRANSCRIPT CHUNKING EMBEDDING NOTES STRUCTURING EVALUATION DONE }
enum TranscriptSrc   { YT_MANUAL YT_AUTO WHISPER }
enum ProgressStatus  { NOT_STARTED IN_PROGRESS COMPLETED }
enum ChatRole        { USER ASSISTANT }

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String
  passwordHash String
  role         Role     @default(STUDENT)
  createdAt    DateTime @default(now())
  enrollments  Enrollment[]
  progress     LessonProgress[]
  chatSessions ChatSession[]
}

model Domain {
  id          String   @id @default(cuid())
  slug        String   @unique
  name        String
  description String?
  courses     Course[]
}

model Course {
  id             String       @id @default(cuid())
  slug           String       @unique
  title          String
  description    String?
  level          String?      // Beginner | Intermediate | Advanced
  status         CourseStatus @default(DRAFT)
  thumbnailUrl   String?
  domainId       String
  domain         Domain       @relation(fields: [domainId], references: [id])
  createdById    String
  llmModel       String       // provenance, e.g. "gpt-4o-mini"
  embeddingModel String       // e.g. "text-embedding-3-small"
  modules        Module[]
  jobs           IngestionJob[]
  enrollments    Enrollment[]
  evaluations    EvaluationRun[]
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
}

model Module {
  id       String   @id @default(cuid())
  courseId String
  course   Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  title    String
  summary  String?
  order    Int
  lessons  Lesson[]
  @@unique([courseId, order])
}

model Video {
  id               String        @id @default(cuid())
  youtubeId        String        @unique
  title            String
  channel          String?
  durationSec      Int
  thumbnailUrl     String?
  language         String?
  transcriptSource TranscriptSrc
  transcript       Json          // [{text, start, duration}]
  lessons          Lesson[]
}

model Lesson {
  id             String   @id @default(cuid())
  moduleId       String
  module         Module   @relation(fields: [moduleId], references: [id], onDelete: Cascade)
  videoId        String
  video          Video    @relation(fields: [videoId], references: [id])
  title          String
  order          Int
  summary        String?
  notesMarkdown  String   @db.Text
  keyConcepts    String[]
  readingTimeMin Int?
  cognitiveLoad  Json?    // {fleschKincaid, avgSentenceLen, conceptDensity, index}
  chunks         Chunk[]
  progress       LessonProgress[]
  @@unique([moduleId, order])
}

model Chunk {                // mirror of Pinecone vectors, used for citations/debugging
  id         String @id     // == Pinecone vector id
  lessonId   String
  lesson     Lesson @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  index      Int
  text       String @db.Text
  startSec   Float
  endSec     Float
  tokenCount Int
}

model IngestionJob {
  id         String    @id @default(cuid())
  courseId   String
  course     Course    @relation(fields: [courseId], references: [id], onDelete: Cascade)
  input      Json      // {urls: [...], playlistUrl?, options}
  status     JobStatus @default(QUEUED)
  stage      JobStage?
  progress   Int       @default(0)   // 0-100
  error      String?
  startedAt  DateTime?
  finishedAt DateTime?
  createdAt  DateTime  @default(now())
}

model Enrollment {
  userId     String
  courseId   String
  user       User   @relation(fields: [userId], references: [id])
  course     Course @relation(fields: [courseId], references: [id])
  enrolledAt DateTime @default(now())
  @@id([userId, courseId])
}

model LessonProgress {
  userId          String
  lessonId        String
  user            User   @relation(fields: [userId], references: [id])
  lesson          Lesson @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  status          ProgressStatus @default(NOT_STARTED)
  lastPositionSec Float  @default(0)
  completedAt     DateTime?
  @@id([userId, lessonId])
}

model ChatSession {
  id        String        @id @default(cuid())
  userId    String
  courseId  String
  user      User          @relation(fields: [userId], references: [id])
  messages  ChatMessage[]
  createdAt DateTime      @default(now())
}

model ChatMessage {
  id           String      @id @default(cuid())
  sessionId    String
  session      ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  role         ChatRole
  content      String      @db.Text
  citations    Json?       // [{lessonId, chunkId, startSec, endSec, score}]
  grounded     Boolean?    // false = refused / out of scope
  createdAt    DateTime    @default(now())
}

model EvaluationRun {
  id        String   @id @default(cuid())
  courseId  String
  course    Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  kind      String   // "rag" | "notes"
  metrics   Json
  createdAt DateTime @default(now())
}
```

### Pinecone layout

- Index: `coursecraft-<embeddingModel>` (one per embedding dimension), cosine metric.
- **Namespace = `courseId`**. This is what makes the chatbot course-aware: a query can only reach its own course's vectors.
- Vector id = `Chunk.id`. Metadata: `{courseId, moduleId, lessonId, videoId, youtubeId, startSec, endSec, lessonTitle, text}`.

---

## 7. Pipelines

### 7.1 Course generation (report §3.3, Fig. 1)

Triggered by `POST /courses/generate`. NestJS creates `Course(GENERATING)` and an `IngestionJob`, then enqueues a BullMQ job. The worker calls the AI service step by step and persists results, updating `stage` and `progress` at each step.

| Step | Stage         | What happens                                                                                                                                                                                     | Where |
| ---- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 1    | `METADATA`    | Resolve playlist → video ids; fetch title, channel, duration, thumbnail via `yt-dlp` (no download)                                                                                               | AI    |
| 2    | `TRANSCRIPT`  | `youtube-transcript-api` (manual subtitles > auto, prefer `en`) → `yt-dlp` subtitles → **Whisper** fallback (download audio to S3/tmp, transcribe)                                               | AI    |
| 3    | `CHUNKING`    | Build chunks **from transcript segments**, so each chunk keeps `startSec/endSec`. Target ~800 tokens, ~120-token overlap (LangChain `RecursiveCharacterTextSplitter` with a tiktoken length fn). | AI    |
| 4    | `EMBEDDING`   | Embed chunks and upsert to Pinecone namespace `courseId`. Return chunk records.                                                                                                                  | AI    |
| 5    | `NOTES`       | Per video, **map-reduce**: chunk → partial notes; reduce → one lesson Markdown (title, summary, key concepts, sections with `[▶ mm:ss]` timestamp anchors, code blocks where relevant, recap).   | AI    |
| 6    | `STRUCTURING` | Given all lesson titles and summaries, the LLM returns (as structured Pydantic output) the course title, description, level, and **modules with ordered lessons**.                               | AI    |
| 7    | `EVALUATION`  | Compute cognitive load per lesson. If over threshold, regenerate once with a "simplify" prompt (§9).                                                                                             | AI    |
| 8    | `DONE`        | API writes Module / Lesson / Video / Chunk rows in one transaction and sets `Course.status = DRAFT` for admin review, then the admin publishes it                                                | API   |

Rules:

- Each video is processed independently and idempotently. If a video fails, it is skipped and recorded in the job; the job only fails if _every_ video fails.
- `Video` rows are cached by `youtubeId`, so re-using a video does not re-fetch the transcript.
- Long LLM calls time out with retry and backoff (3 attempts).

### 7.2 RAG chat (report Fig. 3)

`POST /courses/:id/chat` (SSE stream):

1. API checks enrollment, loads the last N messages, and calls AI `/rag/answer`.
2. AI: (optionally) condense the follow-up into a standalone question → embed it → Pinecone query in namespace `courseId`, `top_k=6`.
3. **Grounding gate**: if the best score is below `RAG_MIN_SCORE` (start at 0.35 and tune), reply with a fixed message ("This isn't covered in this course…") and set `grounded=false`. No LLM generation happens in that case.
4. Otherwise, prompt the LLM with the retrieved context. The system prompt says: _answer only from the context; if the context is insufficient, say so; cite sources as [n]_.
5. Stream the tokens back and send a final event with `citations[]` (lesson title, timestamp → deep link into the split view).
6. API saves both messages.

### 7.3 Rule-based adaptive pathing (MVP)

- `GET /courses/:id/next`: returns the first lesson, in module/lesson order, that is not `COMPLETED`.
- A lesson is auto-marked `IN_PROGRESS` when it is opened. It becomes `COMPLETED` when the user clicks "Mark complete" or watches 90% of the video.
- Course progress % = completed lessons / total lessons.
- _(Stretch)_ If a lesson quiz score is below 60%, recommend reviewing it before moving on.

---

## 8. API Surface

### 8.1 Public REST API (NestJS, prefix `/api/v1`)

| Method            | Path                                    | Auth  | Purpose                                                               |
| ----------------- | --------------------------------------- | ----- | --------------------------------------------------------------------- |
| POST              | `/auth/register` · `/auth/login`        | –     | Returns JWT (httpOnly cookie)                                         |
| GET               | `/auth/me`                              | user  | Current user                                                          |
| GET               | `/domains` · `/domains/:slug`           | –     | Catalog                                                               |
| POST/PATCH/DELETE | `/domains[/:id]`                        | admin | Manage domains                                                        |
| GET               | `/courses?domain=&q=&level=`            | –     | List published courses                                                |
| GET               | `/courses/:slug`                        | –     | Course + modules + lesson titles                                      |
| POST              | `/courses/generate`                     | admin | `{domainId, urls[] \| playlistUrl, titleHint?}` → `{courseId, jobId}` |
| GET               | `/jobs/:id` · `/jobs/:id/events` (SSE)  | admin | Job status / live progress                                            |
| PATCH             | `/courses/:id` · `/courses/:id/publish` | admin | Edit metadata, reorder, publish                                       |
| PATCH             | `/lessons/:id`                          | admin | Edit notes Markdown                                                   |
| GET               | `/lessons/:id`                          | user  | Lesson + notes + video info                                           |
| POST              | `/courses/:id/enroll`                   | user  | Enroll                                                                |
| GET               | `/me/courses`                           | user  | Enrolled courses + progress                                           |
| PUT               | `/lessons/:id/progress`                 | user  | `{status?, lastPositionSec}`                                          |
| GET               | `/courses/:id/next`                     | user  | Next recommended lesson                                               |
| POST              | `/courses/:id/chat`                     | user  | `{sessionId?, message}` → SSE stream                                  |
| GET               | `/courses/:id/chat/sessions[/:sid]`     | user  | Chat history                                                          |
| POST              | `/courses/:id/evaluate`                 | admin | Run the RAG eval set → `EvaluationRun`                                |

### 8.2 Internal AI service API (FastAPI, reachable only from the API; protected by a shared `X-Internal-Key`)

| Method | Path                  | Purpose                                                                                                                     |
| ------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`             | Liveness + configured providers                                                                                             |
| POST   | `/ingest/metadata`    | `{urls \| playlistUrl}` → video metadata list                                                                               |
| POST   | `/ingest/transcript`  | `{youtubeId}` → `{source, language, segments[]}`                                                                            |
| POST   | `/process/lesson`     | `{courseId, youtubeId, segments}` → chunks (embedded + upserted) + notes Markdown + summary + key concepts + cognitive load |
| POST   | `/process/structure`  | `{lessons:[{ref,title,summary}]}` → course outline                                                                          |
| POST   | `/rag/answer`         | `{courseId, question, history[]}` → SSE tokens + citations                                                                  |
| POST   | `/eval/rag`           | `{courseId, qa:[{question, reference?}]}` → faithfulness / relevance scores                                                 |
| DELETE | `/vectors/{courseId}` | Delete a course namespace                                                                                                   |

Shared request/response contracts: Zod schemas live in `packages/shared` (web↔api), Pydantic models in `services/ai/app/schemas.py`. **When a contract changes, update both sides in the same change.**

---

## 9. Quality & Evaluation (report Table 3)

| Metric                    | Measures                                                                     | How it's computed                                                                                                                                     | Target (proposed)                                          |
| ------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Faithfulness**          | Chatbot answers are supported by the retrieved context (hallucination guard) | RAGAS `faithfulness` on a 30-question set per demo course                                                                                             | ≥ 0.85 avg                                                 |
| **Relevance & Coherence** | Answers address the question without going off-topic                         | RAGAS `answer_relevancy` + `context_precision`                                                                                                        | ≥ 0.80 avg                                                 |
| **Off-scope refusal**     | Out-of-course questions are refused                                          | 10 off-topic questions per course; % with `grounded=false`                                                                                            | ≥ 90%                                                      |
| **Cognitive Load Index**  | How readable / dense the generated notes are                                 | `CLI = w1·norm(Flesch-Kincaid grade) + w2·norm(avg sentence length) + w3·norm(concept density: key terms per 100 words)`, scaled 0–100 using textstat | ≤ 60. If above, regenerate once with the "simplify" prompt |

Eval datasets live in `services/ai/eval/datasets/<course-slug>.jsonl`. Results are stored in `EvaluationRun` and exported to `docs/eval/` for the final report.

---

## 10. Frontend Pages (apps/web)

| Route                            | Page                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                              | Landing: problem statement, featured domains/courses                                                                                                                                                                                                                                                                                                                          |
| `/login` · `/register`           | Auth                                                                                                                                                                                                                                                                                                                                                                          |
| `/domains` · `/domains/[slug]`   | Domain grid → courses in the domain                                                                                                                                                                                                                                                                                                                                           |
| `/courses/[slug]`                | Course overview: description, module accordion, enroll / continue button, progress                                                                                                                                                                                                                                                                                            |
| `/learn/[courseSlug]/[lessonId]` | **Split view**: left = YouTube player (resumes from `lastPositionSec`), right = notes (Markdown, code highlighting, clickable `[▶ mm:ss]` anchors that seek the player). Collapsible sidebar with the module/lesson tree. Floating **chat drawer** (course-scoped) with citations that jump to lesson + timestamp. Prev / next / mark complete. Mobile: tabs instead of split |
| `/dashboard`                     | My courses, progress, "continue where you left off"                                                                                                                                                                                                                                                                                                                           |
| `/admin/courses/new`             | Paste URLs/playlist + pick domain → live job progress (SSE stepper over the stages)                                                                                                                                                                                                                                                                                           |
| `/admin/courses/[id]`            | Review the generated outline, reorder modules/lessons, edit notes, publish, run eval                                                                                                                                                                                                                                                                                          |
| `/admin/domains`                 | Domain CRUD                                                                                                                                                                                                                                                                                                                                                                   |

UI conventions: shadcn/ui components, dark/light themes, loading skeletons, every form validated with Zod.

---

## 11. Non-Functional Requirements

- **Security**: bcrypt password hashing; JWT in an httpOnly cookie; role guards; rate limits on chat and generate endpoints; the AI service is never publicly exposed; secrets only in env; validate that YouTube URLs really are YouTube.
- **Performance**: catalog pages are SSR/ISR; chat first token < 3 s with OpenAI; generating a 10-video course < 15 min.
- **Cost control**: `gpt-4o-mini` by default; cache transcripts/videos; `MAX_VIDEOS_PER_COURSE=25`; log token usage per job.
- **Reliability**: idempotent per-video steps; failed jobs can be retried from the last completed stage.
- **Observability**: structured JSON logs with a `jobId` / `requestId` correlation id across API ↔ AI.

---

## 12. Configuration

There is a single root `.env`, copied from [`.env.example`](.env.example). That file is the full, commented list of variables, so this section only gives the groups. Every new variable must be added to `.env.example` in the same PR.

| Group                 | Variables                                                                                                                                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| General               | `NODE_ENV`                                                                                                                                                                                                                                               |
| Local infra (compose) | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, `REDIS_PORT`, `OLLAMA_PORT`                                                                                                                                                        |
| API                   | `API_PORT`, `LOG_LEVEL`, `DATABASE_URL`, `TEST_DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`🔒, `JWT_EXPIRES_IN`, `WEB_ORIGIN`, `AI_SERVICE_URL`, `INTERNAL_API_KEY`🔒, `MAX_VIDEOS_PER_COURSE`                                                               |
| AI service            | `AI_PORT`, `LLM_PROVIDER`, `OPENAI_API_KEY`🔒, `OPENAI_CHAT_MODEL`, `OPENAI_EMBED_MODEL`, `OLLAMA_BASE_URL`, `OLLAMA_CHAT_MODEL`, `OLLAMA_EMBED_MODEL`, `PINECONE_API_KEY`🔒, `PINECONE_INDEX`, `WHISPER_MODEL`, `RAG_TOP_K`, `RAG_MIN_SCORE`, `CLI_MAX` |
| Storage               | `AWS_REGION`, `AWS_S3_BUCKET`, `CDN_BASE_URL`, `AWS_PROFILE` (local only; production uses an IAM role)                                                                                                                                                   |
| Web                   | `NEXT_PUBLIC_API_URL` (anything prefixed `NEXT_PUBLIC_` is visible in the browser, so never put secrets there)                                                                                                                                           |

🔒 = secret. Locally these live in `.env`. In production they live in AWS SSM Parameter Store / GitHub Actions secrets (#50).

Local infrastructure is defined in `docker-compose.yml` and documented in [docs/setup.md](docs/setup.md). It starts PostgreSQL 16 (with an extra `coursecraft_test` database for tests) and Redis 7. Ollama is optional, behind the `ollama` profile.

---

## 13. Milestones

The phases are broken into 50 GitHub issues (one PR each) in [docs/ISSUES.md](docs/ISSUES.md).

All phases are built by Subhankar with Claude Code. Because there is now one developer, each phase is a **vertical slice**: the backend, AI and UI for that phase are finished together before the next phase starts. This way something demo-able exists after every phase.

| Phase                  | Deliverable                                                                                                 | Done when                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **P0 Setup**           | Monorepo, docker-compose (Postgres, Redis), lint/format, `.env.example`, CI lint+test                       | `pnpm dev` starts web+api; `uvicorn` starts ai; health checks green |
| **P1 Core**            | Prisma schema + migrations, auth, domains/courses CRUD, seed data; web layout, auth pages, catalog browsing | Can register, log in, and browse the seeded catalog in the browser  |
| **P2 Ingestion**       | AI: metadata + transcript (with fallbacks) + chunking + embeddings                                          | pytest on 3 real videos (manual subs, auto subs, no subs → Whisper) |
| **P3 Generation**      | Notes map-reduce, structuring, BullMQ job, SSE progress, admin generate + review UI                         | A playlist URL → a reviewed, published course                       |
| **P4 Learning UX**     | Split-view lesson page, timestamp seeking, progress, next-lesson, dashboard                                 | Resume, complete, and next flow works end-to-end                    |
| **P5 RAG chat**        | `/rag/answer`, grounding gate, citations, chat drawer UI                                                    | Answers cite lessons; off-topic questions are refused               |
| **P6 Evaluation**      | Eval datasets, RAGAS + CLI runner, admin "run eval", results in docs                                        | Table 3 metrics produced for ≥ 2 demo courses                       |
| **P7 Deploy & report** | AWS deploy (EC2 + RDS), S3+CDN, demo data, screenshots, final report updates                                | Public demo URL + report results section filled                     |

**Scope guard for a single developer:** P0–P5 is the must-have demo, because it covers all three expected outcomes in §1. P6 is needed for the report's results section. If time runs short, cut these in order: Whisper fallback (show "no transcript available" instead), S3/CDN (serve YouTube thumbnails directly), and the admin notes editor.

## 14. Open Questions

1. Can students generate their own courses, or only admins? (Assumed: admin only for MVP.)
2. Which demo domains/courses will be used for the final evaluation? (Suggest 2–3 short beginner playlists, e.g. DBMS basics, Intro to NLP.)
3. ~~Deployment target~~ **Decided: AWS.** EC2 runs the Docker stack, RDS runs PostgreSQL, S3 + Cloudflare CDN serve media (issues #48–#50).
4. Is there an OpenAI API budget, or must the demo run on Ollama only?
5. Does the department need the final report and certificates updated to reflect that Shibani left the project? (This is outside the codebase, but it affects §1 and the report's Table 2.)
