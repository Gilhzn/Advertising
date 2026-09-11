# LinkedIn (personal profile) - API notes

Researched 2026-09-11. `learn.microsoft.com` (where LinkedIn's docs live) is blocked from this
environment, so the statements below come from search summaries of those pages rather than pages I
opened. Each claim is attributed; **re-verify before the first real publish.**

## Scope of wave 1

**Personal profile only.** Posting to a personal profile with `w_member_social` is self-serve;
posting to a Company Page needs the **Community Management API**, which is a partner-approved
program. `PLATFORMS.linkedin` already carries that caveat and the wizard repeats it.

## Auth

- Authorize: `GET https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id&redirect_uri&state&scope`
  with **space-separated** scopes `openid profile w_member_social`.
- Token: `POST https://www.linkedin.com/oauth/v2/accessToken` (form,
  `grant_type=authorization_code`) → `{ access_token, expires_in, refresh_token?, scope }`.
  Access tokens last 60 days; refresh tokens are only issued to apps that have them enabled, which is
  why `refresh` raises a clear `auth_expired` when there is none.
- Identity: `GET https://api.linkedin.com/v2/userinfo` (the OpenID Connect endpoint that replaced
  `/v2/me`) → `{ sub, name, given_name, family_name, picture, email }`.
  The member URN is `urn:li:person:{sub}` and is stored in `config.memberUrn`.

## Required headers on every `/rest/` call

`LinkedIn-Version: YYYYMM` and `X-Restli-Protocol-Version: 2.0.0`
(<https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/protocol-version>). The version
is `LINKEDIN_API_VERSION`, default `202505` — **treat the default as a guess**; LinkedIn only supports
a rolling window of recent versions, so this env var will need bumping.

## Publishing

`POST https://api.linkedin.com/rest/posts` with

```json
{
  "author": "urn:li:person:…",
  "commentary": "…",
  "visibility": "PUBLIC",
  "distribution": { "feedDistribution": "MAIN_FEED", "targetEntities": [], "thirdPartyDistributionChannels": [] },
  "lifecycleState": "PUBLISHED",
  "isReshareDisabledByAuthor": false,
  "content": { "media": { "id": "urn:li:image:…", "altText": "…" } }
}
```

The same endpoint serves profiles and Company Pages — "only the author URN and required OAuth scope
differ" (<https://postproxy.dev/blog/linkedin-api-automate-company-page-publishing/>).

A `201 Created` returns the post URN in the **`x-restli-id`** response header, not in the body
(<https://learn.microsoft.com/en-us/linkedin/compliance/integrations/shares/ugc-post-api>); we fall
back to `x-linkedin-id` and then `body.id`.

### `commentary` escaping - the easy thing to get wrong

`commentary` uses LinkedIn's **"little text format"**, where the reserved characters
`\ | { } @ [ ] ( ) < > # * _ ~` must each be escaped with a backslash **even when they are not being
used as markup**, including inside mention names and URNs
(<https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/little-text-format>).
`escapeCommentary()` does exactly that. Note this means our hashtags arrive as `\#robots` on the wire.

### Images - two step, no synchronous upload

1. `POST /rest/images?action=initializeUpload` with `{ "initializeUploadRequest": { "owner": "<urn>" } }`
   → `{ value: { uploadUrl, image, uploadUrlExpiresAt } }`.
2. `PUT` the raw bytes to `uploadUrl` with the bearer token.
3. Reference `image` (an `urn:li:image:…`) as `content.media.id` on the post.

"The uploadUrl has an expiration time, so you must register and upload in the same operation; the
Images API does not support synchronous upload"
(<https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api>). The
connector therefore initializes and uploads back to back.

## Insights

`fetchInsights` returns `[]` and `capabilities.insights` is `false`. LinkedIn's organic analytics
(`organizationalEntityShareStatistics`) covers **organization** entities only and sits behind the
Community Management API review; there is no member-level analytics API.

## Deviations from `PLATFORMS.linkedin`

`PLATFORMS` marks `video: true`. The connector reports `video: false`: LinkedIn videos need the
Videos API with a multi-part upload and a finalize call, which is not wave 1. `publish` raises
`invalid_media` for a video attachment. `maxMedia` is 1 (single image posts).

## Rate limits

**Unverified.** LinkedIn applies per-app and per-member daily quotas that are visible in the developer
portal rather than published as a number. `rateLimit` is `{ limit: 100, windowMs: 86_400_000 }`, which
is far below any tier we might be on; a 429 maps to `rate_limited` and is retried.

## Review / audit

Self-serve for personal posting: create an app, associate it with a Company Page, request the
**Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn** products. No review for that
pair. See `docs/app-reviews.md`.
