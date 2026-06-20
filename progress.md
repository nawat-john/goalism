# StudyPlanner — Progress

Tracking implementation against the roadmap in `study-planner-design.md` (§12).
Status legend: `[ ]` not started · `[~]` in progress · `[x]` done.

> Current state: **Phase 7 complete (code/config)** — all deploy artifacts are in the repo;
> what's left is infra provisioning + secrets, documented in `DEPLOY.md` (see the Phase 7 block
> further down). The phase-by-phase recap below is kept in build order.
>
> Earlier recap — **Phase 4 complete** — timeline + milestones are live (see details below the
> Phase 3 recap). Phase 3 recap: board drag-and-drop is live: `PATCH /cards/:id/move`
> (ownership-scoped column lookup, single-row update, denormalized `boardId` kept consistent),
> a dnd-kit board (`PointerSensor`, `closestCenter`, `DragOverlay`, per-column `SortableContext`)
> with optimistic TanStack Query updates (`onMutate` snapshot → `onError` rollback →
> `onSettled` invalidate), and a pure `applyCardMove` cache function covered by unit tests.
> Backend tests: 35 passing incl. real-Postgres integration (reorder-within-column,
> cross-column move, ownership 404 on move); frontend 6. Both apps build/lint/typecheck clean.
> Verified live in a real browser (Playwright against the running dev servers): logged in as the
> demo user, dragged a card across columns and reordered within a column, reloaded, and confirmed
> the new order persisted with no console errors.
>
> **Two pre-existing bugs were found and fixed while verifying this phase, unrelated to the
> drag-and-drop code itself:**
> 1. `database/prisma/seed.ts` seeded bare-letter `position` values (`"a"`, `"n"`, …), which
>    `fractional-indexing`'s `generateKeyBetween` rejects as malformed once used as a boundary —
>    every "add card/column" against the seeded demo board 500'd. Fixed by generating real keys
>    via `generateKeyBetween` in the seed script (`database/prisma/seed.ts`).
> 2. The Postgres database's default collation (`en_US.utf8`) sorts text case-insensitively
>    (`'a0' < 'Zz'`), but `fractional-indexing` keys assume byte order (`'Zz' < 'a0'`), so
>    `ORDER BY position` could silently disagree with the key order the app computed — this
>    broke same-column reordering specifically. Fixed with a migration
>    (`20260620015953_fix_position_collation`) forcing `COLLATE "C"` on the `position` column of
>    `boards`, `board_columns`, and `cards`. **Run `prisma migrate deploy`/`migrate dev` to pick
>    this up on any existing local DB.**
>
> **Phase 4 complete** — milestones CRUD (`MilestonesController`/`Service`, ownership-scoped,
> `ForbiddenException({ code: "GOAL_NOT_FOUND" })` when linking a `goalId` owned by someone else,
> matching the `cards.service.ts` precedent) and `GET /timeline` (`TimelineController`/`Service`,
> both registered under one `MilestonesModule` per the design doc's folder layout, which has no
> separate `timeline/` module) combining milestones (by `date`) and cards (by `dueDate`, excluding
> nulls), filterable by `?from=&to=&goalId=`, scoped by `userId`. The Prisma model and zod schemas
> (`milestoneSchema`, `createMilestoneSchema`, `timelineQuerySchema`, …) were already scaffolded
> ahead of this phase and needed no changes. Web: `/timeline` page — date-range + goal filters, a
> create-milestone form, and a horizontally-scrollable gantt-ish view (date scale with week/month
> labels, today highlighted, milestones and due-dated cards as separate tracks, hover-to-delete on
> milestones). New nav link in `AppHeader`. Backend tests: 45 passing (5 new, real-Postgres:
> CRUD, cross-user 404/403, range+goal filtering, user-scoping). Frontend: existing 6 unit tests
> still pass (no new ones added — `milestonesApi`/`timelineApi` are thin wrappers, consistent with
> how `labelsApi`/`boardsApi` aren't separately unit-tested either). Both apps build/lint/typecheck
> clean. Verified live in a real browser: logged in as the demo user, created a milestone on
> `/timeline`, confirmed it rendered at the correct date-scale position, reloaded and confirmed it
> persisted, deleted it, and saw no console errors beyond a pre-existing boot-time 401 (the
> refresh-on-boot race) that also reproduces on `/labels` — unrelated to this phase.
>
> **Phase 5 complete** — AI assistant (BYOK Gemini, design §6). Backend: `AiModule`
> (`AiService`/`AiController`) holds both server-side pieces — `POST /ai/proxy/generate`
> (Mode B thin proxy: reads the key from `x-user-gemini-key`, forwards to
> `generativelanguage.googleapis.com` via the `x-goog-api-key` header — never `?key=` — and
> returns Gemini's JSON as-is; maps a 429 to `AI_QUOTA_EXCEEDED`; the key only ever exists in
> this request's stack frame, and is redacted from pino logs by the existing `LoggerModule`
> redact config) and `POST /goals/:id/apply-plan` (wired onto `GoalsController`, ownership-scoped
> like every other goal endpoint; bulk-creates cards + optional milestones from an
> AI-accepted plan in one `$transaction` — auto-creates a board seeded with the standard
> `DEFAULT_COLUMNS` if the goal has none yet, otherwise appends to the existing board's first
> column in fractional-position order). `aiProxyGenerateSchema` added to `packages/shared`
> alongside the `planRequestSchema`/`planSuggestionSchema`/`applyPlanSchema` that were already
> scaffolded ahead of this phase. Frontend: `lib/ai/` implements the pluggable `AIProvider`
> interface from design §6.2 with two swappable implementations — `DirectGeminiProvider`
> (Mode A, `@google/genai` straight from the browser, key never touches our backend) and
> `ProxyGeminiProvider` (Mode B, calls our proxy endpoint) — selected by a `mode` field in a
> new Zustand `useAiKeyStore`. The Gemini key itself is **never persisted to `localStorage`**:
> default is in-memory only (lost on refresh), with an explicit "remember for this tab"
> opt-in that writes to `sessionStorage` (design §6.3). Gemini's JSON response is validated
> with `planSuggestionSchema` (`parsePlan`) before ever being shown to the user — invalid JSON
> or a schema mismatch throws `PlanParseError` rather than rendering anything; a 429 surfaces
> as `AiQuotaError` with a friendly message instead of retrying. `AiPlanPanel` (new component,
> wired into the goal detail page next to the status controls) collects the key + mode +
> optional context, generates with cancel-via-`AbortController` support, shows a loading state,
> renders the proposed cards/milestones as plain text (no `dangerouslySetInnerHTML` — nothing to
> sanitize), and on "Accept" persists via `useApplyPlan` → `POST /goals/:id/apply-plan`, i.e.
> the AI only ever proposes; the backend remains the source of truth.
>
> Backend tests: 46 passing (6 new in `test/ai.e2e-spec.ts`, real-Postgres: default-board
> auto-creation, appending to an existing board, cross-user 404 on apply-plan, proxy forwarding
> with a mocked `fetch` asserting the key reaches `x-goog-api-key` and never the URL, missing-key
> 400, 429→`AI_QUOTA_EXCEEDED` mapping). Frontend: 15 passing (9 new — `parse-plan.test.ts`,
> `key-store.test.ts` proving the sessionStorage-opt-in/never-localStorage contract; added
> `jsdom` + `vitest.config.ts` since the previous Node test environment had no `window`/storage
> to exercise that contract against; `aiApi.applyPlan` itself is a thin wrapper and wasn't
> separately unit-tested, consistent with `milestonesApi`/`timelineApi`). Both apps
> build/lint/typecheck clean.
>
> **Not verified live in a browser this phase** (unlike Phases 1–4): no headless-browser tool
> (`chromium-cli`, Playwright) was preinstalled in this environment, and installing Playwright's
> browser binary ad hoc stalled with no output after several minutes on this machine, so it was
> abandoned rather than left blocking. Separately, BYOK means there's no key available in this
> environment to exercise an actual Gemini call end-to-end either way. The dev servers were left
> running (backend :3001, frontend :3000) so a real Gemini key can be tried by hand; route
> registration was confirmed from the Nest boot log (`POST /goals/:id/apply-plan`,
> `POST /ai/proxy/generate` both mapped). Recommend running this phase's golden path
> (open a goal → "✨ AI Plan" → paste a real key → generate → review → accept) by hand, and/or
> revisiting with a proper browser-driving tool before Phase 6's Playwright e2e suite is built.
>
> `pnpm-workspace.yaml` (frontend) build-script approvals (`@google/genai`, `protobufjs`) were
> set to `true` — both are pure-JS SDK/codegen postinstalls, no native compilation.
>
> **Phase 6 complete** — hardening. Throttler (global `ThrottlerGuard`, 100 req/60s, no
> `@SkipThrottle` anywhere so it covers every endpoint), `helmet()`, pino redact
> (`x-user-gemini-key`/`authorization`/`req.body.password`), and CORS restricted to
> `CORS_ORIGIN` were already in place from earlier phases. This phase added the rest:
>
> - **Strict, nonce-based CSP** (`frontend/middleware.ts`) — `helmet()` only covers API
>   responses, so the policy that actually constrains the browser has to live in Next's
>   middleware. `script-src` is `'self' 'nonce-…' 'strict-dynamic'`, `connect-src` is scoped to
>   our own API origin + `generativelanguage.googleapis.com` (+ the Sentry DSN's origin once
>   configured). **Found and fixed a real bug while verifying this**: `next dev`'s webpack HMR
>   runtime evaluates code via `eval()`, which a strict CSP blocks outright — that silently broke
>   hydration in dev mode (forms fell back to native HTML submission with no console error, which
>   looked exactly like a broken click handler). Fixed by adding `'unsafe-eval'` only when
>   `NODE_ENV !== "production"`; verified the production CSP header has no `unsafe-eval` by
>   building and starting a prod bundle and inspecting the response header directly.
> - **Sentry, backend + frontend**, both no-op unless a DSN is configured (no infra is
>   provisioned yet — design intentionally defers that to Phase 7/launch). Backend:
>   `src/sentry.ts` inits from `SENTRY_DSN` with a `beforeSend` that strips
>   `x-user-gemini-key`/`authorization`/`cookie` headers and `password`/`x-user-gemini-key` body
>   fields (mirrors the pino redact list); `AllExceptionsFilter` calls `Sentry.captureException`
>   for the unexpected-error branch only (HttpExceptions are expected control flow, not noise).
>   Frontend: `instrumentation-client.ts` + `instrumentation.ts`, both gated on
>   `NEXT_PUBLIC_SENTRY_DSN`, with a `beforeSend`/`beforeBreadcrumb` regex scrub for the same two
>   fields as defense-in-depth (the Gemini key is never deliberately attached to Sentry context —
>   design §6.3 keeps it client-memory/sessionStorage-only — but nothing stops a future change
>   from doing so by accident).
> - **Playwright e2e suite** (`frontend/e2e/golden-path.spec.ts` + `playwright.config.ts`):
>   the design roadmap's named golden path — register → create a goal → add a board → drag a
>   card between board columns (via real OS-level `page.mouse` events so dnd-kit's
>   `PointerSensor` actually activates) → reload and confirm the move persisted. Registers a
>   fresh, timestamp-unique user each run so it doesn't depend on seeded demo data. The config
>   deliberately does **not** spawn its own dev server — it assumes the app is already running
>   (`pnpm dev` locally, or CI's explicit build+start step before `pnpm e2e`), matching
>   `.github/workflows/ci.yml`'s `e2e` job exactly.
> - **Coverage thresholds**: added `test:cov` to both apps (`jest --coverage`,
>   `vitest run --coverage`) since CI's `e2e` job already referenced `pnpm test:cov` without the
>   script existing. Backend: global thresholds (85/60/70/85 stmts/branches/funcs/lines) set a
>   few points below the real baseline (~87/67/75/87), `main.ts` and `sentry.ts` excluded as
>   init-only side-effect modules. Frontend: scoped to the three modules that actually carry
>   dedicated unit tests (`parse-plan.ts`, `key-store.ts`, `client.ts`) rather than all of `lib/`
>   — `resources.ts`'s thin API wrappers are exercised by the e2e suite instead, consistent with
>   the project's existing convention (per Phase 4/5 notes) of not separately unit-testing thin
>   wrappers. Also added `@vitest/coverage-v8` (missing devDependency) and excluded `e2e/**` from
>   Vitest's own test discovery (it was trying to run the Playwright specs as Vitest tests).
> - **API key restriction hint**: `AiPlanPanel` now links to Google AI Studio's key page with a
>   one-line nudge to restrict the key by HTTP referrer (design §11's last checklist item).
> - **Security checklist (design §11) reviewed line by line** against the actual code (not just
>   assumed from earlier phases): argon2 hashing ✓, short-lived in-memory access token + rotating
>   httpOnly/`sameSite=lax`/`secure`-in-prod refresh cookie ✓, CORS origin allowlist ✓, zod
>   validation on every endpoint ✓, throttler on every endpoint ✓, helmet+CSP ✓ (with the dev-mode
>   fix above), user-scoped queries throughout (carried by every prior phase's tests) ✓, Gemini
>   key never in the DB/logs/Sentry ✓, AI output rendered as plain text only (no
>   `dangerouslySetInnerHTML` anywhere in the codebase) ✓, log/error-reporter scrubbing ✓, API key
>   restriction hint ✓. The one item that's deploy-time rather than application-code (**HTTPS
>   everywhere + HSTS**) is deferred to Phase 7: `helmet()`'s HSTS header is on by default, but
>   it's only meaningful once a reverse proxy/host actually terminates TLS in front of the app.
> - **Staging environment**: `.env.staging.example` for all three projects and
>   `.github/workflows/deploy-staging.yml` (manual `workflow_dispatch`, migrates the staging DB)
>   exist, but no staging infra is actually provisioned — this is intentionally a skeleton to wire
>   up real secrets/hosts against in Phase 7, not a live environment.
>
> Backend: 46 tests passing, coverage gate passing (87.0% stmts / 66.7% branches / 75.2% funcs /
> 87.3% lines vs. 85/60/70/85 thresholds). Frontend: 15 unit tests passing, coverage gate passing
> on the three scoped modules (97.0% stmts / 88.9% branches / 100% funcs / 97.0% lines vs.
> 90/75/90/90 thresholds); 1 new Playwright e2e test passing, verified stable across multiple
> consecutive runs against both a dev server and a production build. Both apps build/lint/typecheck
> clean.
>
> **Phase 7 complete (code/config artifacts)** — launch. Every deployable artifact is now in
> the repo; what remains is provisioning real infra + setting secrets in the respective consoles,
> documented end-to-end in the new `DEPLOY.md` runbook. Hosts chosen per design §10.1: **Vercel**
> (frontend) · **Fly.io** (backend) · **Neon/Supabase** (Postgres).
>
> - **Backend Dockerfile** (`backend/Dockerfile`, multi-stage) + `.dockerignore`. Non-obvious bit:
>   the build context is the **repo root**, not `backend/`, because the API links the sibling
>   `database/` project (`file:../database`, the generated Prisma client) and `backend/packages/shared`
>   (`workspace:*`) — the design doc's example Dockerfile assumed a single pnpm workspace, which this
>   repo is *not*. So the build stages database first (`pnpm install && prisma generate`), then
>   backend (`pnpm install` builds shared via its prepare + links database, then `nest build`), prunes
>   dev deps in both, and the runtime image preserves the `/app/database` + `/app/backend` layout so
>   the relative links resolve. Runtime is `node:22-slim` + `openssl` (Prisma engine needs it);
>   migrations run in CI, not in the container.
> - **Fly config** (`fly.toml`, repo root) — `primary_region = "sin"` (closest to Thailand),
>   `force_https`, `/api/v1/health` checks, secrets via `fly secrets set` (never in the file).
> - **Production deploy workflow** (`.github/workflows/deploy.yml`) — gated on a successful CI run on
>   `main` (`workflow_run` + `conclusion == 'success'`), then migrate prod DB → `flyctl deploy`, in
>   that order (backward-compatible migrations ship before new code). Frontend has no job — Vercel
>   auto-deploys via git integration. Filled in the **staging** skeleton to match (deploys to a
>   separate `studyplanner-api-staging` Fly app).
> - **Vercel config** (`frontend/vercel.json`) + the documented gotcha that the frontend's
>   `file:../backend/packages/shared` dep requires Vercel's "include files outside the root directory"
>   setting (Next transpiles shared's TS source directly via `transpilePackages`, so no separate build).
> - **DB backup** (`.github/workflows/db-backup.yml`) — daily `pg_dump | gzip` via the `postgres:16`
>   image (matches server major), uploaded as a 30-day artifact, layered on top of the provider's PITR;
>   documented upgrade path to R2/S3 for long-term retention.
> - **Observability/uptime/HSTS** documented in `DEPLOY.md` §5/§7: Sentry (FE+BE) already wired from
>   Phase 6 (no-op until DSN set), external monitor → `/api/v1/health`, and HSTS (helmet default +
>   `force_https` + CSP `upgrade-insecure-requests`) — the §11 checklist's last "HTTPS+HSTS" item,
>   only meaningful now that a TLS-terminating host is in the picture.
> - **Production env templates** (`backend/.env.production.example`, `frontend/.env.production.example`).
>
> **One real launch-blocker fixed in app code, not just config:** the refresh cookie was hardcoded
> `SameSite=Lax`, which a browser will not send on the cross-site `/auth/refresh` call when the
> frontend (Vercel) and API (Fly) are on different registrable domains (`*.vercel.app` + `*.fly.dev`) —
> login would work but every reload would silently log the user out. Made it env-driven
> (`COOKIE_SAMESITE`, default `lax`; code forces `Secure` when set to `none`); `lax` still correct for
> same-site subdomain deploys and local dev. Backend lint/typecheck/build clean; the auth e2e only
> asserts `HttpOnly`/`Path`, which the default path preserves.
>
> **Not done here (genuinely requires consoles/accounts, not code):** creating the Neon DB, Fly app,
> and Vercel project; setting the GitHub/Fly/Vercel secrets; wiring Sentry DSNs and an uptime monitor;
> rehearsing a restore. All are enumerated as a go-live checklist in `DEPLOY.md` §8. The Dockerfile was
> **not** built/run in this environment (no Docker available here) — validated by review against the
> real dependency graph; smoke-test command is in `DEPLOY.md` §2.

---

## Phase 0 — Setup
- [x] Initialize git repository
- [x] pnpm + Turborepo monorepo (`pnpm-workspace.yaml`, `turbo.json`)
- [x] `apps/web` Next.js scaffold (App Router + TS + Tailwind + shadcn/ui foundation)
- [x] `apps/api` NestJS scaffold (TS)
- [x] `packages/shared` (zod schemas + types)
- [x] `packages/tsconfig` + `packages/eslint-config`
- [x] `docker-compose.yml` (postgres:16)
- [x] Prisma schema + first migration (`20260619133440_init`)
- [x] `.env.example` for api and web
- [x] CI skeleton (`.github/workflows/ci.yml`)

## Phase 1 — Auth
- [x] `users` + `refresh_tokens` models (already in the init migration)
- [x] register / login (argon2 password hashing)
- [x] JWT access token (in-memory) + refresh token (httpOnly cookie) + rotation
- [x] `/auth/refresh`, `/auth/logout`, `/auth/me`
- [x] JWT guard + per-user (`user_id`) request scoping (`JwtAuthGuard` + `@CurrentUser`; resource scoping lands with Phase 2 endpoints)
- [x] Web: token store (in-memory), fetch interceptor (401 → refresh → retry), boot rehydrate
- [x] Web: login / register pages
- [x] Tests: auth unit + integration (service unit + controller e2e w/ stubbed service; DB-backed integration via Testcontainers/CI deferred with Phase 2)

## Phase 2 — Core CRUD
- [x] Goals: list / create / get (w/ boards+milestones) / patch / delete
- [x] Boards: list / create (seeds default columns) / get (nested columns+cards) / patch / delete
- [x] Columns: create / patch / delete
- [x] Cards: create (denormalized `boardId`) / get (w/ labels) / patch (completedAt toggle) / delete
- [x] Labels: CRUD + card_labels (attach/detach via `/cards/:id/labels/:labelId`)
- [x] zod validation pipe (schemas from shared) — done in Phase 1, applied across all endpoints
- [x] Consistent error format `{ error: { code, message, details } }` (done in Phase 1)
- [x] Cursor-based pagination on list endpoints (`?limit=&cursor=` → `{ data, nextCursor }`)
- [x] Web: dashboard, goal detail, board, labels views (TanStack Query)
- [x] Tests: CRUD integration against real Postgres (docker compose), incl. ownership/cascade/pagination

> Note: card-move + drag-and-drop reordering is Phase 3. `position` keys use `fractional-indexing`
> (pinned to v2 for CJS compat); only append-to-end is used in Phase 2.

## Phase 3 — Board UX
- [x] Fractional ranking for `position` (LexoRank / fractional-indexing)
- [x] `PATCH /cards/:id/move` (columnId + new position, single-row update)
- [x] dnd-kit board with drag & drop
- [x] Optimistic update + rollback on failure
- [x] Tests: ranking unit tests, move integration

## Phase 4 — Timeline + Milestones
- [x] `milestones` model + CRUD
- [x] `GET /timeline` (milestones + cards with due_date, `?from=&to=&goalId=`)
- [x] Web: timeline view (gantt-ish), milestones, date scale
- [x] Tests

## Phase 5 — AI Assistant (BYOK Gemini)
- [x] `AIProvider` interface + `PlanRequest`/`PlanSuggestion` types
- [x] Mode A: DirectGeminiProvider (`@google/genai`, client-side key)
- [x] Mode B: thin proxy `POST /ai/proxy/generate` (no persist, no log of key)
- [x] zod validation of AI JSON output before display
- [x] `POST /goals/:id/apply-plan` (bulk create cards/milestones in one transaction)
- [x] Web: AI panel, key input (in-memory default), suggestion review UI
- [x] Quota/429 handling, timeout + cancel, loading states
- [x] Tests: plan parser unit, e2e with mocked Gemini

## Phase 6 — Hardening
- [x] `@nestjs/throttler` rate limiting
- [x] `helmet` + strict CSP (connect-src: own API + generativelanguage.googleapis.com)
- [x] CORS restricted to frontend origin
- [x] pino structured logging with sensitive-field scrubbing
- [x] Sentry (FE + BE)
- [x] Playwright e2e suite (login → create goal → drag card)
- [x] Coverage thresholds in CI
- [x] Staging environment (separate DB/secrets) — skeleton only, no infra provisioned yet
- [x] Security checklist (design §11) reviewed — all items done in code; HTTPS/HSTS is a
      deploy-time concern deferred to Phase 7

## Phase 7 — Launch
- [x] Backend Dockerfile (multi-stage) — `backend/Dockerfile` + `.dockerignore` (repo-root context)
- [x] Deploy workflow (`.github/workflows/deploy.yml`): migrate → deploy (gated on green CI);
      staging workflow completed to match
- [x] Frontend on Vercel — `frontend/vercel.json` + provisioning steps in `DEPLOY.md` §3
- [x] Backend on Fly.io — `fly.toml`; provisioning + secrets in `DEPLOY.md` §2
- [~] Database on Neon / Supabase — `migrate:deploy` wired into both deploy workflows; actual
      DB provisioning is a console step (`DEPLOY.md` §1)
- [x] Observability + uptime monitoring — Sentry FE+BE (Phase 6) + health-check monitor
      (`DEPLOY.md` §5); DSN/monitor setup is a console step
- [x] DB backup configured — `.github/workflows/db-backup.yml` (daily `pg_dump`) + provider PITR
      (`DEPLOY.md` §6)

> Remaining for go-live is infra provisioning + secrets only (no code) — see the `DEPLOY.md` §8
> checklist. Also fixed a real cross-site launch bug: `COOKIE_SAMESITE` env (refresh cookie was
> hardcoded `SameSite=Lax`, which breaks cross-domain Vercel↔Fly refresh).
