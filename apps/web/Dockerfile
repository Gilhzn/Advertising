# syntax=docker/dockerfile:1
# Multi-stage build for @adv/web (Next.js standalone output) from the pnpm/turbo monorepo.
# Build from the repository root:  docker build -f apps/web/Dockerfile -t adv-web .

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# ---- deps: install the full workspace so pnpm can resolve internal package versions ----
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/jobs/package.json packages/jobs/package.json
COPY packages/connectors/package.json packages/connectors/package.json
COPY packages/agents/package.json packages/agents/package.json
COPY packages/knowledge/package.json packages/knowledge/package.json
COPY packages/media/package.json packages/media/package.json
COPY packages/analytics/package.json packages/analytics/package.json
COPY packages/email/package.json packages/email/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

# ---- builder: build the workspace packages @adv/web depends on, then build the app ----
FROM deps AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @adv/shared --filter @adv/db --filter @adv/jobs --filter @adv/connectors build
RUN pnpm --filter @adv/web build

# ---- runner: minimal image with just the Next.js standalone server ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static

RUN mkdir -p ./apps/web/public/uploads && chown -R nextjs:nodejs ./apps/web/public

USER nextjs
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
