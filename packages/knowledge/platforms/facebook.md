---
platform: facebook
updated: 2026-09-11
wave: 1
---
# Facebook Page

## Audience & culture

Facebook in 2026 is two different products wearing one name:

1. **The Page feed** - low organic reach (1-3% of followers is normal for a small Page), mostly useful as a
   credibility surface, a review destination, and the cheapest paid-distribution entry point. Nobody
   "discovers" a Page organically at scale any more.
2. **Groups** - where the actual attention is. Local buy/sell groups, city groups, profession groups, hobby
   groups, parent groups. Groups are communities we do **not** own; every post there needs human approval
   and must follow that group's rules (most ban promotion outright or restrict it to one weekly thread).

Age skew is 30-65+. It is the strongest platform for **local businesses**, events, services, B2C retail and
community organisations; it is weak for developer tools and early-stage SaaS.

Cultural notes:
- Personal voice from a named human outperforms brand voice. A post from the owner's profile that links to
  the Page beats the same text posted by the Page.
- Native video and photo carousels get more reach than link posts. A bare external link is the
  lowest-reach format there is - put the link in the first comment only when reach matters more than
  click-through, but do not pretend that is free: it reduces clicks too.
- Reels are the growth surface. Facebook pushes Reels into non-follower feeds far more aggressively than
  feed posts.
- Comments are weighted heavily. A post that gets 12 real comment threads outperforms one with 300 likes.
- Reviews/Recommendations on the Page are a real ranking and conversion input for local businesses.

## Formats that work

**Photo post.** 1200x630 (1.91:1) for link-style images, 1200x1200 (1:1) or 1080x1350 (4:5) for feed
presence. 4:5 occupies the most vertical space in the mobile feed. JPEG/PNG, keep under 8 MB.

**Carousel (multi-photo).** 2-10 images, 1:1 each. Works for product ranges, step-by-step, before/after,
event recaps.

**Reel.** 9:16, 1080x1920, up to 90 seconds for maximum distribution (longer is allowed but travels less).
Hook in the first 2 seconds, captions burned in, no TikTok watermark (Facebook demotes watermarked reuploads).

**Native video (feed).** 16:9 or 1:1, 1-3 minutes, uploaded natively. Never post a YouTube link and expect
reach.

**Link post.** OG image 1200x630, plus 1-3 lines of your own framing. Lowest organic reach; use when the
click is the point and you are willing to pay for distribution.

**Event.** For anything with a date and a place. Events get their own notifications and are the single most
useful Facebook object for a local business.

**Offer post.** Structured discount object with an expiry - surfaces differently from a normal post and is
saveable.

**Story.** 1080x1920, 24 hours, low effort. Good for behind-the-scenes and re-sharing feed posts.

## Limits

| Thing | Limit |
|---|---|
| Post text | 63,206 characters (technical cap). Practical: **40-120 characters** before the "See more" fold; put everything that matters there |
| Photos per post | up to 10 in a multi-photo post (albums allow far more) |
| Image size | up to 8 MB recommended; 1200x630 min for link images; 30 MB hard cap |
| Video | up to 240 minutes / 10 GB; Reels up to 90 seconds for full distribution |
| Comment | 8,000 characters |
| Page name | 75 characters |
| API posting | Pages API via a Page access token; **works in Meta app Development mode for people with a role on the app. Public third-party use requires App Review** for `pages_manage_posts`, `pages_read_engagement`, `pages_show_list` |
| API rate limit | Business Use Case rate limiting: `4800 * (engaged users in 24h)` calls per 24 hours per Page, tracked per app |
| Native scheduling | yes - Pages support native scheduled publishing via `published=false` + `scheduled_publish_time` (10 min to 6 months out) |
| Cost | free organically; paid boost from ~$1/day |

Because native scheduling exists, prefer handing the post to Facebook with `scheduled_publish_time` over
holding it in our own scheduler - it survives worker downtime.

## Best times

All times UTC; **convert to the business timezone before scheduling.** Facebook's audience is local, so the
business timezone matters more here than on any other wave-1 platform.

- **Weekday peak: 09:00-11:00 local** and a second bump **13:00-15:00 local**. Aggregated 2026 data puts
  Wednesday-Thursday 09:00-11:00 as the strongest window.
- **Evening: 19:00-21:00 local** works for B2C and local businesses (people on the sofa).
- **Best days: Tuesday, Wednesday, Thursday.** Sunday is surprisingly good for local/community content.
- **Worst: Saturday morning; after 22:00 local.**
- For Israel (UTC+3 summer / UTC+2 winter): 09:00-11:00 local = **06:00-08:00 UTC** in summer. Sunday is a
  working day and behaves like Monday; Friday afternoon and Saturday are quiet, with Saturday evening
  recovering strongly.

## Hooks, structure & CTAs

The fold is brutally short on Facebook (roughly 2 lines on mobile). The first 40-80 characters are the
entire hook. Then a line break, then the body.

Hooks that work: a question about a local, concrete situation; a number; a photo-led statement; "we made a
mistake" honesty; an event date.

CTAs: one. "Book a table", "Message us for a quote", "Save this for Sunday", "Comment 'guide' and we'll
send it" (comment-CTAs genuinely lift reach but only if you honour them - never use them as an engagement
trick with no follow-through).

### Skeleton 1 - local business / service

```
[Hook: concrete local statement, <80 chars]

[2-3 sentences: what it is, who it's for, what it costs or what the offer is]

[practical detail: address, hours, parking, how to book]

[one CTA]
[photo, 4:5]
```
Example shape:
```
Sunday brunch is back, and this time there's a kids' menu.

From 9:00 to 13:00, every Sunday. Shakshuka, three pastry plates from Dana, and the coffee
you already come here for. Kids under 6 eat free with an adult main.

We're at Herzl 14, parking in the lot behind the building is free on Sundays.

Book a table: [link]
```

### Skeleton 2 - Reel (game / app / product)

```
0:00-0:02  visual hook - the single most surprising frame, no logo
0:02-0:08  the problem, shown not told
0:08-0:20  the product doing the thing, one continuous shot if possible
0:20-0:28  the result / the payoff
0:28-0:30  one line of text on screen + spoken CTA
Caption: one line of context + one link. Captions burned in throughout.
```

### Skeleton 3 - post into a local Facebook group (requires human approval)

```
[No product name in the first line. Start with the situation the group cares about.]

Hi all - I run [business] on [street]. [Group rule check: this group allows business posts
on Thursdays / in the weekly thread.]

[One specific, useful thing: an answer to a question the group keeps asking, a free
resource, an honest note about availability.]

[Soft mention of the offer, one line]
Happy to answer anything in the comments.
```
Read the group's pinned rules first. Most local groups allow business posts on one specific day or only in
a pinned weekly thread; posting outside that gets you removed permanently.

## Hashtag/keyword practice

- Hashtags do almost nothing on Facebook feed posts. **0-2 maximum**, and only if they are a real community
  tag (e.g. `#תלאביב`, `#smallbusinesssaturday`) or an event tag.
- Reels are the exception: 3-5 hashtags on a Reel do influence topic classification. Still keep them
  relevant and lowercase-readable.
- What actually drives discovery: **keywords in the post text** (Facebook search is keyword-based), the Page
  category, the Page's "About" fields, and location tagging.
- **Tag the location** on every local post. That is the single most valuable metadata field for a local
  business on Facebook.
- Tag partner Pages (a supplier, a venue, a collaborator) - it puts the post in front of their audience,
  which is the only cheap organic reach left.

## Anti-spam & community rules

- NEVER post to a Facebook group without human approval and without reading that group's pinned rules first.
- NEVER post the same text to more than one Facebook group.
- NEVER post promotional content to a group outside the day or thread the group's rules designate for it.
- NEVER use engagement bait ("Like if you agree", "Share to win", "Tag 3 friends") - Meta explicitly demotes it.
- NEVER run a giveaway that requires sharing to a personal timeline (against Meta's promotion rules).
- NEVER post branded/paid content without the paid-partnership label.
- NEVER publish health, weight-loss, financial-return or employment claims that fall under Meta's restricted or Special Ad Categories without explicit human review.
- NEVER post a photo of an identifiable customer or child without recorded consent.

Soft rules: reply to every comment within a few hours (comment velocity feeds reach); keep the Page's hours,
address and phone accurate - they feed local search; ask happy customers for a Recommendation, but never
offer anything in return; cross-post Reels to Instagram natively rather than sharing a Facebook link.

## Good vs bad example

**Good**
```
We're closed Tuesday - the oven died and the part is coming from Haifa.

Wednesday we're back to normal hours, and anyone who had a Tuesday order can pick it up
Wednesday at no charge, just show the confirmation.

Sorry for the mess. If you need something urgent today, Miri at the bakery on Ben Gurion
has our sourdough - we dropped off what we had this morning.
📍 [location tag]
```
Why: honest, specific, useful, human, generous to a competitor (which reads as confidence), location tagged,
no hype, no hashtags.

**Bad**
```
🔥🔥 LIKE & SHARE to WIN a FREE CAKE!!! 🎂 Tag 3 friends in the comments!!! 🔥🔥
Our bakery is THE BEST in the country!!! Everyone says so!!!
#bakery #cake #food #foodie #yummy #instafood #bestbakery #israel #telaviv #dessert
```
Why: engagement bait (demoted by Meta), share-to-timeline giveaway (violates promotion rules), unsupported
superlative, 10 hashtags that do nothing on Facebook, no address, no hours, no actual offer terms.

## Sources

- Meta Pages API - publishing and scheduling: https://developers.facebook.com/docs/pages-api/posts
- Meta Graph API Business Use Case rate limits: https://developers.facebook.com/docs/graph-api/overview/rate-limiting
- Meta App Review requirements for `pages_manage_posts`: https://developers.facebook.com/docs/app-review
- Facebook image and video sizes 2026: https://blog.hootsuite.com/social-media-image-sizes-guide/
- Facebook post image spec 1200x630: https://socialrails.com/sizes/facebook/feed
- Meta engagement-bait demotion policy: https://transparency.meta.com/features/ranking-and-content/
- Best times to post 2026 (Facebook Wed-Thu 09:00-11:00): https://sproutsocial.com/insights/best-times-to-post-on-social-media/
