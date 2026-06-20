# Multi-stage build for the NestJS API.
#
# IMPORTANT: build context is the REPO ROOT, not backend/ — the backend depends
# on the sibling `database/` project via `file:../database` (the generated Prisma
# client) and on `backend/packages/shared` via `workspace:*`. The on-disk layout
# (/app/database + /app/backend) is preserved into the runtime image so those
# relative file: links resolve. Build with:
#   docker build -f backend/Dockerfile -t studyplanner-api .
# (fly.toml sets build.dockerfile + uses the repo root as context.)

# ── base ──────────────────────────────────────────────────────────────────────
FROM node:22-slim AS base
# Prisma's query engine needs openssl at runtime; ca-certificates for TLS to the DB.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11
WORKDIR /app

# ── build ─────────────────────────────────────────────────────────────────────
FROM base AS build
# Toolchain for any native addon (argon2) that can't use a prebuilt binary.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# 1) database: install + generate the Prisma client (output: database/generated/client).
#    Done first so backend's `file:../database` resolves to a generated package.
COPY database/ ./database/
RUN cd database && pnpm install --frozen-lockfile && pnpm generate

# 2) backend: install (builds packages/shared via its prepare script, links
#    file:../database) then compile, then drop dev dependencies.
COPY backend/ ./backend/
RUN cd backend \
  && pnpm install --frozen-lockfile \
  && pnpm build \
  && pnpm prune --prod
# Prune the database project's dev deps too (drops the Prisma CLI + tsx; keeps
# @prisma/client and the already-generated client the runtime needs).
RUN cd database && pnpm prune --prod

# ── runtime ───────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
# Keep the same two-project layout so file:../database + workspace links resolve.
COPY --from=build /app/database ./database
COPY --from=build /app/backend ./backend
WORKDIR /app/backend
EXPOSE 3001
# Migrations run in the deploy workflow (prisma migrate deploy) BEFORE this image
# is rolled out — see .github/workflows/deploy.yml — so the container just serves.
CMD ["node", "dist/main.js"]
