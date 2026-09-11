# Deploying to Railway

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

## Service 1: `postgres`

Railway's managed Postgres plugin (or any Postgres 16+). Copy its connection string into
`DATABASE_URL` on both other services. Run migrations once from a shell with that `DATABASE_URL` set
(a Railway one-off command, or locally against the Railway DB):

```
pnpm db:migrate
```

## Service 2: `worker` (`apps/worker`)

**Build**: `apps/worker/Dockerfile` (multi-stage: install workspace deps → build every package
`@adv/worker` depends on, including `@adv/email` and `@adv/analytics` → `pnpm --filter @adv/worker
deploy --prod --legacy /out` → copy `/out` into a minimal `node:22-alpine` runner, with `git` installed
for the opt-in `improve_app` job). Point Railway's build at the repo root with `apps/worker/Dockerfile`
as the Dockerfile path (Railway supports a monorepo root + custom Dockerfile path natively; no Nixpacks
config needed).

**Start command**: the image's `CMD` (`node dist/main.js`) - leave it, no override needed.

**Health check**: `GET /health` on `$PORT` (default `3001`). Returns `{ ok, db, boss }` - `200` when
both the DB ping and pg-boss's `isInstalled()` succeed, `503` otherwise. Configure Railway's health check
path to `/health`; the `HEALTHCHECK` already baked into the image covers Docker-level restarts too.

**Concurrency / scaling**: the worker registers per-queue concurrency in `src/main.ts`
(`localConcurrency`, e.g. 5 for `publish_post`, 1 for the cron-driven scheduler jobs). Running two worker
instances is safe - pg-boss's `FOR UPDATE SKIP LOCKED`-based fetch (and this worker's own
`publish_due_posts`/`publish_post` claim pattern, see `src/jobs/README.md`) means both instances pull
from the same queues without double-processing a job. Do not scale past what the DB connection pool
tolerates (`postgres` client is created with `max: 10` per process, see `packages/db/src/client.ts`).

**Graceful shutdown**: `src/main.ts` handles `SIGTERM`/`SIGINT` by closing the HTTP server and calling
pg-boss's graceful `stop()` (lets in-flight jobs finish before exiting). Railway sends `SIGTERM` on
deploy/restart; no extra config needed.

## Service 3: `web` (`apps/web`)

Has its own `apps/web/Dockerfile`. Shares `DATABASE_URL` and `TOKEN_ENCRYPTION_KEY` with `worker`;
enqueues jobs via `@adv/jobs`'s `enqueue()` (same pg-boss instance/schema, no network hop to `worker`).

## Cron schedules (registered by `worker` on boot, all UTC)

`worker`'s `main.ts` calls `boss.schedule(name, cron, {}, { tz: "UTC" })` for every entry in
`packages/jobs/src/index.ts`'s `SCHEDULES` - the single source of truth. As of this phase:

| Job | Cron | What it does |
|---|---|---|
| `publish_due_posts` | `* * * * *` (every minute) | Claims due posts, enqueues `publish_post` per post. |
| `fetch_insights` | `0 */6 * * *` (every 6h) | Refreshes platform metrics for every owned, connected account. |
| `refresh_tokens` | `15 */12 * * *` (every 12h) | Refreshes OAuth tokens expiring within 24h. |
| `sync_product_analytics` | `30 3 * * *` (03:30 daily) | Pulls PostHog snapshots for every business with a linked project. |
| `content_autopilot` | `0 4 * * *` (04:00 daily) | Tops up the content calendar to ≥3 posts/7d for eligible businesses. |
| `run_analyst_all` | `0 5 * * 1` (05:00 Monday) | Fans out `run_analyst` to every business with a published post. |
| `run_product_advisor_all` | `30 5 * * 1` (05:30 Monday) | Fans out `run_product_advisor` to every business with a PostHog project. |

Scheduling `run_analyst_all` 30 minutes ahead of `run_product_advisor_all` gives the analyst's weight
updates (and any `discover_business` replan it triggers) a head start before the product advisor reads
the same business records. `content_autopilot` runs before both so a fresh content batch has all week to
generate and get approved. Only two jobs run on a business-specific, non-cron basis end-to-end without
ever being scheduled by the worker itself: `provision_mailbox` and `improve_app` are both enqueued by
`apps/web` (mailbox setup in the wizard; app-improvement is an explicit opt-in action on an accepted
recommendation) - `verify_mailbox_dns` is self-scheduling (see `src/jobs/README.md`) once
`provision_mailbox` kicks it off.

## Env vars (grouped; see `.env.example` at the repo root for the authoritative full list)

Both `web` and `worker` load these from the process environment (`web`'s Next.js server and `worker`'s
`main.ts`); `NODE_ENV=production` is required on both in Railway (it also suppresses the dev-only
repo-root `.env` load in `worker`'s `src/main.ts`).

### Core (both services)
| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Same Postgres for both services. pg-boss creates its own `pgboss` schema on first boot. |
| `TOKEN_ENCRYPTION_KEY` | yes | 32-byte hex AES-256-GCM key (`openssl rand -hex 32`) - must be **identical** on both services (encrypts OAuth tokens and mailbox passwords). |
| `APP_URL` | yes | Public URL of `web` - used for OAuth redirect URIs and local-media URLs (`${APP_URL}/uploads/...`). |
| `NODE_ENV` | yes | `production`. |
| `PORT` | no | `web` defaults to `3000`, `worker` to `3001`; Railway injects its own `$PORT` and both apps read it. |

### Claude / Agent SDK (consumed by `@adv/agents`, used by `worker`'s four LLM job handlers plus `improve_app`)
| Var | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | All runtime + app-improvement agent calls. |
| `SUPERVISOR_MODEL` | no | Overrides the supervisor's model (default `claude-opus-5`); see `packages/agents/src/model-policy.ts`. Every other agent's model is fixed there, never overridable by env. |
| `AI_MONTHLY_BUDGET_USD` | no | Default per-business monthly cap when a business row doesn't set its own (`businesses.ai_monthly_budget_usd` defaults to 50). |
| `GITHUB_TOKEN` | only for `improve_app` (Phase 6b, opt-in) | A GitHub token (PAT or GitHub App installation token) with `contents:write` + `pull_requests:write` on the businesses' app repos. Embedded directly into the `git clone`/`push` URL by `src/jobs/improve_app.ts` - never logged. Without it, `improve_app` jobs fail cleanly (terminal, no retry) with a clear audit row. |

### Auth (Auth.js, `web` only)
| Var | Required | Notes |
|---|---|---|
| `AUTH_SECRET` | yes | Session signing secret. |
| `AUTH_EMAIL_FROM` | yes | From-address for magic-link login email. |

### Media storage (Cloudflare R2, both services - `@adv/media`)
| Var | Required | Notes |
|---|---|---|
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_BASE_URL` | recommended | When all three credential vars are set, `uploadMedia` uses R2; otherwise it falls back to `MEDIA_LOCAL_DIR` (default `apps/web/public/uploads`), which does **not** survive a redeploy or scale-out on Railway (ephemeral filesystem, `web`/`worker` are separate containers) - set R2 in any real deployment. |

### Business email (`worker` only - `@adv/email`, jobs `provision_mailbox`/`verify_mailbox_dns`)
| Var | Required | Notes |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ZONE_ID` | yes, for either provider | DNS record management; Cloudflare fronts the domain either way. |
| `EMAIL_PROVIDER` | yes, unless every `provision_mailbox` payload sets its own `provider` | `cloudflare_routing` \| `migadu` - default provider when the job payload doesn't override it. |
| `MIGADU_ADMIN_EMAIL` / `MIGADU_API_KEY` | only for the `migadu` provider | |
| `RESEND_API_KEY` | optional | Transactional email (magic links etc. via `@adv/email`'s `resend.ts`), independent of business mailboxes. |

Provisioning also requires the target business to have `businesses.domain` set (via the dashboard) -
`provision_mailbox` fails cleanly (terminal, no retry) otherwise.

### Product analytics (`worker` only - `@adv/analytics`, jobs `sync_product_analytics`, plus `run_product_advisor_all`'s fan-out)
| Var | Required | Notes |
|---|---|---|
| `POSTHOG_HOST` | yes | e.g. `https://us.posthog.com`. |
| `POSTHOG_PERSONAL_API_KEY` | yes | Used for HogQL queries, heatmaps, and project creation. |
| `POSTHOG_ORG_ID` | optional | When set, `ensureProject` can auto-create a PostHog project per business; without it, businesses need a project id supplied manually before `sync_product_analytics` has anything to sync (`businesses.posthog_project_id`). |

### Platform app credentials (`web` + `worker` - `@adv/connectors`; needed for the wizard, `publish_post`, `fetch_insights`, `refresh_tokens`)
Wave 1: `META_APP_ID` / `META_APP_SECRET` / `META_GRAPH_VERSION` / `META_LOGIN_CONFIG_ID`,
`THREADS_APP_ID` / `THREADS_APP_SECRET`, `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` /
`LINKEDIN_API_VERSION`, `TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME`, `DISCORD_BOT_TOKEN` /
`DISCORD_CLIENT_ID`.
Wave 2: `X_CLIENT_ID` / `X_CLIENT_SECRET`, `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`,
`TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`,
`PINTEREST_APP_ID` / `PINTEREST_APP_SECRET`. Bluesky needs no app credentials (per-account app password).
Each is only needed for the platforms actually in use; a connector with unset credentials fails its own
`authUrl`/`verify` calls rather than crashing the worker.

### Optional
| Var | Required | Notes |
|---|---|---|
| `LATE_API_KEY` | no | Aggregator fallback (feature flag). |
| `IMAGE_GEN_PROVIDER` / `IMAGE_GEN_API_KEY` | no | `none` \| `openai` \| `fal`, consumed by `@adv/media`. |

## First-run checklist

1. Provision the `postgres` service; copy its connection string to `DATABASE_URL` on `web` and `worker`.
2. Generate `TOKEN_ENCRYPTION_KEY` once (`openssl rand -hex 32`) and set the identical value on both
   `web` and `worker`.
3. Set the Core + Claude + Auth env var groups above on `web`; Core + Claude + business-email + product-
   analytics + platform-credential groups on `worker` (see the tables above for which service needs
   which group - most overlap, since both read the same `.env.example`).
4. Run `pnpm db:migrate` once against `DATABASE_URL` (Railway one-off command, or locally with the
   Railway connection string exported).
5. Deploy `worker` first. Check `GET /health` returns `{ "ok": true, "db": true, "boss": true }`, then
   check the boot logs for `worker: schedules registered` and confirm all seven `SCHEDULES` entries from
   the table above are listed (pg-boss's `schedule()` is idempotent - a redeploy just re-asserts the same
   cron rows).
6. Deploy `web`. Confirm the intake wizard can create a business and that OAuth connect flows for at
   least one platform (e.g. Bluesky, which needs no app credentials) complete end to end.
7. Confirm `publish_due_posts` is actually ticking: schedule a test post a minute out, watch it flip
   `scheduled → publishing → published` in the dashboard/DB.
8. Opt-in features - configure only when actually wanted:
   - Business mailboxes: set `EMAIL_PROVIDER` (or plan to pass `provider` per job) + the matching
     Cloudflare/Migadu credentials, and set `businesses.domain` per business before enqueueing
     `provision_mailbox`.
   - Product analytics: set `POSTHOG_*` and either set `POSTHOG_ORG_ID` for auto-provisioning or set
     `businesses.posthog_project_id` manually per business.
   - App-improvement PRs (`improve_app`): set `GITHUB_TOKEN` with write access to the relevant repos, and
     set `businesses.app_repo_url` per business. This job stays fully opt-in - nothing enqueues it
     automatically.

## Local equivalent

```
docker build -f apps/worker/Dockerfile -t adv-worker .
docker run --rm -p 3001:3001 --env-file .env -e NODE_ENV=production adv-worker
curl localhost:3001/health
```

Or without Docker, from the repo root: `pnpm -F @adv/worker build && pnpm -F @adv/worker start`.
