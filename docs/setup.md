# Local Development Setup

## Prerequisites

| Tool                                                              | Version | Why                                                  | Install (macOS)                            |
| ----------------------------------------------------------------- | ------- | ---------------------------------------------------- | ------------------------------------------ |
| [Node.js](https://nodejs.org)                                     | 24 LTS  | web + api (version in `.nvmrc`)                      | `brew install nvm` then `nvm install`      |
| [pnpm](https://pnpm.io)                                           | 12      | JS package manager (monorepo)                        | `npm i -g pnpm@12` or `brew install pnpm`  |
| [Python](https://www.python.org)                                  | 3.12    | AI service (pinned in `services/ai/.python-version`) | installed by uv (`uv python install 3.12`) |
| [uv](https://docs.astral.sh/uv/)                                  | latest  | Python env + dependency manager                      | `brew install uv`                          |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | latest  | PostgreSQL, Redis (and Ollama)                       | `brew install --cask docker`               |
| [ffmpeg](https://ffmpeg.org)                                      | any     | audio extraction for Whisper (#19)                   | `brew install ffmpeg`                      |
| [Ollama](https://ollama.com) _(optional)_                         | latest  | run LLMs locally instead of OpenAI                   | `brew install ollama` (see note below)     |

On Linux, use your distro's packages or the official installers. On Windows, use WSL2.

## 1. Environment variables

The repo uses **one `.env` file at the root**, shared by Docker Compose, the API and the AI service.

```bash
cp .env.example .env
```

- The defaults work as-is for local infrastructure.
- Replace the `change-me` secrets with generated values:
  ```bash
  openssl rand -base64 48   # JWT_SECRET
  openssl rand -hex 32      # INTERNAL_API_KEY
  ```
- `OPENAI_API_KEY` and `PINECONE_API_KEY` are only needed once the AI pipeline is built (issues #16 and #21). Leave them empty until then.
- `.env` is git-ignored. Never commit it, paste it into issues, or share keys in screenshots. If a key leaks, rotate it immediately.

## 2. Start the infrastructure

```bash
pnpm infra:up         # = docker compose up -d   (PostgreSQL 16 + Redis 7)
pnpm infra:ps         # both should show "(healthy)"
```

| Service    | Host address      | Credentials (dev only)                                                           |
| ---------- | ----------------- | -------------------------------------------------------------------------------- |
| PostgreSQL | `localhost:5432`  | `coursecraft` / `coursecraft`, DB `coursecraft` (+ `coursecraft_test` for tests) |
| Redis      | `localhost:6379`  | no auth (local only)                                                             |
| Ollama     | `localhost:11434` | only with the `ollama` profile                                                   |

Useful commands:

```bash
pnpm infra:logs       # follow logs
pnpm infra:down       # stop (data is kept in named volumes)
pnpm infra:reset      # stop AND delete all local data (volumes)
docker compose exec postgres psql -U coursecraft -d coursecraft   # SQL shell
docker compose exec redis redis-cli                               # Redis shell
```

### Local models with Ollama (default, free)

`.env.example` uses `LLM_PROVIDER=ollama`: embeddings and notes run on your machine, with no API key. On macOS, use the native app, which can use the Apple GPU:

```bash
brew install ollama && brew services start ollama       # listens on localhost:11434
ollama pull nomic-embed-text                            # embeddings, 274 MB (#21)
ollama pull llama3.1:8b                                 # notes and chat, 4.9 GB (#23 onwards)
```

On Linux or Windows you can instead run it in Docker: `pnpm infra:up:ollama`, then `docker compose exec ollama ollama pull <model>`. Docker on a Mac can't use the GPU, so the container is slow there. To use OpenAI instead, set `LLM_PROVIDER=openai` and `OPENAI_API_KEY`.

Vectors are stored in PostgreSQL with pgvector (the Compose image includes it). The AI service creates its `vector_store` schema on first use.

## 3. Install JS dependencies

```bash
nvm use
pnpm install
```

## 4. Run the API

```bash
pnpm --filter api prisma:deploy   # apply database migrations (first run, and after pulling new ones)
pnpm --filter api dev             # http://localhost:4000/api/v1/health
pnpm --filter api test            # unit + e2e tests (e2e needs PostgreSQL running: pnpm infra:up)
```

- `/health` pings PostgreSQL: `200` with `database: up`, or `503` with `database: down` (the reason is in the API log, never in the response).
- The database schema lives in `apps/api/prisma/schema.prisma`. After changing it, run `pnpm --filter api prisma:migrate --name <what-changed>`. `pnpm --filter api prisma:studio` opens a browser UI for the data.

### Signing in (web)

With the API and the web app running, open http://localhost:3000/login and sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (or the student account) from `.env`, or create a new account at `/register`. `/dashboard` and `/admin` need a session (students get a 403 page on `/admin`).

> Rate limits apply to everyone on one IP (5 logins per minute, 5 sign-ups per hour). Locally they are in memory, so restarting the API resets them.

### Signing in (API)

```bash
curl -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"admin@coursecraft.local","password":"<SEED_ADMIN_PASSWORD from .env>"}' \
  localhost:4000/api/v1/auth/login
curl -b cookies.txt localhost:4000/api/v1/auth/me
```

The session is an httpOnly `cc_session` cookie. `POST /api/v1/auth/logout` clears it. After 5 failed logins in a minute from one IP, the API answers `429` until the minute passes.

### Demo data

```bash
pnpm --filter api prisma:seed     # safe to re-run
```

The seed creates:

- an **admin** and a **student** account, with credentials from `SEED_*` in `.env`;
- **4 domains**: Web Development, DSA, Database Systems, Machine Learning;
- one published course, **Database Fundamentals** (2 modules, 4 lessons). It uses real freeCodeCamp.org videos and handwritten notes whose `[▶ h:mm:ss]` anchors are the videos' chapter starts.

It upserts everything, so re-running doesn't duplicate data, and it never changes an existing account's password. It refuses to run with `NODE_ENV=production` unless `SEED_ALLOW_PRODUCTION=true`.

The API validates its environment at startup. If a variable is missing or invalid (e.g. a `change-me` secret), it exits immediately and lists every problem.

## 5. Run the web app

```bash
pnpm --filter web dev       # http://localhost:3000
```

- The web app reads `NEXT_PUBLIC_API_URL` from the root `.env`. Because `NEXT_PUBLIC_*` values are **inlined into the browser bundle at build time**, restart `dev` (or rebuild) after changing them, and never put secrets in a `NEXT_PUBLIC_` variable.
- The footer's status dot shows **API online** when the API from step 4 is running.
- Theme: light / dark / system, from the toggle in the header (saved in `localStorage`).

## 6. Run the AI service

```bash
pnpm ai:sync        # creates services/ai/.venv with Python 3.12 (uv downloads it if needed)
pnpm ai:dev         # http://localhost:8000/health · interactive docs at http://localhost:8000/docs
pnpm ai:test        # pytest, offline (pgvector tests use coursecraft_test; skipped if it's down)
uv --directory services/ai run pytest -m network   # opt-in: real YouTube, Whisper and Ollama
pnpm ai:fixtures    # re-record the offline test fixtures from YouTube (review the diff)
pnpm ai:lint && pnpm ai:typecheck
```

- Configuration comes from the same root `.env`. At startup the service validates it and refuses to boot with a list of problems, e.g. a `change-me` `INTERNAL_API_KEY`.
- `/health` is public and shows which LLM and vector-store providers are configured (it never shows keys). With the defaults it reports `ollama` (`nomic-embed-text`, 768-d) and `pgvector` (`vector_store.chunks_nomic`).
- Every other endpoint requires the `X-Internal-Key` header. Only the NestJS API calls this service; browsers never do.
- `/docs` is disabled when `NODE_ENV=production`.

## Troubleshooting

| Problem                                     | Fix                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `port is already allocated` on 5432 / 6379  | Another Postgres/Redis is running (`brew services stop postgresql`), or change `POSTGRES_PORT`/`REDIS_PORT` in `.env` and the matching URLs |
| `Cannot connect to the Docker daemon`       | Start Docker Desktop                                                                                                                        |
| `coursecraft_test` database missing         | The init script only runs on an empty volume: `pnpm infra:reset && pnpm infra:up`                                                           |
| Changed `POSTGRES_PASSWORD` but login fails | Postgres keeps the password from first start: `pnpm infra:reset`                                                                            |

## 7. Checks (same as CI)

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

`lint`, `typecheck` and `test` cover both the JS packages and the Python service. CI (`.github/workflows/ci.yml`) runs them on every pull request in two jobs: **Node** (with PostgreSQL and Redis service containers) and **Python** (uv).

`packages/shared` (shared Zod schemas and types) is built automatically by `pnpm install`. If you edit it, run `pnpm --filter shared build`, or keep `pnpm dev` running, which watches it.
