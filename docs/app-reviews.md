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

## Wave 2 (not implemented yet — recorded so the plan stays honest)

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
