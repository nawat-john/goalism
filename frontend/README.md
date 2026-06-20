# @study-planner/frontend

Next.js (App Router) frontend for StudyPlanner. Tailwind + shadcn/ui, TanStack Query, Zustand.

## Local setup

```bash
cp .env.example .env          # NEXT_PUBLIC_API_URL (points at the backend, /api/v1)
pnpm install                  # links @study-planner/shared via file:../backend/packages/shared
pnpm dev                      # next dev (:3000)
```

## Shared contract

The zod/types contract is `@study-planner/shared`, owned by the **backend** repo. During
development it's linked via `file:../backend/packages/shared`, so the `backend` repo must be
checked out as a sibling directory. Switch to a published registry version for CI/prod.

## Scripts

`pnpm dev` · `pnpm build` · `pnpm start` · `pnpm lint` · `pnpm typecheck` · `pnpm test`
