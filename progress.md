# StudyPlanner — Progress

Tracking implementation against the roadmap in `study-planner-design.md` (§12).
Status legend: `[ ]` not started · `[~]` in progress · `[x]` done.

> Current state: **Phase 4 complete** — timeline + milestones are live (see details below the
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
> Next: Phase 6 (hardening — throttler/helmet/CORS/CSP are already partially in place from
> earlier phases; remaining: strict CSP for `connect-src`, Sentry, Playwright e2e, coverage
> thresholds, staging env, security checklist review).

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
- [ ] `@nestjs/throttler` rate limiting
- [ ] `helmet` + strict CSP (connect-src: own API + generativelanguage.googleapis.com)
- [ ] CORS restricted to frontend origin
- [ ] pino structured logging with sensitive-field scrubbing
- [ ] Sentry (FE + BE)
- [ ] Playwright e2e suite (login → create goal → drag card)
- [ ] Coverage thresholds in CI
- [ ] Staging environment (separate DB/secrets)
- [ ] Security checklist (design §11) reviewed

## Phase 7 — Launch
- [ ] Backend Dockerfile (multi-stage)
- [ ] Deploy workflow (`.github/workflows/deploy.yml`): migrate → deploy
- [ ] Frontend on Vercel
- [ ] Backend on Fly.io / Render
- [ ] Database on Neon / Supabase
- [ ] Observability + uptime monitoring
- [ ] DB backup configured
