# Steam — assisted connector notes

Researched 2026-09-11. Confidence **high** for "no announcement posting API" (the Steamworks Web API
exposes app/news *reading*, inventory and auth, not announcement creation for third-party apps);
**medium-high** for the fees, Next Fest rules and dates, from
`packages/knowledge/platforms/steam.md`.

## Why assisted

`authKind: "assisted"`, `capabilities.manualPublish = true`. Announcements and events are created in
the Steamworks partner site. `publish()` prepares the title and the **BBCode** body and returns
`externalId = "manual:<post id>"`.

Steamworks *does* have native scheduling for events and announcements, which is better than ours
(it is attached to the store page), so the wizard tells the user to schedule inside Steamworks rather
than have us fire a reminder. `capabilities.nativeSchedule` stays `false` because *we* cannot drive it.

## Money and paperwork, before anything else

- **Steam Direct fee: $100 per app**, recoupable after $1,000 of adjusted gross revenue.
- Revenue share 30% (25% above $10M, 20% above $50M).
- Tax and banking paperwork gates release and takes longer than teams expect.

## Store page fields the wizard prefills

| Field | Limit |
| --- | --- |
| Short description | **300 characters** — search, queue and link embeds |
| About / full description | BBCode, no practical cap (metadata records 10,000) |
| Announcement title | ~100 characters |
| Announcement body | **BBCode**, images/GIFs/YouTube embeds supported |
| Tags | up to 20 (Steam uses the top 15) |
| Screenshots | at least 5, 1920x1080 |

## Next Fest — one per game, ever

Eligibility: unreleased and staying unreleased until after the fest, a public store page (Coming Soon
counts), a **playable demo live before the fest begins**, a Steamworks account in good standing, and
not a prologue/repackaged preview of an already-released title.

2026 editions: **23 Feb - 2 Mar**, **15-22 Jun**, **19-26 Oct**. Registration closes roughly **7-8
weeks before** (for the Oct 2026 edition: registration closed 31 Aug, demo recommended by 21 Sep, all
items in review by 5 Oct). These dates belong in the plan months ahead, which is the main reason this
connector's wizard exists at all.

## Discounts

Roughly 30 days between discounts and 30 days after release before the first one; launch discounts
are limited. Decide the launch discount before committing to a date.

## Insights

None. `fetchInsights()` returns `[]`. Wishlists, impressions and conversion live in the Steamworks
dashboard, which has no third-party API.
