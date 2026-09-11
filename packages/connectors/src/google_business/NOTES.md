# Google Business Profile — research notes

Researched 2026-09-11 for wave 2. **`developers.google.com` is blocked by the build proxy**, but the
`*.googleapis.com` **discovery documents are not** — so the three modern APIs below are verified from
Google's own machine-readable service definitions.

| Area | Confidence | Source |
| --- | --- | --- |
| `accounts.list` (v1) | **high (verified)** | `https://mybusinessaccountmanagement.googleapis.com/$discovery/rest?version=v1` |
| `accounts.locations.list` (v1) + mandatory `readMask` | **high (verified)** | `https://mybusinessbusinessinformation.googleapis.com/$discovery/rest?version=v1` |
| Performance API metrics + response shape | **high (verified)** | `https://businessprofileperformance.googleapis.com/$discovery/rest?version=v1` |
| OAuth endpoints | **high (verified)** | `accounts.google.com/.well-known/openid-configuration` |
| **v4 `localPosts.create` body** | **low-medium (unverified)** | v4 has **no discovery document** (404) — shape is from the brief + the playbook's doc link |
| Zero quota until approved, 300 QPM after | **medium** | `packages/knowledge/platforms/google_business.md` |

No `googleapis` dependency; four REST calls through `fetchJson`.

## Auth

Shared with YouTube via `src/google/oauth.ts`. One scope:
`https://www.googleapis.com/auth/business.manage`. Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

## Three APIs, two name shapes

This is the trap in this platform. Google split the old v4 API into per-concern v1 services, but
**Local Posts never moved** — so a single connector talks to three hosts, and the resource names do
not line up:

| Call | Host | Name shape |
| --- | --- | --- |
| list accounts | `mybusinessaccountmanagement.googleapis.com/v1/accounts` | `accounts/{id}` |
| list locations | `mybusinessbusinessinformation.googleapis.com/v1/{parent}/locations?readMask=…` | returns **`locations/{id}`** — no account prefix |
| create post | `mybusiness.googleapis.com/v4/{parent}/localPosts` | needs **`accounts/{a}/locations/{l}`** |
| performance | `businessprofileperformance.googleapis.com/v1/{location}:fetch…` | `locations/{id}` |

`localPostsParent(account)` re-joins `config.accountName` + `config.locationName` for the v4 call and
throws `not_configured` rather than guessing. `readMask` is a **required** query parameter on
`locations.list` and `locations.get` (verified in the discovery doc's parameter list).

## Publishing — v4 local posts

```
POST https://mybusiness.googleapis.com/v4/accounts/{a}/locations/{l}/localPosts
{ "languageCode": "en",
  "summary": "…",                                     // ≤ 1500 chars
  "topicType": "STANDARD",
  "callToAction": { "actionType": "LEARN_MORE", "url": "…" },
  "media": [ { "mediaFormat": "PHOTO", "sourceUrl": "https://…" } ] }
→ { name, searchUrl, state, createTime, … }
```

`externalId` is the returned `name`; the public URL is `searchUrl` (falling back to the location's
`mapsUri`). `config.actionType` overrides the CTA (`BOOK`, `ORDER`, `SHOP`, `SIGN_UP`, `CALL`).

Google truncates the card at roughly 250-300 characters before "Read more" even though the API limit
is 1,500 — front-loading is a copywriting rule, enforced upstream, not here.

Video is not supported by the Posts API (`PLATFORMS.google_business.supports.video` is already
`false`); only `mediaFormat: "PHOTO"`.

**This body shape is the least-verified thing in wave 2**: v4 publishes no discovery document, so it
could not be machine-checked. Re-verify against a live response the first time a real profile is
connected.

## Insights — the Performance API, not `reportInsights`

The brief asked for `localPosts/{name}/reportInsights` "if still available". It is part of the same
deprecated v4 surface and there is no discovery document for it, so rather than ship an unverifiable
call we use the **Business Profile Performance API**, which *is* fully verified:

```
GET https://businessprofileperformance.googleapis.com/v1/locations/{id}:fetchMultiDailyMetricsTimeSeries
    ?dailyMetrics=…&dailyRange.startDate.year=…&…
→ { multiDailyMetricTimeSeries: [ { dailyMetricTimeSeries: [ { dailyMetric, timeSeries: { datedValues: [ { date, value } ] } } ] } ] }
```

Mapping:

| DailyMetric | ours |
| --- | --- |
| `BUSINESS_IMPRESSIONS_{DESKTOP,MOBILE}_{MAPS,SEARCH}` (summed) | `impressions` |
| `WEBSITE_CLICKS` + `CALL_CLICKS` (summed) | `clicks` |

Two details straight out of the discovery doc: impressions are **only** reported split by surface and
device (there is no single total metric), and `DatedValue.value` **is absent when the value is
zero** — `sumSeries` treats a missing value as 0.

**Consequence: these are location-level, not post-level.** `fetchInsights` returns snapshots with no
`externalPostId`. Per-post Google Business metrics are not available through a supported API today;
recorded as a known gap.

## Access — the hardest gate in wave 2

A new Google Cloud project starts at **0 QPM — zero quota**. Nothing publishes, nothing reads, until
the GBP API access request form is approved (verified profile, real website, written use case);
approved projects show 300 QPM. `mapGoogleError` turns the `accessNotConfigured` 403 into
`not_configured` with that explanation rather than a generic rejection, and
`capabilities.privateUntilReview = true` marks the channel as gated in the UI.

`verify()` also surfaces `metadata.hasVoiceOfMerchant === false`, which is Google's flag for
"this profile is not currently eligible to show its content publicly".

See `docs/app-reviews.md`.
