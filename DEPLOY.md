# Deployment & Launch Runbook (Phase 7)

This is the operator runbook for taking StudyPlanner to production. The repository
ships all the **deploy artifacts** (Dockerfile, Fly/Vercel config, CI/CD and backup
workflows); what remains is **provisioning real infrastructure and setting secrets**,
which can only be done in the respective consoles. Work top to bottom.

Topology (design §10.1):

```
Browser ── HTTPS ──▶ Vercel (Next.js frontend)
                         │  XHR (CORS) to NEXT_PUBLIC_API_URL
                         ▼
                    Fly.io (NestJS API, Docker)  ──▶  Neon/Supabase (Postgres 16)
Error tracking: Sentry (frontend + backend)   Uptime: external monitor → /api/v1/health
```

The three layers deploy independently. **Migrate the DB before rolling out new API
code** — the deploy workflow enforces this order.

---

## 1. Database — Neon (or Supabase)

1. Create a project on [Neon](https://neon.tech) (Postgres 16). Neon is the design's
   first choice (serverless, branchable for preview DBs); Supabase works identically —
   only the connection string differs.
2. Grab the **pooled** connection string and append `?sslmode=require`.
3. Keep a separate database/branch for **staging** vs **production**.
4. Backups: Neon keeps automatic backups + point-in-time restore (Supabase: daily
   backups on paid tiers). The repo *also* runs a daily logical `pg_dump`
   (`.github/workflows/db-backup.yml`) as a portable, provider-independent copy —
   see §6.

The schema is applied by `prisma migrate deploy` from CI (never by hand — see
CLAUDE.md "Migration discipline"). Migrations live in `database/prisma/migrations/`.

---

## 2. Backend — Fly.io

Artifacts: `backend/Dockerfile` (multi-stage), `.dockerignore`, `fly.toml`.

> The Docker **build context is the repo root**, not `backend/`: the API depends on
> the sibling `database/` project (`file:../database`, the generated Prisma client)
> and on `backend/packages/shared` (`workspace:*`). `fly.toml` already points at
> `backend/Dockerfile` with the root as context.

```bash
# from the repo root
fly apps create studyplanner-api            # name must match fly.toml `app`
fly secrets set \
  DATABASE_URL="postgresql://…?sslmode=require" \
  JWT_ACCESS_SECRET="$(openssl rand -base64 48)" \
  JWT_REFRESH_SECRET="$(openssl rand -base64 48)" \
  CORS_ORIGIN="https://<your-vercel-domain>" \
  COOKIE_SAMESITE="none" \
  SENTRY_DSN="https://…ingest.sentry.io/…"
fly deploy --remote-only                    # first manual deploy; CI does the rest
```

`NODE_ENV=production` and `PORT=3001` are baked into `fly.toml [env]`. Health checks
hit `GET /api/v1/health` (which runs `SELECT 1`, so a failing DB marks the machine
unhealthy). To smoke-test a build locally without Fly:

```bash
docker build -f backend/Dockerfile -t studyplanner-api .
docker run --rm -p 3001:3001 --env-file backend/.env.production studyplanner-api
curl localhost:3001/api/v1/health
```

### COOKIE_SAMESITE — the cross-site gotcha

The refresh token is an httpOnly cookie. Browsers only send a `SameSite=Lax` cookie
on **same-site** requests. So:

- Frontend and API share a registrable domain (`app.studyplanner.com` +
  `api.studyplanner.com`) → leave `COOKIE_SAMESITE` unset (defaults to `lax`).
- Frontend and API on **different** domains (`*.vercel.app` + `*.fly.dev`) → set
  `COOKIE_SAMESITE=none`. The code forces `Secure` whenever SameSite is `none`.

Getting this wrong is silent: login works, but `/auth/refresh` never receives the
cookie, so every reload logs the user out.

---

## 3. Frontend — Vercel

Artifact: `frontend/vercel.json`.

1. Import the repo into Vercel; set **Root Directory = `frontend`**.
2. Because the frontend imports the shared package via `file:../backend/packages/shared`
   (outside the root dir), enable **Settings → General → "Include files outside the
   Root Directory in the build step."** Next then transpiles the shared TS source
   directly (`transpilePackages` in `next.config.mjs`) — no separate build of `shared`
   is required.
3. Set Production env vars (see `frontend/.env.production.example`):
   - `NEXT_PUBLIC_API_URL=https://studyplanner-api.fly.dev/api/v1`
   - `NEXT_PUBLIC_SENTRY_DSN=…` (optional)
4. Vercel auto-deploys on push to `main` via its git integration — there is
   deliberately **no GitHub Actions job** for the frontend.

After deploy, set the backend's `CORS_ORIGIN` (and `COOKIE_SAMESITE`) to match the
final Vercel domain, then `fly deploy` to apply.

---

## 4. CI/CD pipeline

- `.github/workflows/ci.yml` — lint/typecheck/test/build + Playwright e2e on every PR
  and push (unchanged from Phase 6).
- `.github/workflows/deploy.yml` — **production**. Triggers on a successful CI run on
  `main` (`workflow_run`, guarded on `conclusion == 'success'`), then: migrate prod DB
  → `flyctl deploy`. Also `workflow_dispatch` for manual rollouts.
- `.github/workflows/deploy-staging.yml` — **staging**, manual `workflow_dispatch`:
  migrate staging DB → deploy to the `studyplanner-api-staging` Fly app.

GitHub secrets to set (Settings → Secrets and variables → Actions):

| Secret | Used by | Notes |
|---|---|---|
| `PROD_DATABASE_URL` | deploy, db-backup | Neon/Supabase prod URL (`sslmode=require`) |
| `FLY_API_TOKEN` | deploy | `fly tokens create deploy` (scoped) |
| `STAGING_DATABASE_URL` | deploy-staging | staging DB URL |
| `STAGING_FLY_API_TOKEN` | deploy-staging | staging-scoped Fly token |

Put `PROD_DATABASE_URL`/`FLY_API_TOKEN` on a **`production`** GitHub Environment with
required reviewers so deploys gate on a human approval.

---

## 5. Observability & uptime

- **Sentry** (frontend + backend) is wired from Phase 6 and is a no-op until a DSN is
  set. Backend: `SENTRY_DSN` (Fly secret). Frontend: `NEXT_PUBLIC_SENTRY_DSN` (Vercel
  env). Both scrub `x-user-gemini-key`/`authorization`/`cookie`/`password` before send.
  Create two Sentry projects (node + nextjs), set the DSNs, then trigger a test error
  to confirm events arrive and are scrubbed.
- **Uptime monitor**: point an external monitor (Better Stack / UptimeRobot / Fly's own
  checks) at `https://studyplanner-api.fly.dev/api/v1/health` and at the Vercel root.
  Alert to email/Slack on failure. The health endpoint already verifies DB connectivity.

---

## 6. Backups

- Managed provider backups (Neon PITR / Supabase daily) are the primary recovery path —
  confirm the retention window in the provider console.
- `.github/workflows/db-backup.yml` runs a daily `pg_dump` (gzip) and uploads it as a
  GitHub artifact (30-day retention) for a provider-independent copy. For real disaster
  recovery, change the upload step to push to object storage (Cloudflare R2 / S3) so
  backups outlive GitHub's artifact retention cap.
- **Test a restore** at least once before relying on it:
  `gunzip -c studyplanner-….sql.gz | psql "$RESTORE_TARGET_URL"`.

---

## 7. HTTPS / HSTS (design §11 — the last security-checklist item)

This was the one Phase 6 item deferred to launch because it only becomes meaningful
once TLS is terminated by a real host:

- Vercel and Fly both terminate TLS automatically; `fly.toml` sets `force_https = true`.
- `helmet()` (in `backend/src/main.ts`) emits HSTS by default — now effective because
  responses are served over HTTPS in production.
- The CSP includes `upgrade-insecure-requests` (`frontend/middleware.ts`).

Verify after first deploy:

```bash
curl -sI https://studyplanner-api.fly.dev/api/v1/health | grep -i strict-transport-security
```

---

## 8. Go-live checklist

- [ ] Neon/Supabase prod DB created; `PROD_DATABASE_URL` set (CI secret + Fly secret)
- [ ] Fly app created; all backend secrets set; first `fly deploy` healthy
- [ ] Vercel project imported (root = `frontend`, outside-root files enabled); env set
- [ ] `CORS_ORIGIN` + `COOKIE_SAMESITE` on the backend match the real Vercel domain
- [ ] GitHub secrets set; `production` environment with required reviewers
- [ ] Sentry DSNs set (FE + BE); test error captured and scrubbed
- [ ] Uptime monitor watching `/api/v1/health` with alerting
- [ ] Daily `pg_dump` workflow green; one restore rehearsed
- [ ] HSTS header confirmed over HTTPS
- [ ] Golden path exercised against production (register → goal → board → drag card)
