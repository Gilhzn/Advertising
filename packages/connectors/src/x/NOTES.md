# X (Twitter) API v2 — research notes

Researched 2026-09-11 for wave 2. **`developer.x.com` and `docs.x.com` are blocked by the build
proxy**, so every claim below is verified against X's own code on GitHub (the `xdevplatform` org)
rather than the rendered docs. Confidence is marked per section.

| Area | Confidence | Primary source |
| --- | --- | --- |
| OAuth 2.0 PKCE endpoints | **high (verified)** | `xdevplatform/xdk-python@main:xdk/oauth2_auth.py` |
| Chunked media upload v2 | **high (verified)** | `xdevplatform/samples@main:python/media/media_upload_v2.py` |
| `POST /2/tweets` body shape | **high (verified)** | `xdevplatform/xdk-python@main:xdk/schemas.py` |
| `public_metrics` field names | **high (verified)** | same `schemas.py` (`PostPublicMetrics`, `UserPublicMetrics`) |
| `non_public_metrics` field names | **medium** | not in the SDK schema; long-standing v2 names |
| Pay-per-use pricing | **medium** | `packages/knowledge/platforms/x.md` (secondary sources) |
| Error `type` URIs | **medium** | a few appear in `schemas.py` (`.../problems/invalid-request`, `.../problems/internal-error`) |

## Auth — OAuth 2.0 Authorization Code with PKCE

Verified in `xdk/oauth2_auth.py`:

- authorize: `https://x.com/i/oauth2/authorize` with `code_challenge` + `code_challenge_method=S256`
- token: `POST https://api.x.com/2/oauth2/token`, `application/x-www-form-urlencoded`,
  **client credentials as HTTP Basic** for confidential clients (the SDK comment spells out that
  sending them in the body produces `unauthorized_client`)
- refresh: same URL, `grant_type=refresh_token`, also Basic — `refreshWithRefreshToken(..., { basicAuth })`

### Scopes — one addition to the brief

The brief asked for `tweet.read tweet.write users.read offline.access`. X's **own** media sample
requests `media.write` as well:

```python
scopes = ["media.write", "users.read", "tweet.read", "tweet.write", "offline.access"]
```

Without `media.write` the media INIT call is refused, so `X_SCOPES` in `index.ts` includes it.
`offline.access` is what produces the refresh token.

Env: `X_CLIENT_ID`, `X_CLIENT_SECRET`.

## Publishing

`POST https://api.x.com/2/tweets` with a JSON body. Fields used (all verified in
`CreatePostsRequest` / `CreatePostsReply` / `CreatePostsMedia`):

```jsonc
{
  "text": "…",
  "media": { "media_ids": ["…"] },          // CreatePostsMedia.media_ids
  "reply": { "in_reply_to_tweet_id": "…" }  // CreatePostsReply.in_reply_to_tweet_id (required field)
}
```

Response: `{ "data": { "id", "text" } }`. Post URL: `https://x.com/<handle>/status/<id>`.

Threads are produced by `splitThread(body, 280)` and chained: each part replies to the previous id,
and only the first part carries the media. The returned `externalId` is the **root** post id.

### Media upload — v2 chunked, confirmed

`POST https://api.x.com/2/media/upload` — **verified** against the official sample, which is the
reason we did *not* fall back to v1.1 `upload.json`:

| Step | Method | Where the params go | Notes |
| --- | --- | --- | --- |
| INIT | POST | **query string**: `command=INIT&media_type=&total_bytes=&media_category=` | → `data.id` |
| APPEND | POST | **multipart body**: `command`, `media_id`, `segment_index` + file part named `media` | 4 MB chunks |
| FINALIZE | POST | **query string**: `command=FINALIZE&media_id=` | → `data.processing_info` for video |
| STATUS | **GET** | query string: `command=STATUS&media_id=` | poll `processing_info.check_after_secs` |

`media_category` enum (from `InitializeMediaUploadRequest`): `tweet_image`, `tweet_gif`,
`tweet_video`, `amplify_video`, `dm_*`, `subtitles`. `media_type` is an enum of concrete MIME types.

The connector buffers the asset (`downloadMedia`) before chunking and caps video at **64 MB**, well
below X's 512 MB, because the buffer is in memory.

## Cost — the reason this connector is different

X is **pay-per-use**: ≈**$0.015 per post created** and ≈**$0.20 per post containing a link** (13x).
Source: `packages/knowledge/platforms/x.md` (secondary sources — re-check against the billing page
before the first customer).

Two additions carry this into the product:

- `capabilities.costPerPostUsd = 0.015` — the indicative floor price.
- `Connector.estimatedCostUsd(post)` (new optional interface method) returns the **real** figure for
  this post: it splits the thread exactly the way `publish` will and charges `$0.20` for each part
  that contains the link and `$0.015` for the rest. A 6-post thread with the link in the last post
  is `5 × 0.015 + 0.20 = $0.275`.

This is why the playbook's "link in a self-reply" pattern matters: one $0.20 post per thread instead
of one per post.

## Insights

- `GET /2/users/me?user.fields=public_metrics` → `followers_count` → `followers`.
- `GET /2/tweets?ids=…&tweet.fields=public_metrics,non_public_metrics` →
  `impression_count` → `impressions`, `like_count` → `likes`, `reply_count` → `replies`,
  `repost_count` → `reposts`, `non_public_metrics.url_link_clicks` → `clicks`.

Two robustness notes:

1. The SDK schema calls the repost counter **`repost_count`**, while the field has historically been
   `retweet_count`. The connector reads `repost_count ?? retweet_count`.
2. `non_public_metrics` requires **user context on posts the authenticated user owns** and 400s
   otherwise. `fetchInsights` catches a `rejected`/`auth_expired` on that call and retries with
   `tweet.fields=public_metrics` only, rather than losing the whole batch.

## Rate limits

Pay-per-use has no published per-endpoint post ceiling; the practical ceiling is the platform-side
~2,400 posts/day per user. Our `rateLimit` is **25 per 15 minutes**, which is a *spend* guard as much
as a rate guard. 429s carry `x-rate-limit-reset` (epoch seconds) rather than `Retry-After` on some
edges; `fetchJson` then falls back to exponential backoff, which is fine at this volume.

## Review / audit

**None.** There is no app review for posting. The gates are: a developer account, a project + app
with OAuth 2.0 user authentication configured, and **a payment method attached**. See
`docs/app-reviews.md`.
