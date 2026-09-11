# Pinterest API v5 — research notes

Researched 2026-09-11 for wave 2. **`developers.pinterest.com` is blocked by the build proxy**, so
the wire format here is verified against **Pinterest's own sample client**,
`pinterest/api-quickstart@main` (`python/src/*.py`), whose methods carry the doc URL they implement
in a comment above each call.

| Area | Confidence | Source |
| --- | --- | --- |
| Hosts, `/v5/oauth/token` with HTTP Basic | **high (verified)** | `python/src/api_config.py`, `access_token.py` |
| Scope strings (`pins:write`, `boards:read`…) | **high (verified)** | `python/src/oauth_scope.py` |
| `POST /v5/pins` body + field limits | **high (verified)** | `python/src/pin.py::create` |
| `/v5/boards`, `/v5/user_account` | **high (verified)** | `python/src/board.py`, `user.py` |
| Analytics URLs + `metric_types` param name | **high (verified)** | `python/src/analytics.py` |
| Analytics **response** envelope (`summary_metrics`) | **medium** | not in the quickstart; handled defensively |
| `api-sandbox.pinterest.com` hostname | **low (unverified)** | from the brief; the quickstart only exposes `PINTEREST_API_URI` as an env override |
| Trial = sandbox-only, 1,000 req/day | **medium** | `packages/knowledge/platforms/pinterest.md` |

## Auth

- authorize: `https://www.pinterest.com/oauth/` with `client_id`, `redirect_uri`, `response_type=code`,
  **comma-separated** `scope`, `state`
- token / refresh: `POST https://api.pinterest.com/v5/oauth/token` with **HTTP Basic**
  `app_id:app_secret` (the quickstart builds exactly that header) and a form body

Scopes: `boards:read pins:read pins:write user_accounts:read`.
Env: `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`, optional `PINTEREST_SANDBOX=true`.

## Sandbox

`account.config.sandbox === true` swaps **every** API call to
`https://api-sandbox.pinterest.com` (`apiHost()`), and `PublishResult.visibility` becomes
`"private"` because a Trial-access pin is visible only to its creator.
`capabilities.privateUntilReview = true` for the same reason, and `verify()` returns a `warning`.

⚠ The sandbox **hostname** is the one unverified fact in this connector. If it turns out to be
wrong, it is a one-line change in `SANDBOX_API_HOST`; nothing else depends on it.

## Publishing — `POST /v5/pins`

Verified body shape and limits from `pin.py::create`:

```jsonc
{
  "board_id": "…",                 // required - from account.config.boardId
  "board_section_id": "…",         // optional
  "title":       "… ≤ 100",
  "description": "… ≤ 800",
  "alt_text":    "… ≤ 500",
  "link":        "… ≤ 2048",
  "media_source": { "source_type": "image_url", "url": "https://…" }
}
```

The quickstart's `OPTIONAL_ATTRIBUTES` dict is where those four limits come from
(`link: 2048, title: 100, description: 800, alt_text: 500`). Response is the pin resource with `id`;
the pin URL is `https://www.pinterest.com/pin/<id>/`.

`PLATFORMS.pinterest.maxChars` is 500, so `composeBody` composes to 500 and the description is then
capped at Pinterest's own 800 — the tighter of the two wins, which is what we want.

**Board selection** is part of the wizard: `exchangeCode` calls `GET /v5/boards?page_size=50`, stores
the list in `config.boards` and defaults `config.boardId` to the first one. The UI lets the user
change it; `publish` throws `not_configured` if it is missing, rather than guessing.

Video pins are out of scope for wave 2: they need `POST /v5/media` (`media_type: "video"`), a
multipart upload to the returned `upload_url` with `upload_parameters`, and polling
`GET /v5/media/{id}` until `status === "succeeded"` before the pin can reference `media_id`. The
quickstart implements it (`pin.py::upload_media`) if we want it later.

## Insights

- `GET /v5/pins/{id}/analytics?start_date&end_date&metric_types=IMPRESSION,SAVE,PIN_CLICK`
- `GET /v5/user_account/analytics?start_date&end_date&metric_types=…`

Dates are `YYYY-MM-DD` (UTC) and both ends are required — `since` is converted; the default window is
the last 30 days.

The **response** shape is the one thing the quickstart does not pin down: v5 returns one entry per
split (`"all"`, or a breakdown key such as `APP_TYPE`), each holding a `summary_metrics` map. Rather
than guessing the exact key casing, `collectSummaryMetrics()` walks the payload for any
`summary_metrics` object and flattens it. Mapping:

| Pinterest | ours |
| --- | --- |
| `IMPRESSION` | `impressions` |
| `SAVE` | `saves` |
| `PIN_CLICK` | `clicks` |

Anything else in the payload (e.g. `OUTBOUND_CLICK`) is ignored so one Pinterest response never
produces two snapshots of the same metric.

## Rate limits

Trial access: **1,000 requests/day for the whole app**. Standard: 100 requests/second per user per
app. Our `rateLimit` is 50/day per account, which keeps several connected accounts inside the trial
budget.

## Review

**Standard access needs an app review**, including a screen recording of the app performing a
Pinterest API action. Until then everything is sandbox-only. See `docs/app-reviews.md`.
