# YouTube Data API v3 — research notes

Researched 2026-09-11 for wave 2. **`developers.google.com` is blocked by the build proxy**, but
`www.googleapis.com` is not — so everything below is verified against **Google's own machine-readable
discovery document**, `https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest`, which is the
generator input for every official client library.

| Area | Confidence | Source |
| --- | --- | --- |
| `videos.insert` path, upload protocols, scopes | **high (verified)** | discovery doc `resources.videos.methods.insert` |
| `VideoSnippet` / `VideoStatus` field names | **high (verified)** | discovery `schemas.VideoSnippet`, `schemas.VideoStatus` |
| `privacyStatus` enum + `publishAt` semantics | **high (verified)** | discovery: *"can be set only if the privacy status of the video is private"* |
| `videos.list` / `channels.list` statistics fields | **high (verified)** | discovery `schemas.VideoStatistics`, `schemas.ChannelStatistics` |
| OAuth endpoints | **high (verified)** | `accounts.google.com/.well-known/openid-configuration` |
| Quota numbers and the compliance audit | **medium** | `packages/knowledge/platforms/youtube.md` |

No `googleapis` dependency: the connector implements the four calls it needs through `fetchJson`.

## Auth

Shared with the Google Business connector in `src/google/oauth.ts`:

- authorize `https://accounts.google.com/o/oauth2/v2/auth` with
  `access_type=offline` + `prompt=consent` (without both, a returning user gets **no refresh token**)
- token / refresh `https://oauth2.googleapis.com/token` with the client secret

Scopes (verified against `insert.scopes`, which lists `youtube.upload` among the accepted ones):
`youtube.upload`, `youtube.readonly`, `yt-analytics.readonly`.
Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

## Publishing — resumable upload

Discovery declares two upload protocols for `videos.insert`:

```json
"mediaUpload": { "maxSize": "274877906944",
  "protocols": { "simple":    { "path": "/upload/youtube/v3/videos" },
                 "resumable": { "path": "/resumable/upload/youtube/v3/videos" } },
  "accept": ["video/*", "application/octet-stream"] }
```

The public form of the resumable protocol is the one we use:

1. `POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`
   with the JSON resource as the body plus `X-Upload-Content-Type` and `X-Upload-Content-Length`.
   The session URL comes back in the **`Location` response header**.
2. `PUT <session url>` with the bytes → the created `video` resource, `{ id, snippet, status }`.

The asset is pulled with `downloadMedia` and capped at **128 MB** (memory ceiling — YouTube itself
accepts 256 GB).

### The resource we send

`snippet`: `title` (truncated to **100** chars), `description` (`composeBody`, 5,000 chars),
`tags` (hashtags with the `#` stripped, within the **500-character total** budget), `categoryId`
(default `22` = People & Blogs, overridable via `config.categoryId`), `defaultLanguage` /
`defaultAudioLanguage`.

`status`: `privacyStatus`, `selfDeclaredMadeForKids: false`, and `publishAt` when the post is
scheduled.

- **`privacyStatus` is `private` unless `config.audited === true`.** An unaudited API project has its
  uploads forced private by YouTube regardless, so we send what will actually happen.
  `capabilities.privateUntilReview = true` and `PublishResult.visibility` reports it.
- **`publishAt` forces `privacyStatus: "private"`**, because the discovery doc says publishAt is only
  honoured on a private video. This is why `capabilities.nativeSchedule = true`: the bytes go up
  once and YouTube flips the video public at the right minute, which is strictly better than holding
  the job in our scheduler.
- `#Shorts` is appended to the title when the video is vertical or square (`height >= width`), with
  the truncation budget reduced accordingly.

## Insights

- `channels.list?part=snippet,statistics&mine=true` → `subscriberCount` → `followers`,
  `viewCount` → account-level `views`. Also the identity used by `verify()` / `exchangeCode`.
- `videos.list?part=statistics&id=a,b,…` (50 per call) → `viewCount` → `views`,
  `likeCount` → `likes`, `commentCount` → `comments`.

All statistics come back as **strings** in the API and are converted with `Number()`.

`yt-analytics.readonly` is requested but not yet used: the YouTube Analytics API (watch time,
audience retention, traffic sources) is a separate host and a wave-3 item. `watch_time_seconds` in
`METRIC_NAMES` is reserved for it.

## Quota

Since **1 June 2026** `videos.insert` costs 1 unit against its own bucket capped at **100 calls/day
per Cloud project** (it used to cost ~1,600 units out of the 10,000/day pool). `search.list` costs
100 units and is capped at 100 calls/day — the connector never calls it. Our per-account `rateLimit`
is 20/day, comfortably under the project cap even with several connected channels.

`PLATFORMS.youtube.caveat` still mentions the old figure — see the report; `packages/shared` is
outside this task's scope.

## Review / audit

**API compliance audit required.** Until it passes, uploads are forced private. `verify()` returns a
`warning` while `config.audited !== true`. See `docs/app-reviews.md`.
