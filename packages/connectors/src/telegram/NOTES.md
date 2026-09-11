# Telegram Bot API - verified API notes

Researched 2026-09-11 against the machine-readable Bot API spec
**`PaulSonOfLars/telegram-bot-api-spec@main/api.json`**, which is generated directly from
<https://core.telegram.org/bots/api> (that host is blocked from this environment). The spec file
reports `"version": "Bot API 10.3", "release_date": "August 24, 2026"`, and every field listed below
was read out of it, with the `href` of each method pointing at the official anchor.

## Auth model

`authKind: "token"`, but the token is **ours, not the user's**: `TELEGRAM_BOT_TOKEN` from the
environment is our single platform bot. The user's "credential" is simply the channel they add the
bot to. Nothing secret is pasted by the user, so `connectWithInputs` returns no `tokens`.

Base URL: `https://api.telegram.org/bot<token>/<METHOD>` (the token sits in the path, which is why
`redactUrl` in `src/http.ts` rewrites `/bot<token>` → `/bot***` before anything is logged).

## Connect + verify

- `getChat` (`chat_id`) → `ChatFullInfo { id, type: private|group|supergroup|channel, title?, username? }`
  <https://core.telegram.org/bots/api#getchat>
- `getMe` → `User { id, is_bot, first_name, username? }`
  <https://core.telegram.org/bots/api#getme>
- `getChatMember` (`chat_id`, `user_id`) → `ChatMember`. For our bot we require
  `status === "administrator"` **and** `can_post_messages === true` (an optional field, "for channels
  only"), or `status === "creator"`.
  <https://core.telegram.org/bots/api#chatmemberadministrator>

## Publishing

| case | method | notes |
| --- | --- | --- |
| text only | `sendMessage` | `text` 1-4096 chars **after entity parsing**, `parse_mode`, `link_preview_options` |
| 1 image | `sendPhoto` | `photo` accepts an **HTTP URL** (we pass the R2 url), `caption` 0-1024 chars |
| 1 video | `sendVideo` | `video` accepts an HTTP URL, `supports_streaming` |
| 2-10 items | `sendMediaGroup` | `media` is a **JSON-serialised array of 2-10** `InputMediaPhoto`/`InputMediaVideo`; only the first item carries the caption |

<https://core.telegram.org/bots/api#sendmessage> · <https://core.telegram.org/bots/api#sendmediagroup>

Caption limit is 1024 while a message is 4096, so when the composed body is longer than 1024 and
media is attached, we send the media without a caption and follow with a `sendMessage` carrying the
full text (link preview disabled so the album stays the hero).

### HTML escaping

We use `parse_mode: "HTML"`. Telegram's HTML mode treats `<`, `>` and `&` as markup, so
`escapeHtml()` replaces exactly those three with `&lt; &gt; &amp;` and nothing else; the post title
is then wrapped in `<b>…</b>`. Bare URLs are auto-linked by Telegram, so the composed link needs no
anchor tag.

## Errors and rate limits

Failures come back as `{ ok: false, error_code, description, parameters }` where
`ResponseParameters.retry_after` is "the number of seconds left to wait before the request can be
repeated" — `fetchJson` is given `retryAfterFrom: body.parameters.retry_after` so 429s honour it even
when the `Retry-After` header is absent.
<https://core.telegram.org/bots/api#responseparameters>

Mapped: 429/"Too Many Requests" → `rate_limited`; "Unauthorized" → `auth_expired`; "chat not found" →
`not_configured`; "not enough rights"/"bot was kicked" → `rejected`; "failed to get HTTP URL content"
→ `invalid_media`.

**Unverified assumption:** the documented broadcasting limits (~30 messages/second overall, ~20
messages/minute to one group or channel) are described in Telegram's FAQ rather than in the API spec
file I could read. `rateLimit` is set to 20/60s on that basis.

## Insights

None. The Bot API has no channel-statistics method (channel analytics exist only in the Telegram app
for channels above 500 subscribers, and are not exposed to bots). `fetchInsights` returns `[]` and
`capabilities.insights` is `false`.

## Review / audit

None. Creating a bot via @BotFather and adding it to a channel is instant. See `docs/app-reviews.md`.
