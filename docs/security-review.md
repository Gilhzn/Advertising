# Security review — 2026-09-11

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
- Test mode (`NODE_ENV=test`) skips DNS resolution in `packages/connectors/src/net-guard.ts` unless `ADV_NET_GUARD=strict`; literal private IPs and blocked suffixes stay enforced.
