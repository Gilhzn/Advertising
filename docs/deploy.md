# Deploying to Railway

Each app ships a `railway.json` (`apps/web/railway.json`, `apps/worker/railway.json`) pointing Railway at its Dockerfile and `/health` endpoint. Create two services from this repo, set each service's **Root Directory** to the repo root and its **Config Path** to the app's `railway.json`.

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

## Verification

Run these locally before every deploy (same commands CI runs on push/PR, per `.github/workflows/ci.yml`
- `pnpm eval` and `pnpm -F @adv/web build` run there too; Playwright does not, see below). Needs
`docker compose up -d postgres` (or any reachable Postgres 16+) and `DATABASE_URL` /
`TOKEN_ENCRYPTION_KEY` / `APP_URL` set - the values in `.env.example` work for a local run.

```
pnpm install
pnpm db:migrate
pnpm lint                     # Biome, whole repo
pnpm typecheck                # tsc --noEmit, every package/app
pnpm test                     # Vitest, every package/app (needs the local Postgres)
pnpm eval                     # @adv/agents mock-mode evals against packages/agents/evals/cases/*.json
pnpm -F @adv/web build        # Next.js production build - catches build-time errors typecheck can miss
pnpm -F @adv/web e2e          # Playwright - not run in CI (needs browser binaries); run before
                               #   shipping anything touching the wizard, calendar/approvals, or OAuth
```

`pnpm test` includes `apps/worker/src/e2e-chain.test.ts`, which drives the real
`publish_due_posts -> publish_post -> fetch_insights` chain end to end against the local DB with a fake
connector (no real platform account needed) - this is the fastest local check that a scheduled post can
still make it all the way to `published` with metrics flowing back in.

### Post-deploy smoke test

Run after every deploy to `worker`/`web`, in order:

1. **Health endpoints**: `curl <worker-url>/health` and `curl <web-url>/api/health` (if present) - expect
   `{ "ok": true, "db": true, "boss": true }` from the worker. A `503` or connection failure means the DB
   or pg-boss did not come up; check the boot logs before doing anything else.
2. **Seed business discovery**: create (or reuse) one test business through the wizard and confirm
   `discover_business` produced a brand kit and an approved-pending channel plan (`brand_kits` /
   `channel_plans` rows, or the dashboard's onboarding screen showing them) - this exercises the
   Claude/Agent SDK path end to end against real credentials, which nothing in CI does.
3. **A Bluesky test post**: connect a real (or throwaway) Bluesky account via the wizard (needs no app
   credentials, only an app password), schedule one post a minute out, and watch it flip
   `scheduled -> publishing -> published` in the dashboard or `SELECT status FROM posts WHERE id = ...` -
   confirms `publish_due_posts`/`publish_post` and the Bluesky connector work against the real API, not
   just the fake connector in `e2e-chain.test.ts`.
4. **Mailbox DNS**: for a business with `businesses.domain` set, enqueue `provision_mailbox` (or trigger
   it from the dashboard) and confirm the mailbox moves `pending_dns -> provisioning -> active` (or its
   DNS records show as verified) - confirms the Cloudflare/Migadu credentials and `verify_mailbox_dns`'s
   self-rescheduling are both working in this environment.

## Worker as a GitHub Actions tick

The always-on Railway `worker` above is one way to run the background side of this app. The other -
useful when you do not want to pay for (or babysit) a 24/7 container - is `.github/workflows/worker-tick.yml`:
a scheduled GitHub Actions job that runs `apps/worker` as a short-lived **tick** every 10 minutes against
a remote Postgres (e.g. Neon), and then exits. This repo is public, so Actions minutes are free.

`docs/deploy-vercel.md` is the end-to-end walkthrough of that setup (Vercel dashboard + Neon + this
workflow, with the exact secrets to paste where); this section is the reference for how the tick itself
behaves and why.

```
every 10 min   ┌──────────────────────────────────────────────┐
GitHub cron ──▶ │ checkout → install → build → db:migrate →    │ ──▶ exits
                │ pnpm -F @adv/worker tick:built               │
                └───────────────────┬──────────────────────────┘
                                    │ pg-boss queues + `worker_state`
                                    ▼
                          Neon Postgres (unpooled URL)
```

### What a tick does (and how it fakes having been running all along)

`apps/worker/src/tick.ts` is the same worker as `main.ts` - same connectors, same
`REGISTRATIONS` table (`apps/worker/src/registrations.ts`), same handlers - with three differences:

1. **No HTTP `/health` server.** Nothing would poll it; the workflow run's own status is the health signal.
2. **No `boss.schedule(...)`.** pg-boss's cron clock only advances while a process is alive, which a tick
   is not. Instead it calls `enqueueMissedSchedules` (`apps/worker/src/lib/catch-up-schedules.ts`): for
   each entry in `SCHEDULES` it computes with `cron-parser` the most recent occurrence at or before now,
   compares it to `worker_state.value->>'lastFiredAt'` under the key `schedule:<job name>`, and enqueues
   the job once (`singletonKey = <job name>`, empty payload) if the cron came due since the last tick -
   then records that occurrence. A chain of ticks therefore fires every occurrence exactly once, even
   when GitHub's scheduler delays a run. Leftover `pgboss.schedule` rows from a previous always-on worker
   are harmless: nothing fires them unless a process is running pg-boss's timekeeper.
   - **First run ever** (empty `worker_state`): `publish_due_posts` and `refresh_tokens` always run;
     every other schedule records its last occurrence and only runs it if it is within the last 24h, so a
     fresh install does not burst a week of daily/weekly jobs at once.
3. **It drains and exits.** After registering the handlers it polls every 5s for runnable + active jobs
   across our queues and exits when they have been zero for 30 consecutive seconds, or when
   `TICK_MAX_MINUTES` (default 20) elapses - in which case it logs how many jobs are left for the next
   tick. Either way it stops pg-boss **gracefully** (a bounded wait, so a handler is never killed
   mid-publish) and exits 0; exit 1 is reserved for a boot failure. Jobs deliberately deferred into the
   future (retry backoff, `verify_mailbox_dns` re-enqueueing itself 10 minutes out) never hold a tick
   open - the next tick picks them up.

Every run ends with one summary line, e.g.:

```
worker tick: done (max_minutes) in 12s
  {"exitReason":"max_minutes","durationMs":12001,
   "processed":{"refresh_tokens":1,"publish_due_posts":2,"publish_post":9},
   "failed":{},"scheduled":["publish_due_posts","fetch_insights","refresh_tokens"],
   "remaining":0,"deferred":0}
```

Run one locally against your own DB (no Actions needed): `TICK_MAX_MINUTES=0.2 pnpm -F @adv/worker tick`.

### Cadence and the trade-off vs. the always-on worker

| | Always-on worker (Railway) | GitHub Actions tick |
|---|---|---|
| `publish_due_posts` latency | ~1 minute (its cron) | up to ~10-12 minutes (tick cadence + boot) |
| Cost | a 24/7 container | free on a public repo |
| Long jobs | unbounded | must fit `TICK_MAX_MINUTES` (20) or resume next tick |
| Reliability | pg-boss's own clock | GitHub's scheduler is best-effort and can delay or (rarely) skip a run; the catch-up logic makes a late tick harmless, and `workflow_dispatch` is the manual escape hatch |
| `/health` | yes | no - watch the Actions run history instead |

A post scheduled for 10:03 publishes at the next tick (~10:10), not at 10:03. If minute-level punctuality
matters, run the always-on worker; otherwise the tick is the cheaper deployment. Do **not** run both
against the same database expecting them to share work fairly - they can coexist safely (pg-boss's
`FOR UPDATE SKIP LOCKED` fetch plus this repo's own claim patterns prevent double-processing), but the
always-on worker's pg-boss clock and the tick's `worker_state` clock would then both fire the crons, which
only wastes a few no-op runs but is pointless. Pick one.

### Secrets and the guard step

The workflow maps repository secrets into env and then **guards** on them in bash: a step with
`id: guard` sets `enabled=true` only when both `DATABASE_URL` and `ANTHROPIC_API_KEY` are non-empty, and
every following step is `if: steps.guard.outputs.enabled == 'true'`. A fork, or this repo before anyone
configured it, therefore gets a green run that prints:

```
worker tick skipped: add DATABASE_URL and ANTHROPIC_API_KEY as repository secrets (see docs/deploy-vercel.md)
```

Set the secrets under **Settings → Secrets and variables → Actions**. The names match the env vars
documented in the tables above, with two exceptions:

- **`APP_REPO_GITHUB_TOKEN`** → exposed to the job as `GITHUB_TOKEN`. The `improve_app` job reads
  `GITHUB_TOKEN`, but GitHub Actions reserves `secrets.GITHUB_TOKEN` for its own automatic, repo-scoped
  token (which cannot reach a user's app repo), so the real PAT must be stored under a different secret
  name and re-exported. Only needed if you use `improve_app`.
- **`TICK_MAX_MINUTES`** is set in the workflow itself (`"20"`), not a secret.

Required: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `TOKEN_ENCRYPTION_KEY`, `APP_URL`. Everything else
(`R2_*`, `BLOB_READ_WRITE_TOKEN`, `CLOUDFLARE_*`, `EMAIL_PROVIDER`, `MIGADU_*`, `RESEND_API_KEY`,
`POSTHOG_*`, the per-platform app credentials, `LATE_API_KEY`, `IMAGE_GEN_*`, `SUPERVISOR_MODEL`,
`AI_MONTHLY_BUDGET_USD`) is optional and only unlocks the jobs that need it - an unset credential makes
that one connector/job fail cleanly, never the tick.

`NODE_ENV=production` is set on the tick step only, not job-wide: `pnpm install --frozen-lockfile` with
`NODE_ENV=production` skips devDependencies, which the build (typescript, turbo, tsx) needs.

### Triggering a tick manually

**Actions → Worker tick → Run workflow** (the `workflow_dispatch` trigger). Useful right after setting
the secrets, after a migration, or to flush a backlog without waiting for the next 10-minute slot.
`concurrency: { group: worker-tick, cancel-in-progress: false }` means a manual run queues behind an
in-flight tick instead of cancelling it mid-publish.

### Neon note: use the unpooled connection string

Point `DATABASE_URL` at Neon's **unpooled** (direct) connection string - the one without `-pooler` in the
host - for both the worker/tick and `pnpm db:migrate`. pg-boss relies on session-level state (advisory
locks, `LISTEN/NOTIFY`, temporary tables during its schema migration) that PgBouncer's transaction pooling
breaks, and Drizzle's migrator runs DDL in a session transaction. The pooled URL is fine for `apps/web`'s
short request-scoped queries. Neon's free tier also auto-suspends an idle database: the first query of a
tick may take a few seconds to wake it, which is well inside the tick's budget but is why a tick's
duration varies.
