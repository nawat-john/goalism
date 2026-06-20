# StudyPlanner

A full-feature study planner: set goals, plan a timeline with milestones, track work on a
kanban board, and get an AI assistant to draft a plan — using your own Gemini API key (BYOK),
never the server's.

Full architecture/design spec: [`study-planner-design.md`](./study-planner-design.md) (source of
truth for decisions). Build status and what's done so far: [`progress.md`](./progress.md).
Guidance for AI coding agents working in this repo: [`CLAUDE.md`](./CLAUDE.md).

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router) + TypeScript, Tailwind + shadcn/ui, TanStack Query, Zustand, dnd-kit |
| Backend | NestJS + TypeScript, zod validation, JWT auth (access in-memory + rotating httpOnly refresh cookie) |
| Database | PostgreSQL 16 via Prisma |
| Shared contract | zod schemas in `backend/packages/shared`, consumed by both apps |
| AI | Google Gemini via `@google/genai`, BYOK — direct-from-browser or thin-proxy mode, key never persisted server-side |
| Testing | Vitest + RTL + Playwright (frontend), Jest + supertest (backend, real Postgres) |
| CI | GitHub Actions (`.github/workflows/`) |

## Repo layout

```
frontend/      Next.js app (:3000)
backend/       NestJS API (:3001), owns packages/shared (the FE/BE contract)
database/      Prisma schema, migrations, seed — backend depends on this for the generated client
docker-compose.yml   Local Postgres
study-planner-design.md   Architecture & design spec (source of truth)
progress.md    Build log against the design doc's roadmap
```

This is **three independent pnpm projects**, not a single pnpm/Turborepo workspace — `database`,
`backend`, and `frontend` each have their own lockfile and are wired together via `file:`
dependencies (`backend` depends on `../database`; `frontend` depends on
`../backend/packages/shared`). See each project's own README for details.

## Quickstart

```bash
docker compose up -d                            # Postgres on :5432

cd database && pnpm install && pnpm migrate && pnpm seed && cd ..
cd backend  && cp .env.example .env && pnpm install && cd ..
cd frontend && cp .env.example .env && pnpm install && cd ..

# from either app dir, or run both together from one terminal each:
cd backend  && pnpm dev   # :3001
cd frontend && pnpm dev   # :3000
```

Demo login after seeding: `demo@studyplanner.dev` / `password123`.

Per-app `.env` files are gitignored — copy from each project's `.env.example`. See
`backend/.env.staging.example` / `frontend/.env.staging.example` / `database/.env.staging.example`
for the staging-environment shape (no staging infra is provisioned yet — see
`.github/workflows/deploy-staging.yml`).

## Testing

```bash
cd backend  && pnpm lint && pnpm typecheck && pnpm test:cov && pnpm build
cd frontend && pnpm lint && pnpm typecheck && pnpm test:cov && pnpm build && pnpm e2e
```

Backend tests run against a real Postgres (docker-compose or CI service container) — ownership,
cascade, and pagination behavior depend on real DB constraints, not mocks. `pnpm e2e` runs the
Playwright suite against an already-running app (`pnpm dev` in both apps, or a built+started
production bundle — see `.github/workflows/ci.yml`'s `e2e` job).

## Status

Phases 0–6 (setup, auth, core CRUD, board drag-and-drop, timeline/milestones, AI assistant,
hardening) are complete. Phase 7 (production deploy, monitoring, backups) is next — see
[`progress.md`](./progress.md) for the full build log and what's left.
