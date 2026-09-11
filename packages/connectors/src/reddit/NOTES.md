# Reddit API — research notes

Researched 2026-09-11 for wave 2. **`reddit.com/dev/api` and `support.reddithelp.com` are blocked by
the build proxy**, so the wire format here is verified against **PRAW** (`praw-dev/praw@main`), the
reference Python client, whose endpoint table and request payloads are generated from live use.

| Area | Confidence | Source |
| --- | --- | --- |
| Endpoint paths (`api/submit`, `api/v1/me`, `api/info`, `api/media/asset.json`) | **high (verified)** | `praw/endpoints.py` |
| `/api/submit` form fields | **high (verified)** | `praw/models/reddit/subreddit/subreddit.py::submit` |
| `/api/submit` image flow needs a WebSocket | **high (verified)** | same file, `_submit_media` |
| Media asset lease shape | **high (verified)** | `praw/models/media.py::PostMedia` |
| `/api/v1/me` and `/api/info` field names | **medium** | PRAW model attributes + long-standing behaviour |
| Rate limits, karma/age gates, commercial terms | **medium** | `packages/knowledge/platforms/reddit.md` |

## Ownership: `owned` account, someone else's community

The connected Reddit **account** is `ownership: "owned"` — but a Reddit post always lands in a
subreddit that we do not own. The repo rule ("posts to communities we do not own always require human
approval") is therefore enforced *in the connector*: `publish()` reads `post.communityRef` and throws
`ConnectorError("rejected")` when it is empty, so a post can never reach Reddit without a community
having been chosen and approved upstream. `r/SideProject` and `SideProject` are both accepted.

## Auth

- authorize: `https://www.reddit.com/api/v1/authorize` with
  `client_id`, `response_type=code`, `state`, `redirect_uri`, **`duration=permanent`** (without it
  there is no refresh token and the connection dies in an hour), `scope=identity submit read mysubreddits`
- token: `POST https://www.reddit.com/api/v1/access_token`, **HTTP Basic** `client_id:client_secret`,
  form `grant_type=authorization_code|refresh_token`
- API host for everything else: `https://oauth.reddit.com`

Env: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, optional `REDDIT_OWNER_HANDLE`.

### The User-Agent is mandatory

Every call sends `User-Agent: adv-engine/0.1 by <handle>` (`userAgent()` in `index.ts`), falling back
to `REDDIT_OWNER_HANDLE`. Reddit throttles and eventually blocks default/absent user agents, and
this is the one header that has to be right on *both* the token call and the API calls.

## Publishing — `POST /api/submit`

Form-encoded. Field names verified from PRAW's `submit()`:

`api_type=json`, `sr`, `title`, `kind` (`self` | `link` | `image` | `video` | `videogif`),
`text` (self body, also allowed alongside a link), `url` (link/image), `flair_id`, `flair_text`
(only meaningful with `flair_id`), `nsfw`, `spoiler`, `sendreplies`, `resubmit`, `validate_on_submit`.

Response is **HTTP 200 even on failure**; the outcome is in
`json.errors: [["CODE", "explanation", field]]` and the id in `json.data.{id,name,url}`.
`checkSubmitBody` maps that: `RATELIMIT` → retryable `rate_limited` with the wait parsed out of
`"try again in 9 minutes"`, anything else → `rejected`. `externalId` is the fullname `t3_…`, which is
also what `/api/info` wants.

### Flair

Most subreddits require a link flair or AutoModerator removes the post. `flair_id` (and optional
`flair_text`) come from `account.config.flairId` / `config.flairText`; the ids come from
`GET /r/<sub>/api/link_flair_v2`.

### Why image posts are not implemented

The lease flow *is* verified (`POST /api/media/asset.json` with `filepath` + `mimetype` →
`args.action` + `args.fields[]` to POST the file to S3, plus `asset.asset_id`). The blocker is the
**second** step: for `kind=image`, `/api/submit` returns `json.data.websocket_url` and **not** the
post id — PRAW opens a WebSocket and waits for `payload.redirect` to learn where the post landed.
Our stack is `fetchJson` only, and an `externalId` is required for idempotency and insights, so
wave 2 ships **self and link posts** and `capabilities.image` is `false`. A post with media attached
is still published (as text/link) and the dropped media is logged as
`connector.reddit.media_dropped`.

Unblocking it later means either a WebSocket client in the worker or polling
`/user/<name>/submitted` for the new id — a wave-3 decision.

## Insights

`GET /api/info?id=t3_a,t3_b` → `data.children[].data`:

| Reddit field | our metric |
| --- | --- |
| `score` (fallback `ups`) | `score` |
| `upvote_ratio` | `upvote_ratio` |
| `num_comments` | `comments` |

Batched 100 ids per call. There is no account-level metric worth storing: `/api/v1/me` exposes karma,
not followers, and `METRIC_NAMES` has no karma entry.

## Rate limits

The API allows **100 queries/minute per OAuth client id** averaged over 10 minutes. That is not the
binding constraint — Reddit throttles new/low-karma accounts to roughly **one post per 10 minutes**
sitewide, and subreddit culture is stricter still (one post per subreddit per 30-day launch window).
`rateLimit` is therefore **5/hour**, and the real protection is the human approval step.

## `verify()` returns a warning

`verify()` reads `/api/v1/me` and returns the new optional `warning` field when the account is under
**30 days old**, has under 50 comment karma, or is suspended. These are the thresholds that get posts
removed, and the wizard shows them as a warning box rather than blocking the connection.

## Review / access

New API apps need manual approval, and Reddit's Data API terms require an agreement (and payment) for
commercial use — our usage is borderline and must be reviewed before the first paying customer. See
`docs/app-reviews.md`.
