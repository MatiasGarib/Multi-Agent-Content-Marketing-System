# Multi-Agent Content Marketing System

**Assignment 4 — Agentic AI Systems**

A production-grade, daily content marketing pipeline for GitHub built with 8 coordinated AI agents. Generates SEO-optimised blog posts, Twitter threads, LinkedIn posts, and newsletter blurbs — with a live dashboard, human review UI, and a feedback loop that improves future runs.

---

## Academic submission

→ [`deliverables/assignment-4.md`](deliverables/assignment-4.md)

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Next.js 14 App Router on Vercel |
| LLM | Anthropic Claude claude-sonnet-4-5 |
| Database | Neon Postgres (`pg` package) |
| Scheduling | Vercel Cron Jobs (`vercel.json`) |
| Output | GitHub REST API (pushes Markdown files to this repo under `content/`) |
| Language | TypeScript throughout |

---

## Agent architecture

```
RESEARCH TIER (sequential)
  KeywordResearcher → TopicPrioritizer → BrandChecker

GENERATION TIER (sequential, with revision loop)
  ContentGenerator → CriticReviewer (max 2 cycles) → Editor → ChannelAdapter

HUMAN REVIEW (async, post-run)
  Review UI → FeedbackAgent → PipelineContext (next run)
```

---

## Running locally

```bash
# 1. Clone and install
git clone https://github.com/MatiasGarib/Multi-Agent-Content-Marketing-System.git
cd Multi-Agent-Content-Marketing-System
npm install

# 2. Add environment variables
cp .env.example .env.local
# Fill in: ANTHROPIC_API_KEY, DATABASE_URL, GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH, CRON_SECRET, NEXT_PUBLIC_CRON_SECRET

# 3. Start dev server
npm run dev

# 4. Open http://localhost:3000 and click "Run Pipeline"
```

## Environment variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `DATABASE_URL` | Neon Postgres connection string |
| `GITHUB_TOKEN` | GitHub personal access token (repo write scope) |
| `GITHUB_REPO` | `owner/repo` format |
| `GITHUB_BRANCH` | Branch to push content to (default: `main`) |
| `CRON_SECRET` | Secret header value for the cron endpoint |
| `NEXT_PUBLIC_CRON_SECRET` | Same value — exposed to browser for the dashboard trigger button |

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Live pipeline dashboard |
| `GET` | `/api/pipeline/stream` | SSE stream — starts pipeline and streams progress |
| `GET` | `/api/pipeline/[runId]/outputs` | Full content outputs for a run |
| `POST` | `/api/pipeline/[runId]/review` | Submit human review decisions |
| `GET` | `/api/runs` | Last 10 pipeline runs from Postgres |
| `POST` | `/api/cron/daily` | Vercel Cron trigger (requires `x-cron-secret` header) |
