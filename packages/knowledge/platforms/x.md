---
platform: x
updated: 2026-09-11
wave: 2
---
# X (Twitter)

## Audience & culture

X remains the fastest place for a piece of news to travel, and the default home of the tech, finance,
politics, sports and media conversation. Reach is heavily algorithmic and favours accounts with a Premium
subscription, high reply velocity, and content that keeps people on the platform.

Structural realities in 2026:
- **Posting costs money.** The API is pay-per-use by default: **$0.015 per post created, and $0.20 per post
  that contains a link.** Every scheduled post is a billable event, so the engine must treat X as a paid
  channel and surface the cost in the plan.
- **Links are penalised twice** - algorithmically (external links reduce reach) and financially (13x the API
  cost). The standard pattern is a link-free main post with the link in a self-reply.
- Reply velocity in the first 30 minutes is the dominant ranking signal.
- Long-form posts (Premium, up to 25,000 characters) exist but the culture still rewards 100-200 character
  posts. Threads outperform long-form for most business accounts.
- Community Notes apply to claims - an unsupported marketing claim can get publicly annotated.

## Formats that work

**Single post.** Under 280 characters unless Premium. One idea, no link. This is the highest ROI format and
the cheapest ($0.015).

**Thread.** 3-8 posts. Post 1 is a standalone hook; each subsequent post must survive being screenshotted
alone. Put the link in the final post. Cost: $0.015 x N, plus $0.20 for the post carrying the link.

**Quote post.** Add a real take to someone else's post. Cheap reach when the original is travelling.

**Image post.** Up to 4 images. 1600x900 (16:9) for landscape, 1080x1350 (4:5) for maximum feed height.
Alt text supported and worth adding.

**Video.** MP4/MOV. Up to 2:20 for standard accounts, up to 4 hours for Premium. Practically: 15-45 seconds,
9:16 or 1:1, captions burned in.

**Poll.** 4 options, 25 chars each, 5 minutes to 7 days. Cheap engagement, weak signal.

## Limits

| Thing | Limit |
|---|---|
| Post text | 280 characters (25,000 for Premium/Premium+) |
| Images per post | 4 (5 MB per photo, 15 MB GIF) |
| Video | 512 MB / 2:20 standard; Premium up to 4 hours / 16 GB |
| Alt text | 1,000 characters |
| Poll | 4 options x 25 chars, 5 min - 7 days |
| DM | 10,000 characters |
| **API cost - post created** | **$0.015** |
| **API cost - post containing a link** | **$0.20** |
| API cost - post read | $0.005 (capped at 2M reads/month) |
| API cost - user read | $0.010 |
| Posting cap (user) | 2,400 posts/day platform-side (unverified for API-created posts); legacy Basic allowed 3,000 posts/month per user, 50,000/month per app |
| Legacy tiers | Basic ($200/mo) force-migrated to pay-per-use after 1 June 2026; Pro ($5,000/mo) deprecated 14 Aug 2026 with migration from 1 Sep 2026; Enterprise from ~$42,000/mo |
| Native scheduling | available in the X UI for Premium; **not** via the pay-per-use API - the engine schedules and fires |

**Budget implication:** a 30-day campaign at 2 posts/day with one link post per day costs roughly
30 x ($0.015 + $0.20) = **~$6.45/month** in API fees. A thread-heavy strategy at 6 posts/day is ~$2.70/month
if link-free. This is small but non-zero and must appear in the plan; it is also a reason to prefer
link-in-reply (one $0.20 post per thread instead of several).

## Best times

All times UTC; **convert to the business timezone before scheduling.**

- **Weekday: 13:00-16:00 UTC** is the widest global overlap (US morning + EU afternoon) and the default for
  an English-language B2B/tech audience.
- **Metricool's 2026 study of 2M+ posts found 21:00 as the single best hour** (local time) - evening posts
  do unusually well on X relative to other platforms. Test both windows.
- **Secondary: 09:00-11:00 local** (commute/first coffee).
- **Best days: Tuesday, Wednesday, Thursday.** Weekend volume is low but so is competition.
- Post lifetime is short (30-120 minutes of meaningful distribution). Be present to reply for the first 30
  minutes or do not post.
- For Israel (UTC+3 summer): the US-overlap window 13:00-16:00 UTC is 16:00-19:00 local, which is a good
  evening slot domestically too.

## Hooks, structure & CTAs

280 characters means: one claim, one proof, no preamble. Delete every word that is not load-bearing.
"I think", "Just wanted to share", "In today's world" - all cut.

Hooks that work: a number, a strong claim you can defend, a screenshot, an unexpected pairing, a mistake.

CTAs: none in the main post. Put the ask in the self-reply with the link. On X, the ask *is* the cost.

### Skeleton 1 - single post, link in reply

```
Post 1 (no link, $0.015):
[Claim with a number]
[One line of mechanism]

Reply ($0.20):
Wrote up how we did it: [link]
```
Example shape:
```
Cut our cold start from 4.1s to 900ms.

The fix: we were re-parsing a 2MB config on every request instead of once at boot.

↓
```

### Skeleton 2 - thread (product launch)

```
1/ [The problem, no product name, with a number. Must work as a standalone post.]
2/ [Why existing solutions don't fix it - be fair to them]
3/ [What we built. First product mention. Screenshot or 15s clip.]
4/ [The one technical detail that proves it's real]
5/ [An honest limitation]
6/ [Link + "it's free / in beta / feedback welcome"]  <- the $0.20 post
```

### Skeleton 3 - visual drop (game / design)

```
[6-12 word caption in the product's voice]
[video, 9:16 or 1:1, 15-30s, captions burned in, loops]
[no hashtags, no link]

Reply: store / demo link
```

## Hashtag/keyword practice

- **0-1 hashtags.** Hashtags are largely decorative on X in 2026 and multiple hashtags read as spam. The
  exceptions are live events (`#WWDC`), recurring community rituals (`#screenshotsaturday`) and sports.
- **Keywords are what matter.** X search and the algorithm's topic model read plain text. Write the term
  ("Postgres", "roguelike", "fractional CFO") in a natural sentence.
- `$CASHTAGS` work for finance/crypto contexts and route into those feeds.
- Tagging relevant accounts (@handle) when the post is genuinely about them brings their audience; tagging
  big accounts for attention is reply-spam and gets muted.
- Alt text is indexed and is the right place to describe screenshots.

## Anti-spam & community rules

- NEVER post the same content from multiple accounts, or coordinate reposts between accounts we control.
- NEVER buy followers, engagement, or use engagement pods / "drop your link" reply chains.
- NEVER mass-DM or auto-DM new followers.
- NEVER reply to unrelated trending posts with a product link.
- NEVER post an unverified statistic or claim - Community Notes annotate them publicly and permanently.
- NEVER post more than 4 times a day from a business account without a live-event reason.
- NEVER publish financial, crypto or health outcome claims without the required disclosures.
- NEVER schedule a link post without the cost being accounted for - at $0.20 each, a runaway loop is a real financial incident.

Soft rules: reply to every reply in the first 30 minutes; quote-post to add, not to dunk; keep threads to
6 posts or fewer; use alt text; pin the best-performing launch thread to the profile.

## Good vs bad example

**Good**
```
We deleted our onboarding checklist and 7-day activation went up 12 points.

Turns out people don't want a progress bar, they want one prefilled example they can break.
```
Why: 158 characters, a real number, a mechanism, no link ($0.015), no hashtags, and an implicit invitation
to argue - which produces replies, which produces reach.

**Bad**
```
🚀 We're SO EXCITED to announce the launch of our REVOLUTIONARY new productivity app! 🎉
Download now and 10x your workflow! 👉 https://example.com/app 👈
RT if you agree! Follow for more productivity tips!
#productivity #app #startup #saas #tech #ai #entrepreneur #hustle
```
Why: costs $0.20 instead of $0.015 because of the link, announcement voice, unsubstantiated "10x" claim,
retweet solicitation, follow bait, 8 dead hashtags, and no information about what the app does.

## Sources

- X API pay-per-use pricing ($0.015/post, $0.20/post with link, Feb 2026 default): https://opentweet.io/blog/x-api-cost-2026
- X API tier changes 2026 (Basic migration 1 Jun 2026, Pro deprecation 14 Aug 2026): https://postproxy.dev/blog/x-api-pricing-2026/
- X API v2 manage-posts reference: https://docs.x.com/x-api/posts/creation-of-a-post
- X post character and media limits: https://help.x.com/en/using-x/how-to-tweet
- Best time to post on X, Metricool 2026 (2M posts, 21:00 peak): https://metricool.com/best-time-to-post-social-networks/
- X Rules and platform manipulation policy: https://help.x.com/en/rules-and-policies/platform-manipulation
