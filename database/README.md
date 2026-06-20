# @study-planner/database

Data layer for StudyPlanner: the Prisma schema, migrations, dev seed, and the generated
Prisma client. The **backend** repo consumes this as a package (`@study-planner/database`)
and imports `PrismaClient` from it. This is the single source of truth for the DB schema.

## Local setup

```bash
cp .env.example .env          # DATABASE_URL (defaults match the root docker-compose Postgres)
docker compose -f ../docker-compose.yml up -d   # or run your own Postgres on :5432
pnpm install                  # also runs `prisma generate` (prepare script)
pnpm migrate                  # create/apply a migration (prisma migrate dev)
pnpm seed                     # demo data: demo@studyplanner.dev / password123
```

## Scripts

| Script          | Purpose                                          |
| --------------- | ------------------------------------------------ |
| `pnpm generate` | Generate the Prisma client into `generated/`     |
| `pnpm migrate`  | `prisma migrate dev` — create + apply a migration |
| `pnpm migrate:deploy` | `prisma migrate deploy` — apply migrations (prod/CI) |
| `pnpm seed`     | Seed demo data                                   |
| `pnpm studio`   | Open Prisma Studio                               |

## Consuming from the backend

The generated client is emitted to `generated/` (gitignored) and re-exported as the
package entry point. The backend depends on this package via a local `file:` path during
development; switch to a published registry version later. Migrations are owned here —
never edit the production DB by hand; run `pnpm deploy` via CI.
