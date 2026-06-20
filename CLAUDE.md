# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

**Phase 0 (setup) is complete** — see `progress.md` for the roadmap and what's done. The monorepo
scaffold is in place and verified: `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` all
pass, and the first Prisma migration (`apps/api/prisma/migrations/*_init`) has been applied and seeded
against a local Docker Postgres. The apps are skeletons: the API exposes only `GET /api/v1/health`;
the web app renders a placeholder page. Auth, CRUD, board UX, timeline, and AI are not built yet
(Phases 1–7). The original design spec is `study-planner-design.md` (in Thai).

When asked to build features, treat the design doc as the source of truth for architecture decisions,
but verify the doc's external assumptions before relying on them (Gemini model names like
`gemini-2.5-flash`, Google's client-side-key policy, and CORS behavior all change — check
`ai.google.dev/gemini-api/docs`). Model names must be config values, never hardcoded.

## Intended stack & layout

Planned as a **pnpm + Turborepo monorepo**. Per the design doc, the target structure is:

```
apps/web/      # Next.js (App Router) + React + TS — Tailwind + shadcn/ui, TanStack Query, Zustand, dnd-kit
apps/api/      # NestJS + TS — Prisma, JWT auth, zod validation pipe
packages/shared/  # zod schemas + types shared by FE and BE  ← the contract glue
docker-compose.yml  # postgres:16 for local dev
```

Database is PostgreSQL 16 via Prisma. Full SQL + Prisma schema is in §5 of the design doc.

## Commands

```bash
docker compose up -d                          # local postgres on :5432 (user/pass/db: dev/dev/studyplanner)
pnpm install                                  # corepack pnpm not available here; pnpm was installed via `npm i -g pnpm`
pnpm --filter api exec prisma migrate dev     # create/apply a migration (use `exec` — there is no "prisma" script)
pnpm --filter api exec prisma generate        # regenerate Prisma client after schema edits
pnpm --filter api exec tsx prisma/seed.ts     # seed demo data (demo@studyplanner.dev / password123)
pnpm dev                                       # run web (:3000) + api (:3001) together via turbo
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # CI gate (see .github/workflows/ci.yml)
```

Per-app `.env` files are gitignored; copy from `apps/api/.env.example` and `apps/web/.env.example`.
On Windows/PowerShell, pnpm echoes the command to stderr, which PowerShell surfaces as a red
`NativeCommandError` — this is cosmetic, not a failure; check the actual task summary/exit code.

Testing tools differ per app: **Vitest + React Testing Library + Playwright** for `web`,
**Jest + supertest + Testcontainers** for `api`. Integration/contract tests use a real Postgres
(Testcontainers or CI service container), not a mocked DB — much of the logic relies on real
constraints and cascades.

## Architecture decisions that span multiple files

These are the non-obvious, cross-cutting rules from the design doc that are easy to violate:

- **`packages/shared` is the single source of contract.** Goal/Board/Card zod schemas are defined
  there once, used to validate on the backend and to infer types on the frontend. Do not duplicate
  these shapes in either app.

- **The AI layer is pluggable behind one `AIProvider` interface** with two swappable implementations
  selected by a user setting (design §6.2):
  - *Mode A (Direct):* browser calls Gemini directly with the user's key via `@google/genai`; the key
    never touches the backend. May fail on CORS depending on environment.
  - *Mode B (Thin proxy):* `POST /ai/proxy/generate` forwards to Gemini as a **stateless
    pass-through** — the key arrives in the `x-user-gemini-key` header and must **never be persisted
    or logged**. Forward to Gemini using the `x-goog-api-key` header, never `?key=` in the URL.

- **The Gemini key lives client-side only.** There is deliberately no DB table for it. Default
  storage is in-memory (non-persisted Zustand); `sessionStorage` only on explicit opt-in; never
  `localStorage`. Never render raw AI output as HTML (sanitize with DOMPurify if markdown is needed).
  Pino/Sentry must scrub `x-user-gemini-key` and `password` fields.

- **AI only proposes; the backend is the source of truth.** AI output is validated with zod and shown
  for user review, then persisted via the normal `POST /goals/:id/apply-plan` endpoint (bulk create in
  a single transaction). AI never writes directly to the DB.

- **Ordering uses fractional/lexicographic `position` strings** (LexoRank / `fractional-indexing`),
  not sequential ints, on cards and columns. Inserting between two items computes a midpoint rank and
  updates **one row** — never renumber a whole column.

- **Auth flow:** short-lived JWT access token kept in memory only; refresh token in an
  httpOnly+Secure+SameSite cookie with rotation. The web client has a fetch interceptor that retries
  on 401 via `/auth/refresh`, and calls `/auth/refresh` on app boot to rehydrate.

- **Every API resource is scoped by the token's `user_id`** (guard against IDOR). All endpoints except
  `auth/register|login|refresh` require a valid access token. API is versioned under `/api/v1`. Error
  responses use a consistent `{ error: { code, message, details } }` shape.

- **Stateless backend** — no in-memory session state; all state in Postgres so instances scale
  horizontally. The denormalized `board_id` on `cards` exists to speed queries; keep it consistent.

## Migration discipline

Edit Prisma schema → `prisma migrate dev --name <name>` → commit the migration files. Never hand-edit
the production DB; production runs `prisma migrate deploy` via CI. Write migrations to be
backward-compatible (add nullable column → backfill → enforce not-null in a later migration) so old
and new code coexist during rollout. CI runs migrations **before** deploying new code.

## Build roadmap

The design doc (§12) sequences the build: Phase 0 setup (monorepo, docker-compose, first Prisma
migration, CI skeleton) → Phase 1 auth → Phase 2 core CRUD → Phase 3 board DnD → Phase 4
timeline/milestones → Phase 5 AI assistant (Direct mode first, then proxy + apply-plan) → Phase 6
hardening → Phase 7 launch.
