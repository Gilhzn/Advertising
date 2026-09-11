---
platform: threads
updated: 2026-09-11
wave: 1
---
# Threads

## Audience & culture

Threads is Meta's text network, seeded from Instagram and now with its own distinct culture: lighter and
funnier than LinkedIn, less combative than X, more mainstream than Bluesky. Distribution is
**algorithmic and heavily non-follower-weighted** - a good post from a 200-follower account routinely
reaches tens of thousands. That makes Threads the best organic reach-per-effort of any wave-1 platform in
2026 for text content.

Cultural notes:
- Conversational, first-person, a bit chaotic. Questions genuinely work here (unlike everywhere else).
- **Replies are the currency.** The algorithm weights replies far above likes, and replying to other
  people's threads is the single fastest growth mechanic. Budget half your Threads time for replies.
- Links are no longer suppressed the way they were at launch, but a post whose entire content is a link
  still underperforms. Lead with the idea; the link is the footnote.
- Follower count is loosely coupled to reach. Do not optimise for followers; optimise for good posts.
- Topic tags (one per post) route posts into topic feeds - this is Threads' discovery lever.
- The audience overlaps Instagram: consumer, creator, marketing, product, culture. Developer tooling does
  less well here than on Bluesky or X.

## Formats that work

**Single text post.** 500 characters. This is the default and the highest-leverage format. One idea, a
clear opinion or a concrete observation.

**Thread (self-reply chain).** Post 1 stands alone; posts 2-4 add detail. Threads' UI shows the chain
inline, so longer chains read better here than on Bluesky.

**Text + single image.** Screenshots, charts, before/afters. A chart with one surprising line is the most
reliably viral Threads artefact.

**Carousel.** Up to 20 items via the API (images, videos or a mix) - counts as one post against the daily
cap. Good for a quick visual list.

**Video.** Up to 5 minutes; vertical 9:16 or 1:1. Short (under 30s) works best; Threads video is not a
primary surface the way Reels are on Instagram.

**Question post.** "What's the worst onboarding you've ever seen?" - genuinely generates replies, which
generates reach, which makes your next post land. Use once or twice a week, never daily.

## Limits

| Thing | Limit |
|---|---|
| Post text | 500 characters |
| Images per post | up to 20 in a carousel; 1 for a standard image post |
| Video | up to 5 minutes |
| Links | 1 link per post renders a preview card |
| **Publishing rate limit** | **250 API-published posts per rolling 24 hours per profile** (a 20-item carousel counts as 1) |
| Replies rate limit | 1,000 replies per rolling 24 hours |
| Deletions | 100 per rolling 24 hours |
| Live quota check | `GET /{threads-user-id}/threads_publishing_limit` returns `quota_usage`, `reply_quota_usage`, `delete_quota_usage` |
| Account requirement | a Threads profile (created from an Instagram account) |
| Native scheduling | not available via API - the engine schedules and fires |
| Cost | free (the Threads API is free, rate-limited rather than metered) |

Practical cap for a business account: **1-3 posts per day plus replies.** The 250 limit exists for
multi-tenant tools, not as a target.

## Best times

All times UTC; **convert to the business timezone before scheduling.**

- **Morning: 07:00-09:00 local** - Threads is a first-thing-in-the-morning phone app.
- **Midday: 12:00-14:00 local.**
- **Evening: 19:00-22:00 local** - strongest window for consumer topics.
- **Best days: Tuesday-Thursday.** Sunday evening is unusually strong (people scrolling before the week).
- Post lifetime is longer than X or Bluesky - a Threads post can keep accumulating for 24-48 hours, so
  timing matters less than post quality. Do not over-tune.
- For Israel (UTC+3 summer / UTC+2 winter): 20:00 local = **17:00 UTC** in summer.

## Hooks, structure & CTAs

500 characters is a constraint that helps: one idea, stated plainly, with a specific detail that proves you
know what you are talking about.

Hooks that work: a contrarian but defensible opinion; an oddly specific number; a small confession; a
question you actually want answered; "nobody talks about X".

CTAs: soft or none. Threads punishes salesy endings. The best CTA is often a question that invites replies,
with the link in a self-reply.

### Skeleton 1 - opinion with proof

```
[Contrarian claim in one line]

[One sentence of evidence with a real number]

[One sentence of nuance - what you are NOT saying]

[Optional question inviting replies]
```
Example shape:
```
Onboarding checklists don't work. They make people feel watched.

We removed ours and 7-day activation went up 12 points. The thing that actually helped was
one prefilled example project.

Not saying checklists never work - if the product is genuinely multi-step, sure.

What's the last checklist you actually finished?
```

### Skeleton 2 - build in public

```
[What you shipped / broke, in one line]

[The interesting technical or human detail]

[What you'd do differently]
```
Put the link in a **self-reply**, not the main post, when you want maximum reach on the idea.

### Skeleton 3 - visual drop

```
[One line of framing, under 100 chars]
[Image: chart, screenshot, before/after]
[One line of detail that the image does not say]
```

## Hashtag/keyword practice

Threads has a deliberately minimal tag system:
- **One topic tag per post.** Threads allows a single tag per post; it behaves as a topic, not a hashtag
  cloud. Pick the one that best routes the post: `gamedev`, `design`, `smallbusiness`, `books`.
- Multi-word tags are allowed and read naturally (`#buildinginpublic`).
- Do not carry Instagram's hashtag block over - a Threads post ending in 8 hashtags is instantly recognised
  as cross-posted and gets ignored.
- **Keywords in the text** drive Threads search and topic classification. Write the term you want to be
  found for in a normal sentence.
- Tagging other accounts (`@handle`) when the post is genuinely about or to them works well; tagging for
  attention does not.

## Anti-spam & community rules

- NEVER exceed 250 API-published posts or 1,000 replies per rolling 24 hours per profile.
- NEVER cross-post an identical body from Instagram, X or LinkedIn - Threads users recognise and ignore it.
- NEVER add more than one topic tag, or append an Instagram-style hashtag block.
- NEVER reply to unrelated popular threads with a product link (reply-spam is the fastest route to being muted and reported).
- NEVER publish branded or paid content without the Paid Partnership label (Meta branded-content policy applies to Threads).
- NEVER post engagement bait ("repost if you agree", "follow for part 2").
- NEVER post more than 3 times a day from a business account.

Soft rules: reply to every reply; spend more time replying to others than posting; keep the voice
first-person and human - the account bio should name the person behind it; do not delete underperforming
posts (Threads posts often pick up 24h later).

## Good vs bad example

**Good**
```
Our free trial converts 3x better at 7 days than at 14.

Same product, same emails. At 14 days people forget they signed up; at 7 they're still in
the problem that made them try it.

We fought about this for a month and the shorter one won on every cohort.
```
Why: specific, a real number, a small internal admission, no link, no hashtags, and it invites a reply from
everyone who has ever argued about trial length.

**Bad**
```
🚀 Excited to announce our new AI-powered platform is LIVE! Sign up today and transform
your workflow! 🔥 Limited time: 50% off! Link in bio! Follow for more growth tips!
#saas #ai #startup #growth #marketing #entrepreneur #business #tech
```
Why: announcement voice, three CTAs, invented scarcity, hashtag block from Instagram, "AI-powered platform"
says nothing, and "Follow for more growth tips" is engagement bait.

## Sources

- Threads API overview and publishing: https://developers.facebook.com/documentation/threads/overview
- Threads rate limits (250 posts / 1,000 replies / 100 deletes per 24h): https://developers.facebook.com/documentation/threads/troubleshooting/#rate-limiting
- Threads API rate limits summary 2026: https://www.blotato.com/blog/threads-api-pricing
- Threads publishing limit endpoint: https://developers.facebook.com/documentation/threads/insights
- Threads Community Guidelines (Instagram guidelines apply): https://help.instagram.com/477434105621119
- Best times to post 2026: https://buffer.com/resources/best-time-to-post-social-media/
