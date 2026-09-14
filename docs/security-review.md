# Security review v1 — 2026-09-11

> Superseded in part by [v2 below](#security-review-v2--2026-09-14). Every v1 finding was re-verified in round two and all 24 still hold.

Scope: OAuth flows, token storage, agent tool surface (SSRF, scoping, approval bypass), server actions, worker jobs, secrets/config, dependencies. Reviewed at commit `14da8d5`; fixes landed in the commits that follow. `pnpm audit --prod`: no known vulnerabilities.

## Findings and status

| ID | Sev | Finding | Status |
|---|---|---|---|
| H1 | high | Unrestricted image upload written into the web app's public dir (stored XSS on app origin) | **fixed** — MIME + magic-byte allowlist, 5 MB cap, extension from allowlist, stored via `@adv/media` (`apps/web/src/lib/uploads.ts`); CSP + nosniff headers |
| H2 | high | SSRF via user-supplied Bluesky `service` URL, response reflected | **fixed** — `normalizeService` + `assertPublicUrl` (`packages/connectors/src/net-guard.ts`) |
| H3 | high | Agent-controlled media URL fetched server-side without SSRF guard | **fixed** — `downloadMedia` validates host, manual redirects re-validated per hop (`packages/connectors/src/http.ts`) |
| H4 | high | `reschedulePostAction` could resurrect rejected / awaiting-approval posts | **fixed** — status guard in `apps/web/src/lib/actions/content.ts` |
| M1 | med | OAuth `state` not bound to the browser session; callback unauthenticated | **fixed** — `oauth_states.user_id`, `oauth_state` cookie, session + owner check on callback |
| M2 | med | `consumeOAuthState` not atomic | **fixed** — single `DELETE … RETURNING` |
| M3 | med | `redirect_uri` fell back to request origin | **fixed** — `APP_URL` required |
| M4 | med | PKCE plumbing unused | **fixed** — real `generateCodeVerifier`; X/Reddit connectors use S256 |
| M5 | med | DNS-rebinding TOCTOU in `safeFetch` | **fixed** — connection pinned to the validated address via undici dispatcher, re-pinned per hop |
| M6 | med | Provider error text reflected into redirect URL | **fixed** — fixed error codes only |
| M7 | med | No record of who approved a community post | **fixed** — `posts.approved_by/approved_at`; worker refuses community posts without it |
| M8 | med | Monthly budget read-then-run; failed runs at $0 | **fixed** — reservation up front in `agent_runs`, reconciled at end |
| M9 | med | Double-publish window (`publishNow` without singleton key; `publishing` skipped the claim) | **fixed** — singleton key; atomic lease claim with 10-minute stale takeover |
| M10 | med | `last_error` persisted without redaction | **fixed** — `redactSecrets` / `redactDeep` from `@adv/shared` at every storage boundary |
| M11 | med | Runtime agents could `Read`/`WebFetch` if a job omitted `tools` | **fixed** — deny list covers Read/Glob/Grep/WebFetch/Bash family |
| L1 | low | Dev login gated only by `NODE_ENV` | **fixed** — also requires `ENABLE_DEV_LOGIN=1` |
| L2 | low | No security headers | **fixed** — CSP, nosniff, frame deny, referrer policy, HSTS in prod |
| L3 | low | Post body edit bypassed length/compliance | **fixed** — Zod + maxChars, resets to draft |
| L4 | low | `oauth_states` never GC'd | **fixed** — expired rows deleted on each start |
| L5 | low | Scheduled jobs without handlers | **fixed** — handlers registered |
| L6 | low | Uploads path not writable in container | **fixed** — explicit `MEDIA_LOCAL_DIR`, Dockerfile creates dir |
| L7 | low | Whole `platform_accounts` rows (incl. `config`) reached client components | **fixed** — projected columns; Discord webhook only in encrypted token store |
| L8 | low | Direct API calls not budget-gated | **fixed** — `assertMonthlyBudget` in `classify` / `complianceCheck` |
| L9 | low | Stub handlers logged payloads | **fixed** — stubs removed |
| L10 | info | `improve_app` guidance | **implemented** — PR-only, default-branch guard, token never logged |

## Passes cleanly
AES-256-GCM token encryption with per-call IV; tokens decrypted only in the worker; connector HTTP layer redacts URLs/headers; every agent tool scoped by `businessId`; community approval enforced in tool, hook and worker; Zod on every tool/job/action input; ownership checks on every page and action; no HTML sinks; cascade deletes; no secrets in images or `NEXT_PUBLIC_*`.

## Known limits
- The Bluesky/Meta/LinkedIn providers do not support PKCE; X/Reddit/Google do.
- ~~Test mode (`NODE_ENV=test`) skips DNS resolution~~ — closed in v2 (SL-09): the skip is now opt-in via `ADV_NET_GUARD_ALLOW_UNRESOLVABLE=1`, set only by the connectors' vitest config.

---

# Security review v2 — 2026-09-14

Second full pass, prompted by a Dependabot alert the owner saw on a *different* repository. Three parallel deep audits (secret leakage; web surface; backend/agents/connectors), each finding verified in the code before anything was changed. Reviewed at `7a52d62`; fixes landed in `09dfea2`, `0b86000`, `cd7de9b` and the commit carrying this file.

The repository is **public**, which raises the stakes on every leak and every supply-chain vector — that framing drove the prioritisation below.

## Dependencies

| ID | Sev | Finding | Status |
|---|---|---|---|
| D1 | — | `js-yaml` (CVE-2026-59869, the alert in the screenshot) | **not applicable** — not in this project's dependency tree at all |
| D2 | med (dev) | `esbuild <=0.24.2` via `drizzle-kit > @esbuild-kit/*` (GHSA-67mh-4wv8-2f99) | **fixed** — `pnpm.overrides` pins `esbuild ^0.25.0` |
| D3 | med (dev) | `vitest`/`@vitest/mocker 3.2.7` path traversal (GHSA-82fw-gwwq-j7x9) | **fixed** — upgraded to 4.1.11 across all 11 packages; full suite still green |

`pnpm audit` is clean in both `--prod` and dev trees.

## Supply chain / repository

| ID | Sev | Finding | Status |
|---|---|---|---|
| H1 | high | `.claude/settings.json` committed a `SessionStart` hook running `scripts/session-start.sh` — anyone opening the public repo in Claude Code, or a maintainer checking out a PR branch, executed it before a human read the diff. The script also ran `pnpm install`, which runs package postinstall scripts. | **fixed** — no automatic `pnpm install`; documented in `SECURITY.md`; `.github/CODEOWNERS` gates `/.claude/`, `/scripts/`, `/.github/`, lockfiles, crypto, auth and agent hooks |
| H2 | low | The same script created Postgres with `initdb -A trust` and a `SUPERUSER` role | **fixed** — `scram-sha-256`, `CREATEDB` instead of `SUPERUSER`, early exit when not root |
| I1 | info | Early in the build session I generated an `AUTH_SECRET` and `TOKEN_ENCRYPTION_KEY` and printed them in chat | **no action needed** — the owner confirmed they were never used. The practice is called out in `SECURITY.md`: generate secrets locally, never use a chat-generated one |

## Secret leakage

| ID | Sev | Finding | Status |
|---|---|---|---|
| SL-01 | high | The agents' `PostToolUse` audit hook wrote raw tool input to `audit_log` without `redactDeep` (`packages/agents/src/hooks.ts`) | **fixed** — `redactDeep`, matching the worker's `writeAudit` |
| SL-02 | high | Every **prefixed** credential key escaped redaction: `\b` cannot match between a word character and `_`, so `app_password=`, `user_access_token=`, `MIGADU_API_KEY=`, `X_CLIENT_SECRET=` and `OWNER_PASSWORD=` all reached `posts.last_error`, `platform_accounts.last_error` and `audit_log.payload` in the clear. Confirmed empirically against the built module. | **fixed** — negative-lookbehind anchor over the identifier class; also added AWS key ids, PEM blocks (whole and truncated), all-uppercase base32 secrets, and `/` inside userinfo passwords. 43 tests, including every confirmed bypass string |
| SL-03 | high | `packages/email/src/http.ts` embedded 300 raw characters of a provider response into errors stored in `mailboxes.last_error` and rendered in the dashboard | **fixed** — `redactSecrets` before truncation, with a test for a credential echoed back in an error body |
| SL-04 | med | Connection-string passwords (`postgres://user:pass@host`) matched no rule | **fixed** in `7a52d62` — URL-userinfo and JWT rules |
| SL-09 | low | `net-guard`'s `NODE_ENV=test` DNS skip failed **open** | **fixed** — opt-in `ADV_NET_GUARD_ALLOW_UNRESOLVABLE=1`, set only by the test config |

Verified clean: git history exhaustively (no secret was ever committed, on any branch); `oauth_tokens`, `mailboxes.password_enc` and `platform_accounts.config` never cross to the browser; the full egress inventory; and both workflows' fork-PR safety (a fork PR cannot reach repository secrets).

## Web surface

| ID | Sev | Finding | Status |
|---|---|---|---|
| W-1 | high | The login rate limiter's key was declared as a **credential** and read from the POST body, so a client posting straight to `/api/auth/callback/credentials` could send a fresh random `ip` per attempt — each landing in its own empty bucket. An unlimited password oracle against one known account. | **fixed** — key derived from request headers (`x-real-ip`, else the *rightmost* `x-forwarded-for` hop); plus an address-independent global ceiling so IP rotation buys nothing |
| W-2 | med | `email === ownerEmail && verifyPassword(...)` short-circuits — a wrong email skipped scrypt and answered ~53 ms sooner, revealing which address is the owner | **fixed** — `verifyOwnerCredentials` always does both halves; covered by a timing test |
| W-3 | med | The plaintext-`OWNER_PASSWORD` path hashed the stored value on *every* attempt, doubling the scrypt work an unauthenticated request could force | **fixed** — expected side derived once and cached |
| W-4 | med | `updateBrandKitAction` wrote a client-supplied `BrandKit` (a bound server-action argument) into `brand_kits.data` unvalidated — a store the strategist and copywriter read back into prompts | **fixed** — `BrandKitSchema` before and after the merge |
| W-5 | med | `getBusinessBySlug` looked up the slug **globally** and filtered by `userId` afterwards, but the unique index is `(user_id, slug)` — anyone could squat a slug and 404 the rightful owner out of their own dashboard | **fixed** — scoped in the query |
| W-6 | med | The product page resolved PostHog `utm_campaign` values with an unscoped `getPost()`; those values are strings a third party can put into the analytics stream, so another tenant's post title and body could render | **fixed** — `getPostForBusiness`, which also rejects non-UUIDs |

All nine previously-fixed web items re-verified as holding.

## Backend, agents and connectors

| ID | Sev | Finding | Status |
|---|---|---|---|
| F1 | **critical** | `improve_app`'s coding agent runs with `Bash` and `bypassPermissions` and **no `env` was passed**, so the spawned CLI inherited the entire worker environment — `GITHUB_TOKEN`, `TOKEN_ENCRYPTION_KEY`, `DATABASE_URL`, `CLOUDFLARE_API_TOKEN`, `R2_*`, `LATE_API_KEY`. One `env` call exfiltrates all of it. Separately the PAT was embedded in the clone URL, so `git clone` wrote it into `.git/config` **inside the agent's own cwd** — the agent could read it and push to `main` itself, making `assertPushableBranch` decorative. | **fixed** — explicit six-variable environment; credentials supplied per-invocation via `http.extraHeader` and never written to disk; `disallowedTools` for network tools; the recommendation body fenced as untrusted content with the sentinel stripped |
| F2 | high | `net-guard.isBlockedIp` classified IPv6 by **string prefix** and matched IPv4-mapped addresses only in dotted-quad form, so `https://[::ffff:a9fe:a9fe]/` — 169.254.169.254, the cloud metadata endpoint — passed. WHATWG `URL` normalises the readable spelling *into* that hex form, so both escaped. Demonstrated live. | **fixed** — the correct classifier (which already existed in the agents' guard) moved to `@adv/shared/ip-guard`; both guards now call the one copy. `::ffff:0:0/96` closed as hardening |
| F3 | high | `downloadMedia` validated the host then called bare `fetch()`, which re-resolves the name — a 0-TTL rebinding host wins that race | **fixed** — fetches through a dispatcher pinned to the validated address, on the first request and every redirect hop |
| F4 | med | `check_compliance` was enforced by **prompt only**: the verdict was selected in `schedulingDecision` and never read, and the only compliance gate was `status === "rejected"`, which `check_compliance` sets itself — so `create_post_draft → schedule_post` produced an approved post | **fixed** — the verdict is a precondition for scheduling; `publish_post` refuses a post with no verdict unless a human recorded an approval |
| F5 | med | `claimedBy === "scheduler" && status === "publishing"` stays true on **every pg-boss retry**, so a worker killed after the platform accepted a post retried, skipped both the claim and the stale-lease check, and published twice — the `externalId` idempotency guard could not help because that write never landed. Separately, a DB error after a successful publish marked the post `failed`, inviting a human to retry a live post. | **fixed** — single-use `claim_token` consumed by the statement that verifies it; stranded `publishing` rows re-claimed once stale; no failure path marks a post `failed` after `connector.publish()` resolved |
| F6 | med | `improve_app` — the most expensive job — never called `assertMonthlyBudget` and inserted its `agent_runs` row directly, so it neither respected the per-business cap nor reserved against it. The reservation itself was read-then-insert, letting N concurrent runs each reserve the full remaining budget. | **fixed** — `reserveAgentRun`, one transaction taking `FOR UPDATE` on the business row; `improve_app` uses it |
| F7 | med | Bluesky re-read `config.pdsUrl` at publish/refresh with no re-validation; only the connect path was guarded, and `config` is mutable through `mergeAccountConfig` | **fixed** — validated on every read |
| F8 | med | Generated PostHog snippets enabled session replay with `maskAllInputs: false`. Businesses paste these into their own apps, so **their** users' passwords, emails and card numbers were recorded into a PostHog project the operator controls. | **fixed** — masking on by default in all four snippets, with a note explaining why |
| F9 | low-med | `PGBOSS_SCHEDULE=off` in the always-on worker silently stopped all cron while still logging "schedules registered" and keeping `/health` green | **fixed** — the always-on worker refuses to boot with it set |
| F10 | low-med | `externalUrl` (from a third-party API) and pasted `profileUrl` were stored unvalidated and rendered as `href`; `new URL()` parses `javascript:` happily | **fixed** — `safeHttpUrl` scheme filter at both storage boundaries |
| F11 | low | See SL-01 | **fixed** |
| F12 | low | `provisionMailbox` only required the domain be *some* zone in the operator's Cloudflare account — nothing bound it to the requesting business | **fixed** — must match the domain recorded on the business (or a subdomain of it) |
| F13 | low | `communityRef` passed the community **UUID** where connectors expect the platform name (`sr:` on Reddit) — every community publish aimed at a destination that does not exist | **fixed** — resolves the name, scoped to the business |
| F14 | info | `TOKEN_ENCRYPTION_KEY` rotation was unrecoverable: no key id, no re-encrypt path, and the failure surfaced as an opaque throw from `loadAccount` | **fixed** — `TOKEN_ENCRYPTION_KEY_PREVIOUS` is accepted on decrypt; the key format is validated as hex so a malformed value names the variable at fault |

Also hardened: `fetch_url` output is fenced in an `<untrusted-content>` envelope with the sentinel stripped — it is the one tool that puts arbitrary third-party text into the model's context, and the rule against obeying it lived only in the system prompt.

Verified clean in this round: every engine tool scopes on `ctx.businessId` (closed over at construction, so no argument can cross the tenant boundary); community approval holds at all three enforcement points and could not be bypassed via tool arguments, ordering or repetition; `RUNTIME_DISALLOWED_TOOLS` applies unconditionally with `settingSources: []`; every job payload is Zod-parsed on enqueue *and* in the handler; AES-256-GCM with a fresh IV per encryption and no ciphertext in any error; no connector puts a credential in a URL we invented; Cloudflare DNS writes are generated, never user-supplied; and no server-side PostHog `capture()` exists anywhere.

## Not fixed (accepted, with reasons)

- **The login rate limiter is per-process and in-memory.** On Vercel each function instance keeps its own counters, so the effective ceiling scales with instance count. Fixing it properly needs shared state (Redis/Upstash or a DB table). The global ceiling added in W-1 narrows it substantially; a durable limiter is the right follow-up if this ever serves more than one owner.
- **A Late-routed publish ships the post body and media URLs to getlate.dev.** That is the documented purpose of that connector, enabled only when the operator sets `LATE_API_KEY`.
- **`posthogProjectToken` is stored in plaintext.** It is a public client token by design — it ships inside the snippet the business pastes into their own site.
- **No re-encrypt script for a key rotation yet.** `TOKEN_ENCRYPTION_KEY_PREVIOUS` makes a rotation survivable (both generations decrypt), but rows stay on the old key until they are next written. A one-shot re-encrypt script is the remaining piece.
- **Anyone with direct database access can enqueue any job.** True, and already game over at that point.

## The owner's responsibilities (not code)

1. Set `OWNER_EMAIL`, `OWNER_PASSWORD_HASH` (prefer the hash over `OWNER_PASSWORD`), `AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY` and `APP_URL` in Vercel — generated **locally**, never from a chat.
2. Decide whether this repository should stay public. Nothing secret is in it, but a public repo means every dependency and every workflow is an open target.
3. Keep Dependabot on, and treat a dev-only advisory as real: `pnpm test` runs in CI on every push.
4. `TOKEN_ENCRYPTION_KEY` is the one secret whose loss is unrecoverable — every stored OAuth token and mailbox password is encrypted under it. Back it up somewhere durable.
