# Facebook Pages (Graph API) - API notes

Researched 2026-09-11. **Confidence warning:** `developers.facebook.com` is blocked from this
environment, so unlike Bluesky/Telegram/Discord none of this is quoted from a primary document I
could open. Everything below is from secondary sources found via web search (listed inline) plus
long-standing Graph API behaviour. **Re-verify against the official docs before the first real
publish**, especially the insights metric names.

## Graph version

`META_GRAPH_VERSION`, default `v22.0`. Secondary sources for 2026 describe v22.0 as current
(<https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2026/>) while a Meta
reference URL seen in search results carried `v25.0`
(<https://developers.facebook.com/docs/graph-api/reference/page/videos/>). **Unverified** — the env
var exists precisely so this is a config change, not a code change.

## Auth - Facebook Login for Business

`authKind: "oauth"`. Scopes requested (all eight, as specified for this project):
`pages_show_list, pages_manage_posts, pages_read_engagement, read_insights, business_management,
instagram_basic, instagram_content_publish, instagram_manage_insights`.

1. Dialog: `GET https://www.facebook.com/{version}/dialog/oauth?client_id&redirect_uri&state&response_type=code&scope[&config_id]`
   (`META_LOGIN_CONFIG_ID` selects a Login-for-Business configuration when one is set up).
2. `GET /{version}/oauth/access_token?client_id&client_secret&redirect_uri&code` → short-lived user token.
3. `GET /{version}/oauth/access_token?grant_type=fb_exchange_token&client_id&client_secret&fb_exchange_token=<short>`
   → long-lived user token, ~60 days.
   <https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/>
4. `GET /me/accounts?fields=id,name,username,link,category,tasks,access_token,instagram_business_account{id,username}`
   → the Pages the user administers **with their Page access tokens**. Page tokens derived from a
   long-lived user token do not themselves expire on a timer.

### Token storage

`tokens.accessToken` = **Page** token (used by publish + insights).
`tokens.refreshToken` = long-lived **user** token — Facebook has no OAuth refresh token, and the user
token is the only credential that can mint a fresh Page token, so it occupies that slot. Both are
encrypted at rest by the db layer. `config` holds only `pageId`, `pageName`, `pageUsername`, `pageUrl`.
`refresh(tokens)` re-mints the user token; `refreshForAccount(account)` (the added optional method)
additionally re-reads the Page token via `/me/accounts`.

## Publishing

| case | edge | params |
| --- | --- | --- |
| text / link | `POST /{page-id}/feed` | `message`, `link` |
| 1 image | `POST /{page-id}/photos` | `url`, `caption`, `alt_text_custom`, `published=true` |
| 2-10 images | `POST /{page-id}/photos` with `published=false` per photo, then `POST /{page-id}/feed` with `attached_media=[{"media_fbid":…}]` | |
| video | `POST /{page-id}/videos` | `file_url`, `description`, `title` |

`/feed` returns `{ id: "<pageid>_<postid>" }`; `/photos` returns `{ id: <photo id>, post_id: "<pageid>_<postid>" }`
— we prefer `post_id` so insights and the permalink line up.

### Native scheduling (`capabilities.nativeSchedule = true`)

`published=false` + `scheduled_publish_time=<unix seconds>`. Meta requires the time to be **10 minutes
to 75 days** ahead (long-standing documented constraint, **unverified** here). The connector uses the
new optional `PublishablePost.scheduledAt`: beyond +10 min it schedules natively, inside that window
it publishes immediately (the worker is already late), beyond +75 days it raises `rejected`.

## Insights - the deprecation minefield

Meta is actively retiring Page/post insights metrics:

- From **15 Nov 2025** `impressions` and "page fans" were deprecated in the Page Insights API
  (<https://developers.facebook.com/blog/post/2025/08/15/page-insights-api-updates/>).
- From **15 June 2026** a further batch of Pages and Post Insights metrics was removed across Graph
  API versions; `page_impressions_unique` (Page Reach) is replaced by
  `page_total_media_view_unique`, `page_fans` by Page follows, and `post_impressions` /
  `page_posts_impressions` (with their organic/paid breakdowns) were removed in favour of
  `page_media_view` / `post_media_view`
  (<https://docs.emplifi.io/platform/latest/home/facebook-metric-deprecation-november-2025>,
  <https://docs.supermetrics.com/docs/facebook-insights-field-changes-june-30-2026>,
  <https://windsor.ai/documentation/guide-for-deprecating-metrics-for-facebook-organic-connector-june-15-2026/>).

Because the cut-over date is already behind us and the replacement names are only attested by
third-party connector docs, the implementation:

1. requests the **classic** batch (`page_impressions_unique, page_post_engagements, page_fans`) and the
   **replacement** batch (`page_total_media_view_unique, page_follows`) in two separate calls;
2. logs a warning and continues when either call 400s, so one retired name can never blank an ingest;
3. maps whatever comes back through `PAGE_METRIC_MAP`.

Post level: `GET /{post-id}/insights?metric=post_impressions_unique,post_clicks` (same
tolerate-failure treatment) plus
`GET /{post-id}?fields=likes.summary(true),comments.summary(true),shares`, which are ordinary edge
summaries and are **not** part of the insights deprecation.

Mapping onto `METRIC_NAMES`:

| Graph metric | our metric |
| --- | --- |
| `page_impressions_unique`, `page_total_media_view_unique` | `reach` |
| `page_fans`, `page_follows` | `followers` |
| `page_post_engagements` | `score` (there is no "engagements" in `METRIC_NAMES`; `score` is our generic engagement bucket) |
| `post_impressions_unique` | `reach` (post-level) |
| `post_clicks` | `clicks` |
| `likes.summary.total_count` / `comments.summary.total_count` / `shares.count` | `likes` / `comments` / `shares` |

## Error mapping

Graph answers HTTP 400 for nearly everything and encodes the meaning in `error.code`:
`190`/`102` → `auth_expired`; `4`/`17`/`32`/`613`/`80001…` → `rate_limited`; `368` → `rejected`
(temporarily blocked); `10` and `200-299` → `auth_expired` (missing permission, needs re-consent);
`324`/`2207026` → `invalid_media`. These code meanings are well established but, like the rest of this
file, **not quoted from a primary doc in this session**.

Rate limit: Meta's published Pages formula is `4,800 × (engaged users) / 24h` per asset. We pace at
25 publishes/hour, which is nowhere near it.

## Review / audit

Development mode works for anyone with an app role (admin/developer/tester) on their own Pages.
Public third-party use needs **App Review** for `pages_manage_posts`, `pages_read_engagement`,
`read_insights` and `business_management`, plus Business Verification. See `docs/app-reviews.md`.
