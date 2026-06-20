# @study-planner/backend

NestJS API for StudyPlanner. Versioned under `/api/v1`. Stateless; all state in PostgreSQL.

This repo also **owns the shared FE/BE contract** at `packages/shared` (`@study-planner/shared`),
which is published as a package and consumed by the frontend. The DB layer lives in the separate
**database** repo (`@study-planner/database`), consumed here for the Prisma client.

## Local setup

```bash
cp .env.example .env          # DATABASE_URL, JWT secrets, CORS_ORIGIN
pnpm install                  # links ../database and ./packages/shared via file: paths,
                              # builds shared (prepare) and generates the Prisma client
pnpm dev                      # nest start --watch (default :3001)
```

Requires Postgres running and migrated — see the **database** repo (`pnpm migrate`).

## Cross-repo dependencies

- `@study-planner/database` → `file:../database` (Prisma client; the database repo owns migrations)
- `@study-planner/shared` → `file:./packages/shared` (zod contract)

These local `file:` paths are for development. Switch to published registry versions for CI/prod.

## Scripts

`pnpm dev` · `pnpm build` · `pnpm start` · `pnpm lint` · `pnpm typecheck` · `pnpm test`
