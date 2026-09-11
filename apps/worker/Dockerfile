# syntax=docker/dockerfile:1
# Multi-stage build for @adv/worker (pg-boss scheduler + Agent SDK runtime) from the pnpm/turbo
# monorepo. `pnpm deploy` produces a self-contained package directory (real files, not symlinks, and
# only the production dependency graph) that the runner stage copies wholesale - no repo-root
# node_modules needed at runtime.
#
# Build from the repository root:  docker build -f apps/worker/Dockerfile -t adv-worker .

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# ---- deps: install the full workspace so pnpm can resolve internal package versions ----
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/jobs/package.json packages/jobs/package.json
COPY packages/knowledge/package.json packages/knowledge/package.json
COPY packages/connectors/package.json packages/connectors/package.json
COPY packages/media/package.json packages/media/package.json
COPY packages/agents/package.json packages/agents/package.json
COPY packages/email/package.json packages/email/package.json
COPY packages/analytics/package.json packages/analytics/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN pnpm install --frozen-lockfile

# ---- builder: build every workspace package @adv/worker depends on, then the worker itself ----
FROM deps AS builder
COPY . .
RUN pnpm --filter @adv/shared --filter @adv/db --filter @adv/jobs --filter @adv/knowledge \
      --filter @adv/connectors --filter @adv/media --filter @adv/agents --filter @adv/email \
      --filter @adv/analytics --filter @adv/worker build
# `--legacy`: this workspace does not set `inject-workspace-packages=true`, so pnpm v10's default
# hard-linked "injected" deploy is unavailable - the legacy deploy (copy + resolve from the store)
# works the same for a production image and needs no workspace-wide config change.
RUN pnpm --filter @adv/worker deploy --prod --legacy /out

# ---- runner: minimal image with just the built worker + its resolved production deps ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# `git` is required at runtime by the opt-in `improve_app` job (Phase 6b), which shells out to
# `git clone`/`checkout`/`commit`/`push` in a temp dir - see src/jobs/improve_app.ts.
RUN apk add --no-cache git

RUN addgroup --system --gid 1001 worker && adduser --system --uid 1001 worker

COPY --from=builder --chown=worker:worker /out ./

USER worker
EXPOSE 3001

# /health checks both the DB connection and pg-boss's installed state (see src/lib/health.ts).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
