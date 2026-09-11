# Deploying `@adv/worker` (and `@adv/web`) to Railway

Three Railway services share one Postgres instance:

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   postgres   │◄─────│   web        │      │   worker     │
│ (Railway PG) │◄─────│ (apps/web)   │      │ (apps/worker)│
└──────────────┘      └──────────────┘      └──────────────┘
                              │                     │
                              └── enqueues jobs ─────┘
                                  (pg-boss via DATABASE_URL)
```

`web` and `worker` never talk to each other directly - they communicate only through Postgres rows
(`pgboss.*` job queues, and the app tables `posts`/`platform_accounts`/etc.). Either can be redeployed,
scaled, or restarted independently.

## 1. `postgres`

Railway's managed Postgres plugin (or any Postgres 16+). Copy its connection string into
`DATABASE_URL` on both other services. Run migrations once from a shell with that `DATABASE_URL` set
(from a Railway one-off command, or locally against the Railway DB):

```
pnpm db:migrate
```

## 2. `worker` (this app)

**Build**: `apps/worker/Dockerfile` (multi-stage: install workspace deps → build every package
`@adv/worker` depends on → `pnpm --filter @adv/worker deploy --prod --legacy /out` → copy `/out` into a
minimal `node:22-alpine` runner). Point Railway's build at the repo root with
`apps/worker/Dockerfile` as the Dockerfile path (Railway supports a monorepo root + custom Dockerfile
path natively; no Nixpacks config needed).

**Start command**: the image's `CMD` (`node dist/main.js`) - leave it, no override needed.

**Health check**: `GET /health` on `$PORT` (default `3001`). Returns `{ ok, db, boss }` -
`200` when both the DB ping and pg-boss's `isInstalled()` succeed, `503` otherwise. Configure Railway's
health check path to `/health`; the `HEALTHCHECK` already baked into the image covers Docker-level
restarts too.

**Env vars** (see `.env.example` at the repo root for the full list; the worker only needs a subset):

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Same Postgres as `web`. pg-boss creates its own `pgboss` schema on first boot. |
| `TOKEN_ENCRYPTION_KEY` | yes | Must be the **same** 32-byte hex key `web` uses to encrypt OAuth tokens - `openssl rand -hex 32`, generated once, shared between services. |
| `APP_URL` | yes | Public URL of `web` - used as the base for locally-stored media URLs (`${APP_URL}/uploads/...`) when R2 is not configured. |
| `PORT` | no | Defaults to `3001`. Railway injects its own `$PORT`; the app reads it, no change needed. |
| `NODE_ENV` | yes | `production` - also suppresses the dev-only repo-root `.env` load in `src/main.ts`. |
| `ANTHROPIC_API_KEY`, `SUPERVISOR_MODEL`, `AI_MONTHLY_BUDGET_USD` | yes (for the four agent jobs) | Consumed by `@adv/agents`, not the worker directly. |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_BASE_URL` | recommended | `@adv/media`'s `uploadMedia` uses Cloudflare R2 when all three credential vars are set; otherwise it falls back to writing under `MEDIA_LOCAL_DIR` (default `apps/web/public/uploads`), which does **not** survive a redeploy or scale-out on Railway (ephemeral filesystem, and `worker`/`web` are separate containers) - set R2 in any real deployment. |
| Platform app credentials (`META_APP_ID`, `LINKEDIN_CLIENT_ID`, `TELEGRAM_BOT_TOKEN`, ...) | yes (per connector) | Consumed by `@adv/connectors`, needed for `publish_post`/`fetch_insights`/`refresh_tokens` to do anything. |

**Concurrency / scaling**: the worker registers per-queue concurrency in `src/main.ts`
(`localConcurrency`, e.g. 5 for `publish_post`, 1 for the cron-driven scheduler jobs). Running two
worker instances is safe - pg-boss's `FOR UPDATE SKIP LOCKED`-based fetch (and this worker's own
`publish_due_posts`/`publish_post` claim pattern, see `src/jobs/README.md`) means both instances pull
from the same queues without double-processing a job. Do not scale past what the DB connection pool
tolerates (`postgres` client is created with `max: 10` per process, see `packages/db/src/client.ts`).

**Graceful shutdown**: `src/main.ts` handles `SIGTERM`/`SIGINT` by closing the HTTP server and calling
pg-boss's graceful `stop()` (lets in-flight jobs finish before exiting). Railway sends `SIGTERM` on
deploy/restart; no extra config needed.

## 3. `web` (`apps/web`)

Already has its own `apps/web/Dockerfile`. Shares `DATABASE_URL` and `TOKEN_ENCRYPTION_KEY` with
`worker`; enqueues jobs via `@adv/jobs`'s `enqueue()` (same pg-boss instance/schema, no network hop to
`worker`).

## Local equivalent

```
docker build -f apps/worker/Dockerfile -t adv-worker .
docker run --rm -p 3001:3001 --env-file .env -e NODE_ENV=production adv-worker
curl localhost:3001/health
```

Or without Docker, from the repo root: `pnpm -F @adv/worker build && pnpm -F @adv/worker start`.
