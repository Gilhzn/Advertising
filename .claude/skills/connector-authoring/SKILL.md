---
name: connector-authoring
description: How to add or change a platform connector in packages/connectors - interface, wizard steps, OAuth, publish, insights, rate limits, fixtures and tests. Load before touching any platform integration.
---
# Adding a platform connector

1. **Research first**: have `researcher` confirm endpoints, scopes, limits, review gates. Save the brief as `packages/connectors/src/<platform>/NOTES.md`.
2. **Metadata**: `PLATFORMS[<id>]` in `packages/shared/src/platforms.ts` (caveat text is shown in the wizard).
3. **Implement** `packages/connectors/src/<platform>/index.ts` exporting a `Connector` (see `packages/connectors/src/connector.ts`):
   - `wizard(brandKit)` returns the human steps: create account (deep link + prefilled copy), configure (business account, link page...), connect (OAuth or paste token/webhook), verify.
   - `authUrl / exchangeCode / refresh` use `packages/connectors/src/oauth.ts` helpers (PKCE, state).
   - `publish(account, post)` must be idempotent: check `post.externalId` before re-posting; upload media from a public URL (R2).
   - `fetchInsights(account, since)` returns `MetricSnapshot[]` using only `METRIC_NAMES`.
   - `getRateLimit()` returns tokens/interval used by the publisher's limiter.
4. **HTTP** only via `packages/connectors/src/http.ts`; any URL that comes from a user or from model output (media, self-hosted hosts) must pass `assertPublicUrl` from `src/net-guard.ts` first (SSRF); credentials such as webhook URLs go in the encrypted token store, never in `config`. Error strings stored in the DB go through `redactSecrets` (`@adv/shared`) (`fetchJson`) - timeouts, retry on 429/5xx with backoff honoring `Retry-After`, structured error `ConnectorError { code, retryable, platform }`.
5. **Sandbox/private modes**: if the platform forces private posts before review (TikTok, YouTube, Pinterest) set `capabilities.privateUntilReview = true`; the publisher marks the post `published` with `externalUrl` and a `visibility: private` note.
6. **Fixtures**: record real response shapes into `__fixtures__/*.json` (secrets stripped). Tests use msw handlers in `<platform>/index.test.ts`: publish success, publish rate-limited then success, refresh flow, insights mapping, error mapping.
7. **Register** in `packages/connectors/src/registry.ts`.
8. **Playbook**: ensure `packages/knowledge/platforms/<platform>.md` exists (ask `growth-strategist`).
9. **Docs**: add the review/audit requirements to `docs/app-reviews.md`.
