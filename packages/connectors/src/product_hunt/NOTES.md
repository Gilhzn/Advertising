# Product Hunt — assisted connector notes

Researched 2026-09-11. Confidence **high** for "there is no posting API" (Product Hunt's GraphQL API
is documented as read-only for launches and every third-party scheduler requires manual submission);
**medium** for the numbers below, which come from `packages/knowledge/platforms/product_hunt.md`.
`producthunt.com` itself is reachable from this environment only intermittently, so nothing here was
machine-verified.

## Why assisted

`authKind: "assisted"`, `capabilities.manualPublish = true`. The GraphQL API can read launches,
comments and topics; it cannot **create** a launch. Every scheduler in this market submits by hand,
and so do we. See `src/assisted.ts` for the shared behaviour:
`publish()` makes no network call and returns `externalId = "manual:<post id>"` with no `url`.

## What the wizard prepares

| Field | Limit |
| --- | --- |
| Tagline | **60 characters** |
| Description | 260 characters (`PLATFORMS.product_hunt.maxChars`) |
| Gallery | 1-8 images at **1270x760** (5:3) |
| Thumbnail | 240x240 |
| Topics | 3 |
| Maker comment | 150-250 words by convention |

## The constraint everything is planned around

**Launch day starts at 00:01 Pacific** and runs exactly 24 hours; ranking is decided inside it. Product
Hunt's own UI can schedule a launch for a future date, and the recommendation is to schedule at least
a week ahead. A product may relaunch roughly every **6 months**, and only with a substantive update —
so the launch slot is a one-shot resource the planner has to spend deliberately.

## Rules that void the launch

Never solicit upvotes, anywhere, in any wording. Product Hunt detects and removes vote solicitation,
and it is the single most common reason a launch disappears. Ask for feedback instead.

## Insights

None. `fetchInsights()` returns `[]`. Upvotes and comments are read from the page by a human, or
later from the read-only GraphQL API if we decide it is worth an app registration (wave 3).
