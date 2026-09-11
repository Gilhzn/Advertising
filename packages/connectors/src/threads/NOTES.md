# Threads API - API notes

Researched 2026-09-11. **Confidence warning:** `developers.facebook.com/docs/threads` is blocked from
this environment. The only primary artefact I could open is Meta's official sample app
<https://github.com/fbsamples/threads_api>, whose README confirms the one thing that most often trips
people up:

> "Make sure that you are using the APP ID and Secret defined for the **Threads API** of your app.
> These ARE **not** the same as the regular app ID and app secret."

Hence the separate `THREADS_APP_ID` / `THREADS_APP_SECRET` env vars rather than reusing `META_APP_*`.
Everything else below is from secondary sources found via search and must be re-verified.

## Auth - its own OAuth, on threads.net

- Authorize: `GET https://threads.net/oauth/authorize?client_id&redirect_uri&scope&response_type=code&state`
- Scopes: `threads_basic`, `threads_content_publish`, `threads_manage_insights`.
- Short-lived token: `POST https://graph.threads.net/oauth/access_token` (form:
  `client_id, client_secret, grant_type=authorization_code, redirect_uri, code`) → `{ access_token, user_id }`.
- Long-lived (60 day): `GET https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret&access_token`.
- Refresh: `GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token`
  — note the grant refreshes the **access token itself**; there is no separate refresh token, which is
  why `refresh(tokens)` here reads `tokens.accessToken` rather than `tokens.refreshToken`.
- Identity: `GET https://graph.threads.net/v1.0/me?fields=id,username,name,threads_profile_picture_url`.

The sample app README also notes Threads apps **do not accept `localhost` redirect URLs**, which
matters for local development of the wizard.

## Publishing - container flow (same shape as Instagram)

1. `POST /v1.0/{threads-user-id}/threads` with `media_type` = `TEXT | IMAGE | VIDEO | CAROUSEL`,
   plus `text`, `image_url` / `video_url`, `is_carousel_item`, `children` → container id.
2. Poll `GET /v1.0/{container-id}?fields=status,error_message` until `FINISHED`
   (`EXPIRED | ERROR | FINISHED | IN_PROGRESS | PUBLISHED`). We cap at 60 s with 2→10 s backoff; a
   still-processing container raises a retryable `network` error so the job re-queues.
   Text-only containers publish immediately and are not polled.
3. `POST /v1.0/{threads-user-id}/threads_publish` with `creation_id` → `{ id }`.
4. `GET /v1.0/{media-id}?fields=permalink` for the post URL (best effort).

Sources for the flow and media types (TEXT/IMAGE/VIDEO/CAROUSEL, MP4/MOV, up to 10 carousel items):
<https://social-api.ai/blog/threads-api-publishing-posts-developer-guide>,
<https://postproxy.dev/blog/how-to-post-to-threads-via-api/>.

Text limit is **500 characters**, matching `PLATFORMS.threads.maxChars`. `composeBody` uses the
Threads convention of **one inline topic tag** (Threads surfaces a single tag per post) and appends
the link inline.

## Insights

- Media: `GET /v1.0/{media-id}/insights?metric=views,likes,replies,reposts,quotes`
- User: `GET /v1.0/{threads-user-id}/threads_insights?metric=views,likes,replies,reposts,quotes,followers_count&since=`

Mapping onto `METRIC_NAMES`: `views→views`, `likes→likes`, `replies→replies`, `reposts→reposts`,
`followers_count→followers`, and **`quotes→shares`** — `METRIC_NAMES` has no "quotes", and a quote is
a reshare with commentary, so `shares` (otherwise unused on Threads) is the closest honest bucket.
This mapping choice is ours, not the platform's.

Note the payload mixes shapes: user insights return `total_value.value` for lifetime metrics and
`values[]` for daily ones. `flattenInsights` in `../meta/graph.ts` handles both.

## Rate limits

**Unverified:** search results state 250 published posts per 24 hours per user
(<https://www.ayrshare.com/blog/threads-api-integration-authorization-posting-analytics-with-ayrshare/>).
`rateLimit` is `{ limit: 250, windowMs: 86_400_000 }` on that basis.

## Error mapping

Threads runs on the Graph stack, so `mapMetaError` from `../meta/graph.ts` is reused verbatim:
code 190 → `auth_expired`, 4/17/32/613 → `rate_limited`, 200-299 → missing permission, and so on.

## Review / audit

The Threads API requires **Tech Provider verification** for third-party use; in development mode only
users with a role on the app can connect. See `docs/app-reviews.md`.
