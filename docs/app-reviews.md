# Platform review, audit and access gates

What each platform requires before a **third party** (someone who is not on our developer account) can
connect their own account through the product, and what already works in development mode.

Compiled 2026-09-11 while building `packages/connectors` wave 1. Per-platform API details and their
sources live in `packages/connectors/src/<platform>/NOTES.md`.

> **Source confidence.** Bluesky, Telegram and Discord below were verified against primary artefacts
> (the `bluesky-social/atproto` lexicons and PDS source, the generated Telegram Bot API spec, and the
> `discord/discord-api-docs` repository). The **Meta family (Facebook, Instagram, Threads) and
> LinkedIn were not**: `developers.facebook.com` and `learn.microsoft.com` are blocked from the build
> environment, so those rows come from secondary sources and long-standing platform behaviour.
> Re-verify them before the first customer onboarding.

## Summary

| Platform | Review needed for third parties | Works today without review | Lead time |
| --- | --- | --- | --- |
| Bluesky | **None** | Everything | — |
| Telegram | **None** | Everything | — |
| Discord (webhooks) | **None** | Everything | — |
| Facebook Page | **App Review + Business Verification** | Own Pages, for users with an app role | 1-6 weeks |
| Instagram | **App Review + Business Verification** (same Meta app) | Own linked accounts, for users with an app role | 1-6 weeks |
| Threads | **Tech Provider verification** (separate Threads app) | Own account, for users with an app role | weeks |
| LinkedIn (personal) | **None** for personal posting | Everything self-serve | — |
| LinkedIn Company Page | Community Management API partner approval | Nothing | wave 2 |
| X, Reddit, TikTok, YouTube, Pinterest, Google Business | wave 2 — see the table at the end | | |

---

## Wave 1

### Bluesky — no gate at all

There is no developer program, no app registration, no review and no quota application. A user
creates an **app password** (Settings → Privacy and security → App passwords) and pastes it with their
handle; `com.atproto.server.createSession` works immediately.

Limits are per-account and enforced by their PDS, not by an approval process: `createSession` 300/day
per account and 30 per 5 minutes per IP; repo writes share 5,000 points/hour and 35,000 points/day
where a record creation costs 3 points (≈1,666 posts/hour). Verified in
`packages/pds/src/rate-limits.ts` and `createSession.ts` in `bluesky-social/atproto`.

- <https://bsky.app/settings/app-passwords>
- <https://github.com/bluesky-social/atproto/blob/main/packages/pds/src/rate-limits.ts>

### Telegram — no gate at all

The bot is **ours**, created once via [@BotFather](https://t.me/BotFather) and configured through
`TELEGRAM_BOT_TOKEN`. Users never register anything; they add our bot to their channel as an
administrator with "Post messages". No review, no quota application, instant.

Broadcast limits (~30 messages/second overall, ~20 per minute to one chat) are documented in
Telegram's FAQ rather than the API spec and are enforced with 429 + `parameters.retry_after`.

- <https://core.telegram.org/bots/api>
- <https://core.telegram.org/bots/faq#broadcasting-to-users>

### Discord — no gate for webhooks

Incoming webhooks "do not require a bot user or authentication to use" — the user creates one in
Channel settings → Integrations → Webhooks and pastes the URL. No application, no verification, no
review.

(Only a **bot** application with privileged intents needs Discord's verification, and only once it is
in 100+ servers. We do not use a bot in wave 1.)

- <https://github.com/discord/discord-api-docs/blob/main/developers/resources/webhook.mdx>
- <https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks>

### Facebook Pages — App Review

**Development mode works now** for anyone who has a role on our Meta app (admin, developer or tester)
and is publishing to their own Page. That covers dogfooding and design partners.

**Public use requires App Review** for each of `pages_manage_posts`, `pages_read_engagement`,
`read_insights` and `business_management` (plus `instagram_basic`, `instagram_content_publish`,
`instagram_manage_insights` for the Instagram connector, which shares the app). Expect to supply:

- a screencast of the full connect → publish → analytics flow for every permission requested,
- a written use case per permission,
- a live privacy policy URL, data deletion callback and terms URL,
- **Business Verification** of the legal entity (company documents), and
- a Data Use Checkup every 12 months thereafter.

Also on the roadmap risk list: Meta is actively retiring Page and post insights metrics (a batch on
15 Nov 2025 and another on 15 June 2026). The connector requests old and new metric names in separate
calls and tolerates a 400 on either, but the mapping in
`packages/connectors/src/facebook/index.ts` needs re-checking against live responses.

- <https://developers.facebook.com/docs/app-review/>
- <https://developers.facebook.com/docs/development/release/business-verification>
- <https://developers.facebook.com/blog/post/2025/08/15/page-insights-api-updates/>

### Instagram — same Meta app, same App Review

No separate submission from Facebook if both are in one app, but the Instagram permissions are
reviewed individually.

Two hard product prerequisites that no review can substitute for and which the wizard must enforce:

1. the Instagram account must be **Business or Creator** (not personal), and
2. it must be **linked to a Facebook Page**.

Platform-level ceiling that applies even after review: **100 API-published posts per rolling 24
hours** per Instagram account (a carousel counts as one). This is implemented as the connector's
`rateLimit`.

- <https://developers.facebook.com/docs/instagram-platform/content-publishing/>

### Threads — Tech Provider verification

The Threads API is a **separate app configuration with its own App ID and secret** — Meta's own sample
app opens with that warning. Third-party use requires Meta's **Tech Provider verification**; until
then only users with a role on the app can complete the OAuth flow.

Reported ceiling: 250 published posts per 24 hours per user (secondary source).

- <https://github.com/fbsamples/threads_api>
- <https://developers.facebook.com/docs/threads>

### LinkedIn — self-serve for personal profiles

Create an app at <https://www.linkedin.com/developers/apps>, associate it with a Company Page (the
Page must exist; it is not what we post to), and request two **products**:

- *Sign In with LinkedIn using OpenID Connect* → `openid`, `profile`
- *Share on LinkedIn* → `w_member_social`

Both are granted automatically — **no review** — and that pair is everything the wave-1 connector
needs. Verifying the associated Company Page speeds up the product grant.

**Not self-serve:** posting to a Company Page, and any organic analytics
(`organizationalEntityShareStatistics`), both of which live behind the **Community Management API**
partner program. That is why `linkedinConnector.fetchInsights` returns `[]`. Moving Company Pages
into scope is a wave-2 decision with an approval lead time.

Operational note: `LinkedIn-Version: YYYYMM` is mandatory on every `/rest/` call and LinkedIn only
supports a rolling window of versions, so `LINKEDIN_API_VERSION` has to be bumped on a schedule or
publishing starts 400-ing.

- <https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api>
- <https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/protocol-version>

---

## Wave 2 — summary

(Implemented 2026-09-11. The detailed section is further down; this table is the one-line version.)

| Platform | Gate | What works before it |
| --- | --- | --- |
| X (Twitter) | No review, but the API is **pay-per-use** (~$0.015/post, ~$0.20 with a link) | Everything, once billing is attached |
| Reddit | New API apps need **manual approval**; community posts always need human approval on our side (90/10 rule) | Nothing until approved |
| TikTok | **Content Posting API audit** (2-4 weeks). Unaudited apps can only post `SELF_ONLY` (private) | Private posts only → connectors set `capabilities.privateUntilReview` |
| YouTube | **Compliance audit**. Until it passes, uploads are forced private | Private uploads only |
| Pinterest | **Trial access is sandbox-only** until review | Sandbox only |
| Google Business Profile | Project starts with **zero quota** until access is approved | Nothing |
| Product Hunt / Hacker News / itch.io / Steam | No posting API at all | Assisted mode: we prepare the copy, the user posts |

## Environment variables the wave-1 connectors read

Already in `.env.example`: `META_APP_ID`, `META_APP_SECRET`, `LINKEDIN_CLIENT_ID`,
`LINKEDIN_CLIENT_SECRET`, `TELEGRAM_BOT_TOKEN`.

**Still missing from `.env.example`** (owner of that file: please add them):

| Variable | Required? | Default | Used by |
| --- | --- | --- | --- |
| `THREADS_APP_ID` | yes, for Threads | — | Threads OAuth — **not** the same as `META_APP_ID` |
| `THREADS_APP_SECRET` | yes, for Threads | — | Threads OAuth |
| `TELEGRAM_BOT_USERNAME` | no | `your_advertising_bot` | wizard copy ("add @x as admin") |
| `META_GRAPH_VERSION` | no | `v22.0` | Graph API version for Facebook + Instagram |
| `META_LOGIN_CONFIG_ID` | no | unset | Facebook Login for Business configuration id |
| `LINKEDIN_API_VERSION` | no | `202505` | mandatory `LinkedIn-Version` header |
| `CONNECTOR_RETRY_TIME_SCALE` | no (tests only) | `1` | multiplies every retry sleep; tests set `0` |

## Action list before the first external customer

1. Submit the Meta app for App Review (Facebook + Instagram permissions) and start Business
   Verification — this is the longest pole.
2. Submit the separate Threads app for Tech Provider verification.
3. Re-verify every Meta insights metric name in this repo against live Graph responses; the June 2026
   deprecations are already in effect.
4. Put `LINKEDIN_API_VERSION` and `META_GRAPH_VERSION` on a quarterly review reminder.
5. Nothing to do for Bluesky, Telegram or Discord.

---

# Wave 2 — detail

Compiled 2026-09-11 while building `packages/connectors` wave 2 (X, Reddit, TikTok, YouTube,
Pinterest, Google Business Profile), the four assisted platforms and the optional Late aggregator.
Per-platform API details and their sources are in `packages/connectors/src/<platform>/NOTES.md`.

> **Source confidence.** Most vendor developer portals are blocked from this build environment
> (`developer.x.com`, `docs.x.com`, `reddit.com/dev/api`, `developers.tiktok.com`,
> `developers.pinterest.com`, `developers.google.com`, `getlate.dev`). Where a **primary artefact**
> was reachable it was used and is named below: X's own sample code and SDK schemas, PRAW, Pinterest's
> own quickstart, and Google's machine-readable discovery documents. Two things could not be verified
> at all and are flagged: the **v4 Google local-posts body** and **everything about Late**.

## Summary — what each wave-2 platform needs

| Platform | Gate for third parties | Works before it | Lead time | Cost |
| --- | --- | --- | --- | --- |
| X (Twitter) | **No review.** Needs a developer account, an app with OAuth 2.0 user auth, and **a payment method** | Everything, once billing is attached | hours | **$0.015/post, $0.20 if it contains a link** |
| Reddit | New API apps need **manual approval**; commercial use needs a Reddit **agreement** (~$0.24/1k calls reported) | Nothing until the app is approved | days–weeks | free below 100 QPM for non-commercial use |
| TikTok | **Content Posting API audit** (demo video + published privacy policy) | `SELF_ONLY` (private) posts, max 5 users | 2–4 weeks | free |
| YouTube | **API compliance audit** | Private uploads only | 2–4 weeks | free within quota |
| Pinterest | **Standard access review** (needs a screen recording of the app calling the API) | Sandbox only — pins visible to their creator | weeks | free |
| Google Business Profile | **GBP API access request** — a new project has **0 QPM** | **Nothing at all** | days–weeks | free |
| Product Hunt / Hacker News / itch.io / Steam | No posting API exists | Assisted mode only | — | Steam: **$100 Direct fee/app** |
| Late (getlate.dev) | None from us — a paid third-party subscription the customer holds | — | — | Late's plan pricing |

## Sandbox / private behaviour, per connector

What the connector actually does before the gate clears — this is the part the wizard and the
publisher have to agree on.

| Connector | `capabilities` flag | Behaviour before approval |
| --- | --- | --- |
| `tiktok` | `privateUntilReview: true` | `resolvePrivacyLevel()` **forces `SELF_ONLY`** unless `config.audited === true`, whatever `config.privacyLevel` says. `PublishResult.visibility: "private"`. `verify()` returns a `warning`. |
| `youtube` | `privateUntilReview: true` | `status.privacyStatus: "private"` unless `config.audited === true`. `verify()` returns a `warning`. |
| `pinterest` | `privateUntilReview: true` | `config.sandbox === true` swaps **every** call to `api-sandbox.pinterest.com` and reports `visibility: "private"`. |
| `google_business` | `privateUntilReview: true` | Nothing publishes at all; the zero-quota 403 (`accessNotConfigured`) is mapped to `not_configured` with that explanation rather than a generic rejection. |
| `x` | — | No gate. `capabilities.costPerPostUsd` and `estimatedCostUsd(post)` expose the fee instead. |
| `reddit` | — | No private mode. `publish()` refuses a post without `post.communityRef` (`ConnectorError("rejected")`), so a community post can never bypass human approval. |
| assisted ×4 | `manualPublish: true` | No network call ever. `publish()` returns `externalId = "manual:<post id>"`, no `url`. |

`config.audited` / `config.sandbox` are **operator-set flags on the account row**, flipped by hand
once the audit or access grant actually lands. They default to "not yet approved", so the failure
mode is a private post rather than a surprise public one.

## Cost and visibility notes

- **X is the only platform that charges per post.** The connector adds an optional
  `Connector.estimatedCostUsd(post)` which splits the thread exactly the way `publish` will and
  charges $0.20 for each part carrying the link, $0.015 for the rest — so a 6-post thread with the
  link in the last post is **$0.275**, not $0.09. The publisher and the dashboard should show this
  before sending, and the planner should prefer link-in-reply (one $0.20 post per thread).
  A runaway scheduling loop on X is a real financial incident, which is why `rateLimit` is a
  deliberately tight 25 per 15 minutes.
- **Steam costs $100 per app** (Steam Direct, recoupable after $1,000 of adjusted gross revenue) plus
  the 30% revenue share. Not per post, but it belongs in the plan.
- **Reddit's commercial terms** (~$0.24 per 1,000 calls reported, enterprise entry reported at
  ~$12,000/mo) apply to commercial use of the Data API. Our usage is borderline and **must be
  reviewed with Reddit before the first paying customer**.
- **Late** is a paid third-party subscription held by the customer. Posts, media URLs and the
  platform OAuth tokens live in Late's infrastructure — the wizard says so and the caveat tells the
  user not to route a platform through Late if that is unacceptable.
- Everything else (TikTok, YouTube, Pinterest, Google Business, the assisted four) is free within
  quota.

## Per-platform notes

### X — no review, but attach a card

There is no app review for posting. The gates are a developer account, a project + app with **OAuth
2.0 user authentication** configured (type *Web App*, with our callback URL), and a payment method.

One deviation from the plan: the connector requests **`media.write` in addition to**
`tweet.read tweet.write users.read offline.access`. X's own media sample requests it, and the v2
media INIT call is refused without it. `offline.access` is what produces the refresh token.

Verified against `xdevplatform/samples@main:python/media/media_upload_v2.py` and
`xdevplatform/xdk-python@main` (`oauth2_auth.py`, `schemas.py`) — X's own repositories.
The v2 chunked upload (`POST /2/media/upload`, INIT/APPEND/FINALIZE/STATUS) **is confirmed**, so no
v1.1 `upload.json` fallback was needed.

### Reddit — app approval, plus a commercial agreement question

New API apps need manual approval before they work for anyone but their owner. Separately, Reddit's
Data API terms require an agreement for **commercial** use; reported pricing is ~$0.24 per 1,000
calls. **This is an open legal question for this product, not just a technical one.**

Operational requirements the connector enforces:

- `duration=permanent` on the authorize URL, or there is no refresh token.
- HTTP Basic client credentials on the token call.
- A descriptive `User-Agent` (`adv-engine/0.1 by <handle>`) on **every** call including the token
  exchange — Reddit throttles and eventually blocks default user agents.
- `post.communityRef` is mandatory; `publish` throws `rejected` without it.
- `verify()` returns the new optional `warning` when the account is **under 30 days old**, under 50
  comment karma, or suspended — the thresholds that get posts removed.

Image posts are **not** implemented. The asset-lease flow (`/api/media/asset.json`) is verified, but
`/api/submit` with `kind=image` returns a `websocket_url` instead of the post id — PRAW opens a
WebSocket to learn where the post landed. Wave 2 ships self and link posts; see the connector's
NOTES.md.

### TikTok — the audit is the whole story

Unaudited clients can only create `SELF_ONLY` posts, for at most 5 users. The audit takes 2–4 weeks
and wants a demo video of the posting flow and a published privacy policy.

Second requirement people miss: Direct Post uses `PULL_FROM_URL`, and TikTok will only fetch media
from a **domain verified in the developer portal**. The media CDN hostname (our R2 public domain) has
to be added there or every post fails with `url_ownership_unverified`.

### YouTube — audit, and a quota number that changed

Until the compliance audit passes, uploads are forced private by YouTube regardless of what we send.

Quota, **verified as changed**: since **1 June 2026** `videos.insert` costs 1 unit against its own
bucket capped at **100 calls/day per Cloud project** (it used to be ~1,600 units out of the 10,000/day
pool). `PLATFORMS.youtube.caveat` in `packages/shared` still describes the old model — see the
"Requested `PLATFORMS` changes" note at the end.

Also enable the **YouTube Analytics API** alongside the Data API; `yt-analytics.readonly` is requested
now so a later analytics addition does not need a re-consent.

### Pinterest — trial access is invisible

A new app gets **Trial access**, which is sandbox-only: pins and boards it creates are visible only to
their creator, and the whole app shares 1,000 requests/day. Standard access needs a review that
includes a **screen recording of the app performing a Pinterest API action**.

The connector's `config.sandbox` switches host and marks visibility, so the product never claims a
sandbox pin is live.

### Google Business Profile — the hardest gate in wave 2

A new Google Cloud project starts at **0 QPM — zero quota**. Nothing reads, nothing publishes, until
the GBP API access request form is approved. Approval expects a **verified** profile, a real business
website and a written use case; an approved project shows 300 QPM.

Enable three APIs: My Business Account Management (v1), My Business Business Information (v1), and
My Business (**v4**, for local posts, which never moved off the legacy surface).

Two honest caveats recorded in the connector:

1. The **v4 `localPosts` request body could not be machine-verified** — v4 publishes no discovery
   document. Re-verify it against a live response at the first real connection.
2. **Post-level insights no longer exist** through a supported API. `fetchInsights` uses the
   **Business Profile Performance API** (`fetchMultiDailyMetricsTimeSeries`, fully verified) and
   returns **location-level** `impressions` and `clicks` with no `externalPostId`.

### Product Hunt, Hacker News, itch.io, Steam — no API, by design

None of these has a posting API: Product Hunt's GraphQL API is read-only for launches, HN's Firebase
API is read-only, itch.io's `butler` pushes builds rather than posts, and the Steamworks Web API does
not expose announcements to third parties. The shared helper is
`packages/connectors/src/assisted.ts`; `publish()` makes **no network call** and returns
`externalId = "manual:<post id>"` with `visibility: "public"` and no `url`, and the worker shows
these as *prepared for manual posting*.

Timing constraints that belong in the plan rather than the connector: Product Hunt launch day starts
**00:01 Pacific** and a product may relaunch only every ~6 months; Steam **Next Fest is one per game,
ever**, with registration closing 7–8 weeks ahead (2026 editions: 23 Feb–2 Mar, 15–22 Jun,
19–26 Oct).

### Late (getlate.dev) — optional fallback route, unverified

A generic aggregator connector (`createLateConnector(platform)`) that maps our post onto
`POST /v1/posts`. It is **off unless `LATE_API_KEY` is set**, and then used only for accounts whose
row says `config.via === "late"` — `resolveConnector(platform, account)` in `all.ts` does the routing.
It is never put in the registry, because the registry has one slot per platform and registering Late
would silently replace the first-party connector for every business on the deployment.

**Everything about Late is unverified**: `getlate.dev` is blocked, and the request shape comes from a
GitHub mirror of Late's own published skill docs. The response shape in particular is a guess (the
connector accepts several id spellings). Treat this route as experimental until someone runs it
against a live key.

## Environment variables the wave-2 connectors read

**None of these are in `.env.example` yet** (owner of that file: please add them).

| Variable | Required? | Used by |
| --- | --- | --- |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | yes, for X | X OAuth 2.0 (PKCE, confidential client) |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | yes, for Reddit | Reddit OAuth (HTTP Basic token exchange) |
| `REDDIT_OWNER_HANDLE` | no | fallback for the mandatory `User-Agent` when an account has no handle yet |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | yes, for TikTok | Login Kit. Note: **`client_key`**, not `client_id` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | yes, for YouTube **and** Google Business | one Google OAuth client serves both connectors |
| `PINTEREST_APP_ID` / `PINTEREST_APP_SECRET` | yes, for Pinterest | v5 OAuth (HTTP Basic token exchange) |
| `PINTEREST_SANDBOX` | no (`true` while on Trial access) | picks the sandbox host during `exchangeCode`/`refresh`; per-account it is `config.sandbox` |
| `LATE_API_KEY` | no | **feature flag** for the Late aggregator; unset = the route does not exist |

## Action list before the first external customer (wave 2)

1. **Google Business Profile** access request — longest pole, and the only platform where nothing at
   all works before approval.
2. **TikTok** Content Posting API audit, and verify the media CDN domain in the TikTok portal.
3. **YouTube** compliance audit.
4. **Pinterest** Standard access review (record the screencast while building the demo).
5. **Reddit**: get the app approved, and get a decision on whether our use is "commercial" under
   their Data API terms.
6. **X**: attach billing, then put a spend alarm on it — `estimatedCostUsd` is only a forecast.
7. Re-verify the **v4 Google local-posts body** and **the entire Late integration** against live
   responses; both are marked unverified in their NOTES.md.
8. Flip `config.audited` / `config.sandbox` on the affected account rows as each approval lands —
   nothing does it automatically, on purpose.
