# TikTok Content Posting API — research notes

Researched 2026-09-11 for wave 2. **`developers.tiktok.com` is blocked by the build proxy.** Every
endpoint below was cross-checked against **two independent third-party implementations that agree**:

- `NangoHQ/integration-templates@main:integrations/tiktok-personal/actions/init-photo-upload.ts`
  (Nango's maintained TikTok template, with the doc URL in a comment)
- `arsenstorm/sotsial@main:packages/sotsial/src/providers/tiktok.ts`
- `WordPressBugBounty/plugins-feed-them-social` for `/v2/user/info/` and `/v2/video/query/` field lists

| Area | Confidence |
| --- | --- |
| OAuth endpoints, `client_key` naming, PKCE | **high** (two sources agree) |
| `video/init/` + `content/init/` bodies, `PULL_FROM_URL` | **high** (two sources agree) |
| `status/fetch/` polling and status values | **medium-high** |
| `publicaly_available_post_id` spelling (TikTok's own typo) | **medium** — both spellings are read |
| Error codes (`url_ownership_unverified`, `spam_risk_too_many_posts`…) | **medium** |
| Rate limits (6 req/min, ~15 posts/day) | **low** — TikTok does not publish these (see the playbook) |

## Auth — Login Kit

- authorize: `https://www.tiktok.com/v2/auth/authorize/` with **`client_key`** (not `client_id`),
  `scope` **comma-separated**, `response_type=code`, `redirect_uri`, `state`, plus PKCE
  `code_challenge` / `code_challenge_method=S256` for web apps.
- token: `POST https://open.tiktokapis.com/v2/oauth/token/`, form-encoded, `client_key` +
  `client_secret` + `grant_type=authorization_code` + `code` + `redirect_uri` + `code_verifier`.
  Response adds `open_id` and `refresh_expires_in` to the usual OAuth fields.
- refresh: same URL with `grant_type=refresh_token`.

Scopes: `user.info.basic`, `video.publish`, `video.upload`.
Env: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`.

## Publishing — Direct Post

Video:

```
POST /v2/post/publish/video/init/
{ "post_info": { "title", "privacy_level", "disable_comment" },
  "source_info": { "source": "PULL_FROM_URL", "video_url": "https://…" } }
→ { "data": { "publish_id" }, "error": { "code": "ok" } }
```

Photos (carousel, up to 35):

```
POST /v2/post/publish/content/init/
{ "media_type": "PHOTO", "post_mode": "DIRECT_POST",
  "post_info": { "title", "description", "privacy_level" },
  "source_info": { "source": "PULL_FROM_URL", "photo_images": [...], "photo_cover_index": 0 } }
```

Then poll `POST /v2/post/publish/status/fetch/` with `{ publish_id }` until
`PUBLISH_COMPLETE` (or `SEND_TO_USER_INBOX`); `FAILED` carries `fail_reason`. The completed payload
carries `publicaly_available_post_id: [id]` — note TikTok's own misspelling; we read both spellings.

`externalId` is the **`publish_id`**, because it is the only id that exists at the moment we accept
the post; the real post id (when the poll gets that far) is used for the URL and stored in `raw`.

### PULL_FROM_URL needs a verified domain

TikTok fetches the media itself, and it only accepts URLs whose **domain has been verified in the
developer portal**. An unverified domain fails with `url_ownership_unverified`, which the connector
maps to `invalid_media` with that explanation. Whoever sets up the deployment has to add the media
CDN domain (our R2 bucket's public hostname) to the portal — this is in the wizard's configure step.

### Privacy: private until the audit passes

`resolvePrivacyLevel(config)`:

- `config.audited !== true` → **always `SELF_ONLY`**, whatever `config.privacyLevel` says.
- audited → `config.privacyLevel ?? "PUBLIC_TO_EVERYONE"`.

`capabilities.privateUntilReview = true`, `PublishResult.visibility` is `"private"` for anything but
`PUBLIC_TO_EVERYONE`, and `verify()` returns a `warning` while unaudited. An unaudited app that asks
for a public post gets `privacy_level_option_mismatch`, so this is a correctness fix, not just copy.

`POST /v2/post/publish/creator_info/query/` returns the creator's allowed
`privacy_level_options` and is the right place to expand this later; it is not called today because
the unaudited answer is always `SELF_ONLY` anyway.

## Error envelope

Every response is `{ data, error: { code, message, log_id } }` and **`error.code === "ok"` means
success** — including on HTTP 200 responses that actually failed. That is why the connector wires the
same mapper into both `mapError` (non-2xx) and `checkBody` (2xx).

## Insights

- `GET /v2/user/info/?fields=follower_count,likes_count,video_count` → `followers`, account `likes`.
- `POST /v2/video/query/?fields=id,like_count,comment_count,share_count,view_count,share_url`
  with `{ "filters": { "video_ids": [...] } }` → per-video `views`, `likes`, `comments`, `shares`.
  Capped at 20 ids per call.

Note that `video/query` wants **real video ids**, not the `publish_id` we store as `externalId`, so
per-post metrics only appear once a status poll has resolved the post id. Recorded as a known gap.

## Review / audit

Content Posting API **audit required**, 2-4 weeks, needs a demo video of the posting flow and a
published privacy policy. Unaudited: `SELF_ONLY` posts only, and at most 5 users. See
`docs/app-reviews.md`.
