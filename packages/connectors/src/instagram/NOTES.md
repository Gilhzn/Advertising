# Instagram (Instagram API with Facebook Login) - API notes

Researched 2026-09-11. Same caveat as `../facebook/NOTES.md`: `developers.facebook.com` is blocked
from this environment, so the statements here come from secondary sources (cited inline) rather than
a primary document opened in this session. **Re-verify the metric names before relying on analytics.**

## Prerequisites the wizard must enforce

Publishing works only for an Instagram **Business or Creator** account that is **linked to a Facebook
Page**. A personal account cannot be published to by any API. The wizard makes this a blocking step
with a caveat box.

## Auth - shares the Meta app with the facebook connector

`authKind: "oauth"`. Identical dialog, identical scopes (`META_SCOPES` in `../meta/graph.ts`);
`exchangeCode` runs the Facebook flow (code → short user token → long-lived user token →
`/me/accounts`) and then resolves
`page.instagram_business_account{ id, username }` from the chosen Page. If no Page has a linked
Instagram account we raise `not_configured` with instructions rather than a generic error.

Stored: `tokens.accessToken` = Page token, `tokens.refreshToken` = long-lived user token,
`config = { igUserId, igUsername, pageId, pageName }`.

## Publishing - the container flow

1. `POST /{ig-user-id}/media` → `{ id }` (a *container*, not a post)
   - image: `image_url`, `caption`, `alt_text`
   - reel/video: `video_url`, `media_type=REELS`, `caption`, `share_to_feed`
   - carousel child: `image_url`/`video_url` + `is_carousel_item=true`
   - carousel wrapper: `media_type=CAROUSEL`, `children=<comma separated ids>`, `caption`
2. Poll `GET /{container-id}?fields=status_code` until `FINISHED`. Status values are
   `EXPIRED | ERROR | FINISHED | IN_PROGRESS | PUBLISHED`; containers expire after 24 hours.
   Meta's own guidance is "query a container's status once per minute for no more than 5 minutes"
   (<https://developers.facebook.com/docs/instagram-platform/content-publishing/>,
   summarised at <https://postproxy.dev/blog/instagram-reels-api-publishing-guide/>). We cap at
   **60 s** with 2 s → 10 s exponential backoff, because the worker owns the job timeout and a
   `network`-coded retryable error just re-queues the job.
3. `POST /{ig-user-id}/media_publish` with `creation_id=<container id>` → `{ id }` (the media id).
4. `GET /{media-id}?fields=permalink` for `PublishResult.url` (best effort — a failure here does not
   fail the publish).

Caption is `composeBody` output: body, then the link (not clickable on Instagram but kept for
copy/paste), then a trailing hashtag block of up to 12 tags. 2,200 char limit.

## Rate limit - a real platform rule, not a guess

**100 API-published posts per rolling 24 hours** per Instagram account; a carousel counts as one post.
`rateLimit` is `{ limit: 100, windowMs: 86_400_000 }` so the publisher's sliding window enforces it
directly. Meta also exposes `GET /{ig-user-id}/content_publishing_limit` to read the current usage —
**not implemented yet**; worth adding before high-volume customers.

## Insights

- Account: `GET /{ig-user-id}/insights?metric=reach,follower_count,profile_views&period=day&since&until`
- Media: `GET /{ig-media-id}/insights?metric=reach,likes,comments,saved,shares,views`

Mapping: `reach`→`reach`, `follower_count`→`followers`, `profile_views`→`views` (account-level),
`saved`→`saves`, everything else 1:1.

**Deprecations that shaped this list** (<https://docs.supermetrics.com/docs/instagram-insights-updates>,
<https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2026/>): `impressions` and
`video_views` were deprecated in v22.0 in favour of **`views`**, and requests for `impressions` on
media created on or after 2 July 2024 now return an error rather than a number. `plays` is likewise
gone. That is why `impressions` is deliberately absent from `MEDIA_METRICS`. `profile_views` is
reported as deprecated as a *time series* by one source while still being listed as a user metric by
others — **unverified**; the call is wrapped so a 400 only logs a warning and the media metrics still
land.

## Review / audit

Development mode works for app-role users with their own linked accounts. Public use needs App Review
for `instagram_basic`, `instagram_content_publish` and `instagram_manage_insights` plus Business
Verification. See `docs/app-reviews.md`.
