# Worker job contracts

Every job name, payload schema and cron schedule lives in `packages/jobs/src/index.ts` (`JOBS`,
`SCHEDULES`) — that file is the single source of truth shared with `apps/web` (which enqueues jobs).
Handlers here only validate against it and implement it; they never redefine a payload shape.

All handlers are registered in `apps/worker/src/main.ts` via `boss.work(name, options, handler)`. Every
handler receives a **batch** (`Job<Payload>[]`) even when `batchSize` is 1 — pg-boss always calls the
work handler with an array — so every handler loops over `jobs`.

## General rules

- **Validate**: re-`parse()` the payload with `JOBS[name]` inside the handler (defense in depth — the
  producer already validated it, but a handler must never trust an untyped `job.data`).
- **Log**: use `@adv/shared`'s `logger.child({ jobId, jobName, businessId? })` — never log secrets
  (tokens, mailbox passwords).
- **Audit**: write an `audit_log` row (`src/lib/audit.ts` → `writeAudit`) for anything that changes
  business-visible state (a post published, a business discovered, a job permanently failed). Audit
  writes never throw — a logging failure must not fail the job.
- **Idempotency**: every job here is safe to run twice for the same input. See per-job notes below.
- **Retries**: jobs enqueued via `@adv/jobs`'s `enqueue()` default to `retryLimit: 3` with
  `retryBackoff: true`. A handler that wants pg-boss to retry must `throw`; a handler that decides a
  failure is terminal must persist that verdict itself (e.g. `posts.status = 'failed'`) and return
  normally so pg-boss does not also retry a job whose outcome is already recorded.

## Per-job contracts

### `discover_business`, `generate_content_batch`, `run_analyst`, `run_product_advisor`

Thin wrappers (`src/lib/agent-job.ts`) around the corresponding `@adv/agents` entry point (imported via
`src/agents-shim.ts`, which throws a clear "not available" error if `@adv/agents` has not exported the
function yet — expected while that package is built out concurrently). On success or failure they write
one `audit_log` row (`<job>.completed` / `<job>.failed`) and re-throw on failure so pg-boss retries.
Idempotency is the agent's responsibility (each run persists a new `agent_runs` row / brand kit version
/ content batch; re-running is "generate another version", not "duplicate a resource").

### `publish_due_posts` (cron: every minute)

Atomically claims up to 50 due posts (`status IN ('approved','scheduled') AND scheduled_at <= now()`)
by flipping them to `status = 'publishing'` with a single
`UPDATE ... WHERE status IN (...) RETURNING id` guarded by `FOR UPDATE SKIP LOCKED`, so two overlapping
runs (a slow tick plus the next minute's tick) can never claim the same post. It then enqueues one
`publish_post` job per claimed post with `singletonKey = postId`, so even if this handler were somehow
invoked twice for the same claimed row, only one `publish_post` job is created.

### `publish_post`

Loads the post fresh from the DB (never trusts stale data from the caller beyond `postId`):

1. **Idempotent skip**: `status === 'published' && externalId` → done, no-op.
2. **Approval gate**: refuses (sets `status = 'failed'`, `lastError`, writes `publish_post.refused` to
   the audit log, returns without throwing — this is a permanent business-logic refusal, not a
   transient error) unless `status` is one of `approved | scheduled | publishing`. This is the one
   place a community post's human-approval requirement (CLAUDE.md hard constraint) is enforced right
   before publish, regardless of how the job was reached.
3. **Claim**: if not already `publishing` (i.e. this job was enqueued directly rather than via
   `publish_due_posts`), atomically claims it itself with the same `UPDATE ... WHERE status IN (...)`
   pattern. Loses the race silently (another worker got there first) rather than erroring.
2. Loads the account + decrypted tokens (`src/lib/accounts.ts`). Refuses (same terminal-failure path)
   if the account is missing or not `connected`.
4. Refreshes the token first if `isExpiringSoon(tokens)` and `connector.refresh` exists, persisting the
   re-encrypted tokens before publishing.
5. Applies a per-account rate limit (`src/lib/limiter.ts`, keyed by `account.id`, using
   `connector.rateLimit`). If over limit, re-enqueues the *same* `publish_post` job with
   `startAfter = now + waitMs` and `singletonKey = postId`, then returns — it does **not** mark the post
   failed or increment attempts; the post stays `publishing` until the retry actually runs.
6. Calls `connector.publish`. On success: `status = 'published'`, `publishedAt`, `externalId`,
   `externalUrl`; if `result.visibility === 'private'` (TikTok/YouTube/Pinterest pre-audit), merges a
   `visibility: 'private'` note into `compliance` so the dashboard can show it.
7. On `ConnectorError`:
   - `retryable === true`: increments `posts.attempts`, writes `publish_post.retry` to the audit log,
     and **throws** so pg-boss retries per the queue's `retryLimit` (3, with backoff).
   - otherwise (including any non-`ConnectorError` exception): marks the post `failed` with
     `lastError` and does not throw — a bug or a permanent rejection should not retry forever.

### `fetch_insights` (cron: every 6h; optionally scoped to one `businessId`)

For every **owned** (`ownership = 'owned'`), `connected` account whose connector reports
`capabilities.insights`, refreshes an expiring token, then calls
`connector.fetchInsights(account, since, publishedPosts)` where `since` is `lastSyncedAt` (falling back
to 7 days ago) and `publishedPosts` is every already-published post on that account with its
`externalId`. Each returned snapshot is inserted into `metric_snapshots`, mapping `externalPostId` back
to the internal `postId` when present. `lastSyncedAt` is only advanced after a successful fetch. Each
account is wrapped in its own `try/catch` so one connector/account failure never stops the batch — the
error is logged and the loop continues.

### `refresh_tokens` (cron: every 12h)

Refreshes every `connected` account whose token `expiresAt` is within the next 24h and whose connector
implements `refresh`. Per-account `try/catch`, same as `fetch_insights`.

### `sync_product_analytics`, `provision_mailbox`, `verify_mailbox_dns`, `improve_app`

Not implemented in this phase (owned by `packages/analytics`, `packages/email`, and the app-improvement
coding agent respectively, none of which exist yet). Each handler validates its payload, logs a
`"<job>: not implemented in this phase"` line, writes a `<job>.skipped` audit row, and completes
successfully — this keeps `sync_product_analytics`'s cron schedule from accumulating retries and keeps
anything that enqueues the other three from hanging forever.
