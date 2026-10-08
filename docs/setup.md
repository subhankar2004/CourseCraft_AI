# Local Development Setup

## Prerequisites

| Tool                                                              | Version | Why                                | Install (macOS)                           |
| ----------------------------------------------------------------- | ------- | ---------------------------------- | ----------------------------------------- |
| [Node.js](https://nodejs.org)                                     | 24 LTS  | web + api (version in `.nvmrc`)    | `brew install nvm` then `nvm install`     |
| [pnpm](https://pnpm.io)                                           | 12      | JS package manager (monorepo)      | `npm i -g pnpm@12` or `brew install pnpm` |
| [Python](https://www.python.org)                                  | 3.11+   | AI service                         | `brew install python@3.12`                |
| [uv](https://docs.astral.sh/uv/)                                  | latest  | Python env + dependency manager    | `brew install uv`                         |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | latest  | PostgreSQL, Redis (and Ollama)     | `brew install --cask docker`              |
| [ffmpeg](https://ffmpeg.org)                                      | any     | audio extraction for Whisper (#19) | `brew install ffmpeg`                     |
| [Ollama](https://ollama.com) _(optional)_                         | latest  | run LLMs locally instead of OpenAI | `brew install ollama` (see note below)    |

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

### Optional: local LLMs with Ollama

```bash
pnpm infra:up:ollama                                    # = docker compose --profile ollama up -d
docker compose exec ollama ollama pull llama3.1:8b
docker compose exec ollama ollama pull nomic-embed-text
```

Then set `LLM_PROVIDER=ollama` in `.env`.

> **macOS note:** Docker can't use the Apple GPU, so Ollama in a container runs on CPU only and is slow. On a Mac it's better to install the native app (`brew install ollama && ollama serve`). It listens on the same `localhost:11434`, so in that case don't start the `ollama` profile.

## 3. Install JS dependencies

```bash
nvm use
pnpm install
```

## 4. Run the API

```bash
pnpm --filter api dev       # http://localhost:4000/api/v1/health
pnpm --filter api test      # unit + e2e tests (no database needed yet)
```

The API validates its environment at startup. If a variable is missing or invalid (e.g. a `change-me` secret), it exits immediately and lists every problem.

How to run the web app and AI service will be added here as each one is built (issues #4 and #5).

## Troubleshooting

| Problem                                     | Fix                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `port is already allocated` on 5432 / 6379  | Another Postgres/Redis is running (`brew services stop postgresql`), or change `POSTGRES_PORT`/`REDIS_PORT` in `.env` and the matching URLs |
| `Cannot connect to the Docker daemon`       | Start Docker Desktop                                                                                                                        |
| `coursecraft_test` database missing         | The init script only runs on an empty volume: `pnpm infra:reset && pnpm infra:up`                                                           |
| Changed `POSTGRES_PASSWORD` but login fails | Postgres keeps the password from first start: `pnpm infra:reset`                                                                            |
