# CourseCraft AI

**An AI-integrated learning management system that turns scattered YouTube lectures into structured courses with readable study notes and a course-aware chatbot.**

CourseCraft AI takes YouTube videos or playlists and does three things:

1. **Structures them** into a **Domain → Course → Module → Lesson** hierarchy.
2. **Writes study notes** for every lesson in Markdown, linked to timestamps in the video, and shows them side by side with the video.
3. **Answers questions** through a **RAG chatbot** that uses only that course's content, cites the lesson and timestamp for each answer, and refuses questions the course doesn't cover.

> B.Tech minor project (Project-I), Dept. of CSE, Veer Surendra Sai University of Technology, Burla (2025–26).
> Supervisor: Dr. Sucheta Panda. Project report: [docs/report/CourseCraftAI.pdf](docs/report/CourseCraftAI.pdf).

## Status

🚧 **In development.** Work follows a 50-issue roadmap ([docs/ISSUES.md](docs/ISSUES.md), tracked as [GitHub issues](https://github.com/subhankar2004/CourseCraft_AI/issues) and [milestones](https://github.com/subhankar2004/CourseCraft_AI/milestones)).

## Architecture

```
┌──────────────┐  HTTP/JSON + SSE   ┌──────────────────┐  internal HTTP  ┌──────────────────────┐
│  Next.js Web │ ─────────────────▶ │  NestJS API      │ ──────────────▶ │  AI Service (Python) │
│  apps/web    │ ◀───────────────── │  apps/api        │ ◀────────────── │  FastAPI + LangChain │
└──────────────┘                    └──────────────────┘                 └──────────────────────┘
                                      │ Prisma    │ BullMQ                 │            │
                                      ▼           ▼                        ▼            ▼
                                 PostgreSQL     Redis                  Pinecone   OpenAI / Ollama
```

- **Web**: UI only. It talks only to the API.
- **API**: auth, REST endpoints, background jobs. It is the only service that writes to PostgreSQL.
- **AI service**: transcripts, chunking, embeddings, note generation, RAG and evaluation. It stores no state of its own and is never exposed publicly.

The full design is in [SPEC.md](SPEC.md).

## Tech stack

| Layer      | Technologies                                                                         |
| ---------- | ------------------------------------------------------------------------------------ |
| Frontend   | Next.js, TypeScript, Tailwind CSS, shadcn/ui, Zod, TanStack Query                    |
| API        | NestJS, TypeScript, Prisma, PostgreSQL, BullMQ + Redis, JWT                          |
| AI service | Python, FastAPI, LangChain, youtube-transcript-api, yt-dlp, Whisper, Pinecone, RAGAS |
| LLMs       | OpenAI `gpt-4o-mini` + `text-embedding-3-small`, or local models via Ollama          |
| Infra      | Docker Compose, AWS (EC2, RDS, S3), Cloudflare CDN, GitHub Actions                   |

## Repository layout

```
apps/web/          Next.js frontend
apps/api/          NestJS backend + Prisma schema
services/ai/       FastAPI AI pipeline (Python, managed with uv)
packages/shared/   Shared TypeScript types and Zod schemas
docs/              Roadmap, setup/deploy guides, evaluation results, project report
scripts/           Repo automation (e.g. GitHub issue generator)
```

## Getting started

Prerequisites: **Node.js 24 LTS** (see `.nvmrc`), **pnpm 12**, **Python 3.11+** with [uv](https://docs.astral.sh/uv/), and **Docker**.

```bash
# Node + pnpm (pnpm version is pinned in package.json "packageManager")
nvm use                 # or install Node 24 another way
npm install -g pnpm@12  # or: brew install pnpm

pnpm install            # installs root tooling and all workspace packages
cp .env.example .env    # then replace the change-me secrets
pnpm infra:up           # PostgreSQL + Redis in Docker
```

Full setup guide: [docs/setup.md](docs/setup.md).

Run the API with `pnpm --filter api dev` (health check at `http://localhost:4000/api/v1/health`). Run the web app with `pnpm --filter web dev` (http://localhost:3000). The AI service command (#5) will be added when it is built. Every environment variable is documented in `.env.example`. Never commit real secrets.

## Contributing workflow

One issue → one branch → one pull request:

1. Branch from `main` as `<type>/<issue>-<slug>`, e.g. `feat/9-auth-api`.
2. Commit using [Conventional Commits](https://www.conventionalcommits.org/) (`feat(api): add login endpoint`).
3. Open a PR with `Closes #<issue>` and fill in the PR template.
4. Merge only after review and green CI.

Every PR also updates the research record: the development log [docs/PROGRESS.md](docs/PROGRESS.md) and the IEEE-style citations [docs/REFERENCES.md](docs/REFERENCES.md) / [docs/references.bib](docs/references.bib).

See [AGENTS.md](AGENTS.md) for coding conventions, which apply to both human contributors and AI coding agents.

## Team

- **Subhankar Patra**: developer (full stack, AI pipeline, deployment)
- Report co-author: Shibani Taria
- Supervisor: Dr. Sucheta Panda, Associate Professor, Dept. of CSE, VSSUT Burla

## License

[Apache License 2.0](LICENSE)
