# Discord incoming webhooks - verified API notes

Researched 2026-09-11 from the **official docs repository `discord/discord-api-docs@main`**
(`developers/resources/webhook.mdx` and `developers/topics/rate-limits.mdx`); `discord.com` itself is
blocked from this environment, so the mdx sources are the citation.

## Auth model

`authKind: "token"`. The user creates an **incoming webhook** (type `1`) on one channel and pastes
the URL. No OAuth, no bot invite, no scopes: "Webhooks are a low-effort way to post messages to
channels in Discord. They do not require a bot user or authentication to use."

URL shape accepted: `https://discord.com/api[/vN]/webhooks/{webhook.id}/{webhook.token}` (also
`discordapp.com` and the canary/ptb hosts). The token is in the **path**, so the URL is the
credential: we store it in `tokens.accessToken` (encrypted at rest by the db layer) and keep only the
non-secret ids (`webhookId`, `channelId`, `guildId`) in `config`. `redactUrl` rewrites
`/webhooks/<id>/<token>` → `/webhooks/<id>/***` before logging.

## Verify

`GET /webhooks/{id}/{token}` ("Get Webhook with Token" — "does not require authentication and returns
no user in the webhook object") → `{ id, type, name, channel_id, guild_id, avatar }`.

## Publish

`POST /webhooks/{id}/{token}?wait=true` → with `wait=true` Discord "waits for server confirmation of
message send before response, and returns the created message body", which is how we get the message
id for `externalId`. Without it the response is `204 No Content`.

JSON params used: `content` (**up to 2000 characters**), `embeds` (array of **up to 10** embed
objects), `allowed_mentions`. We always send `allowed_mentions: { parse: [] }` so generated copy can
never ping `@everyone` or a role — the docs explicitly recommend this for user-generated strings.
At least one of `content`, `embeds`, `components`, `file` or `poll` must be present.

Images ride in embeds as `image: { url }`; the docs note that for webhook embeds every field can be
set **except** `type`, `provider`, `video`, and any `height`/`width`/`proxy_url` on images.

Post URL is assembled as `https://discord.com/channels/{guild_id}/{channel_id}/{message_id}`.

## Rate limits

Verified header names from `rate-limits.mdx`:
`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `X-RateLimit-Reset-After` (seconds,
may be fractional), `X-RateLimit-Bucket`, plus `X-RateLimit-Global` and `X-RateLimit-Scope` which
appear **only on 429s**. The 429 body is `{ message, retry_after: float, global: boolean }` and the
docs say to "rely on the `Retry-After` header or `retry_after` field" — `fetchJson` is given
`retryAfterFrom: body.retry_after` so the fractional value is used. We log
`remaining`/`reset-after`/`bucket` on every publish and warn when the bucket hits 0.

**Unverified assumption:** the commonly cited webhook bucket of *5 requests per 2 seconds* and the
*30 messages per minute* per-channel ceiling are not stated in the docs pages I read (Discord does not
publish per-route numbers). `rateLimit` is set to 30/60s on that basis; the real limit is discovered
from the headers at runtime.

## Insights

None. Webhooks are write-only; reading reactions or message stats needs a bot with
`GUILD_MESSAGES`/`MESSAGE_CONTENT` and a gateway connection, which is wave 2 at the earliest.
`fetchInsights` returns `[]`.

## Deviations from `PLATFORMS.discord`

`PLATFORMS` marks `video: true` and `carousel: true`. The connector reports both `false`: a webhook
can only reference a video through `multipart/form-data` file upload (embeds cannot set `video`), so
a video attachment is appended to `content` as a bare URL for Discord to unfurl, and multiple images
render as separate embeds rather than a swipeable carousel.

## Review / audit

None for webhooks. See `docs/app-reviews.md`.
