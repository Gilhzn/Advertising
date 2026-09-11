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
function yet — expected while that package is built out concurrently). `runAgentJob` writes one
`audit_log` row per outcome:

- success → `<job>.completed`.
- `BudgetExceededError` (the business has spent its `businesses.ai_monthly_budget_usd` for the month,
  thrown by `@adv/agents`'s `assertMonthlyBudget` before any tokens are spent) → `<job>.budget_exceeded`,
  and the handler returns **without throwing** — this is an expected, terminal business condition, not a
  transient failure, so pg-boss must not retry it (retrying would just hit the same cap again).
- any other error → `<job>.failed`, and re-throws so pg-boss retries per the queue's `retryLimit`.

Idempotency is the agent's responsibility (each run persists a new `agent_runs` row / brand kit version
/ content batch; re-running is "generate another version", not "duplicate a resource").

`run_analyst` additionally snapshots `businesses.weights` before and after the run; if the analyst
changed it, it enqueues `discover_business` with `reason: "replan"` so the strategist re-plans channels
against the newly-learned weights. No change is made when weights are unchanged (the common case).

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
3. **Claim**: when the payload carries `claimedBy: "scheduler"` and the row is `publishing`, the
   atomic claim already happened in `publish_due_posts`. Otherwise the job claims here with
   `UPDATE ... WHERE status IN ('approved','scheduled') OR (status = 'publishing' AND updated_at older
   than 10 minutes) RETURNING id` (the stale-lease clause recovers posts from a crashed worker). Loses
   the race silently (another worker got there first) rather than erroring.
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
implements `refresh`/`refreshForAccount`. Per-account `try/catch`, same as `fetch_insights`. This is
platform-generic: an account on a `capabilities.privateUntilReview` platform (TikTok/YouTube/Pinterest
pre-audit) is refreshed exactly the same as any other connected account — private-until-review only
affects what `publish_post` does with the resulting post, not token refresh.

### `run_analyst_all` (cron: Monday 05:00 UTC)

Fans out one `run_analyst` job (`singletonKey = businessId`) per business with at least one `published`
post — a business with nothing published yet has no metrics for the analyst to learn from.

### `run_product_advisor_all` (cron: Monday 05:30 UTC)

Fans out one `run_product_advisor` job (`singletonKey = businessId`) per business with a linked PostHog
project (`businesses.posthog_project_id is not null`) — the product advisor has nothing to read
otherwise.

### `content_autopilot` (cron: daily 04:00 UTC)

For every business with an **approved** channel plan (`channel_plans.approved_at is not null`) and at
least one **connected** platform account, counts posts already on the calendar for the next 7 days
(`status IN ('scheduled','approved','publishing','published')`); if fewer than 3, enqueues
`generate_content_batch` with `singletonKey = businessId` so a still-running batch from a previous day
is never duplicated.

### `sync_product_analytics` (cron: daily 03:30 UTC; optionally scoped to one `businessId`)

Calls `@adv/analytics`'s `syncProductAnalytics` for the payload's `businessId`, or — on the cron run —
for every business with a linked PostHog project. Each business runs in its own `try/catch` (writes
`sync_product_analytics.synced` / `.skipped` / `.failed`) so one bad project never stops the batch, and
the handler itself never throws (keeps the cron schedule from accumulating retries).

### `provision_mailbox`

Calls `@adv/email`'s `provisionMailbox` (Cloudflare Email Routing or Migadu, chosen by `payload.provider`
or the `EMAIL_PROVIDER` env var) using `businesses.domain`. Terminal, non-retrying skips (logged +
audited as `.failed`, no throw) when the business is missing, has no `domain`, or no provider is
configured. On any other failure: retries only when `EmailProviderError.retryable` is `true` (a
transient network blip) — `provisionMailbox` itself already persisted the mailbox row as `status:
'error'` for anything else, so re-running would just fail identically. On success (`status !== 'error'`),
enqueues `verify_mailbox_dns` with `startAfter = now + 2min` so DNS propagation gets a moment first.

### `verify_mailbox_dns`

Calls `@adv/email`'s `verifyMailboxDns` to re-resolve live DNS against the mailbox's stored required
records. While the result is `pending_dns` and the mailbox row is under 48h old (`mailboxes.created_at`),
re-enqueues itself 10 minutes out (`singletonKey = mailboxId`); past 48h it gives up and leaves the
mailbox `pending_dns` for a human to chase (`verify_mailbox_dns.timed_out` audit row).

### `improve_app` (Phase 6b, opt-in)

Given an **accepted** recommendation, clones `businesses.app_repo_url` (needs `GITHUB_TOKEN`; the token
is embedded in the clone/push URL and never logged — errors from git commands are redacted before being
logged or stored), runs a *separate* Agent SDK `query()` (model: `MODEL_POLICY.appImprover`, `cwd` = the
clone dir, `allowedTools: ["Read","Edit","Write","Glob","Grep","Bash"]`,
`maxBudgetUsd: JOB_BUDGETS_USD.improve_app`) instructed to implement the smallest change addressing the
recommendation, run the repo's existing tests, and write `PR_BODY.md`. Records its own `agent_runs` row
directly (the shared `@adv/agents` `runAgentJob` hardcodes `disallowedTools: ["Bash","Write","Edit",...]`
for runtime marketing agents, which is the opposite of what this job needs).

Guards, matching CLAUDE.md's hard constraint ("the app-improvement agent only opens PRs; never pushes to
a user's repo"):

- Aborts with no PR when the agent produced no diff (`git status --porcelain` empty) —
  `improve_app.no_changes` audit row.
- `assertPushableBranch` refuses to push if the target branch (`adv/<recommendation-id-short>`) is ever
  equal to the repo's default branch.
- Only ever pushes the new branch and opens a PR (`POST /repos/{owner}/{repo}/pulls`) - never merges,
  never pushes to `base`.

On success: `recommendations.pr_url` + `status = 'implemented'`. The pure parts (repo URL parsing, clone
URL/branch naming, PR body assembly, the default-branch guard) are unit-tested directly; the git/SDK/
GitHub-API orchestration is exercised only by typecheck (no network/SDK calls happen in tests).
