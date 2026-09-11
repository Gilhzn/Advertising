---
platform: product_hunt
updated: 2026-09-11
wave: assisted
---
# Product Hunt

## Audience & culture

Product Hunt is a single-day, zero-sum attention event. Roughly 30-60 products launch per day; the top 5 get
the newsletter, the badge and most of the traffic. Everything below #10 gets a trickle.

Who is there: founders, indie makers, early adopters, designers, a lot of other people launching, and a
smaller number of genuine buyers. **It is a credibility and backlink channel more than a customer-acquisition
channel.** A top-5 finish typically means a few thousand visitors, a few hundred signups, a permanent
"Product of the Day" badge, a do-follow backlink, and press/investor attention out of proportion to the
traffic.

Honest expectation setting, which the strategist must pass on to the user:
- A top-5 day is worth having. A #23 finish is worth almost nothing in traffic, though the page itself is a
  durable asset.
- Launch day is won in the **two weeks before it**, by building an audience who will show up - not by
  anything you do on the day.
- **You cannot ask for upvotes.** Product Hunt explicitly permits asking people to visit, comment, try the
  product and give feedback; asking for, incentivising, or paying for upvotes is detected and zeroes the
  launch.
- Best fit: B2B SaaS, developer tools, AI products, design tools, productivity apps, Chrome extensions.
  Poor fit: local businesses, most games (PH has a small games audience), anything without a usable
  free/trial entry point.

## Formats that work

A launch is a bundle of assets, all prepared in advance:

**Name** - the product name, nothing else. No taglines in the name field.

**Tagline** - **60 characters maximum.** The whole SERP of the launch. Lead with the user benefit in plain
words, no gimmicks, no "AI-powered revolutionary platform".

**Description** - 260 characters. What it is, who it's for, what's different. Plain prose.

**Gallery** - 1-8 images, **1270x760 (5:3)**, PNG/JPG. Image 1 is the one that appears in the feed: make it
a single clear screenshot or a bold benefit statement, legible at small size. Subsequent images: one feature
each, annotated.

**Thumbnail** - 240x240, square, simple. The logo on a solid background reads better than a detailed
illustration at that size.

**Video / demo GIF** - a 30-60 second silent demo GIF or a YouTube/Loom link. A looping GIF in the gallery
outperforms a video nobody clicks.

**First comment (maker comment)** - the most important piece of writing in the whole launch. 150-250 words:
why you built it, what it does, what it does not do yet, what feedback you want, and what the launch-day
offer is (if any). Post it within minutes of the launch going live.

**Topics** - 3 topics maximum, chosen for where your audience browses.

## Limits

| Thing | Limit |
|---|---|
| Tagline | **60 characters** |
| Description | 260 characters |
| Gallery images | 1-8, **1270x760 (5:3)** |
| Thumbnail | 240x240 |
| Maker comment | no hard limit; 150-250 words is the norm |
| Topics | 3 |
| Launch cadence | a product may relaunch roughly every **6 months**, and only with a substantive update |
| Launch day | **starts 00:01 PT (Pacific Time)** and runs 24 hours. This is the hard constraint around which everything else is planned |
| API | **there is no public posting API.** Product Hunt's GraphQL API is read-only for launches. **The engine prepares every asset and the user submits manually** |
| Native scheduling | PH's own UI allows scheduling a launch for a future date (recommended - schedule at least a week ahead) |
| Cost | free; "Product Hunt Pro"/promoted options exist but do not buy ranking |

## Best times

**The only time that matters: 00:01 Pacific Time on launch day.** Launching later in the PT day means
competing against products that already have hours of votes. Pacific Time is the reference here, not the
business timezone - but convert 00:01 PT into the business timezone before scheduling, because someone has
to be awake and replying in the thread from that minute onward.

- **PDT (Mar-Nov, UTC-7): 00:01 PT = 07:01 UTC.** **PST (Nov-Mar, UTC-8): 00:01 PT = 08:01 UTC.** Check
  which is in effect for the launch date before scheduling.
- For an Israeli founder that is **10:01 local in summer (UTC+3)** - a civilised hour, which is a genuine
  advantage over US founders launching at midnight.
- **Best days: Tuesday, Wednesday, Thursday.** Monday is crowded with products that scheduled over the
  weekend; Friday-Sunday have lower traffic but much weaker competition - a legitimate strategy for a
  smaller product that wants a badge rather than volume.
- **Avoid:** major US holidays, the week between Christmas and New Year, and any day a well-known product is
  known to be launching.
- The first 4 hours set the ranking trajectory. Be awake and replying for the whole of them.

## Hooks, structure & CTAs

### Skeleton 1 - the launch bundle

```
Name:      [Product name]
Tagline:   [<=60 chars, benefit-first, plain]
           good:  "Diff two Postgres schemas before the migration breaks"
           bad:   "The AI-powered revolutionary database platform for modern teams"
Topics:    [3, where your audience browses]
Gallery 1: One screenshot or one sentence, legible at 400px wide
Gallery 2-6: One feature per image, annotated with a single short caption
Gallery 7: Pricing, honestly
Demo:      30-60s silent looping GIF
```

### Skeleton 2 - the maker comment (post immediately at launch)

```
Hi Product Hunt 👋 I'm [name], I built [product].

[The itch: 2-3 sentences, a specific story. "I broke production twice in one month
because staging had drifted."]

[What it does: 3 bullets, concrete.]

[What it doesn't do yet: 2 honest limitations. This is the part that earns comments.]

[Stack / how it's built, if the audience is technical.]

[The ask - feedback, not votes: "I'd really like to know whether the 'would this break a
migration' classification is useful or too clever. Tell me if you hate it."]

[Offer, if any: "PH folks get 12 months of the pro tier free - code is on the site."]

I'll be here all day.
```

### Skeleton 3 - the launch-day comms (what you send elsewhere)

```
To your own list / community / followers - the ONLY permitted framing:

"We're live on Product Hunt today. I'd love your eyes on it, and honestly I'd love your
comments more than anything - the feedback in that thread is the reason we do this.
[link]"

NEVER: "upvote us", "smash that upvote", "we need X upvotes to hit #1", or any incentive.
```

## Hashtag/keyword practice

- **No hashtags anywhere on Product Hunt.** Not in the tagline, not in the maker comment.
- **Topics** (3) are the categorisation system - choose where your audience actually browses, not the
  biggest topics.
- **Tagline keywords** are what Google indexes; the PH page will rank for your product name plus the
  category term for years. Write the tagline so it contains the category term ("Postgres schema diff",
  "invoice templates for freelancers").
- The PH page is a **durable backlink and SEO asset** - get the product name, category and one-line
  description right, because you will be stuck with the URL.
- Mention the real competitor names in the maker comment when asked ("how is this different from X") -
  honest comparison is the most upvoted kind of comment on PH.

## Anti-spam & community rules

- NEVER ask for upvotes, in any channel, in any wording, including "support us" phrased as a vote request.
- NEVER incentivise, pay for, or trade votes, and NEVER join an upvote group, pod or Telegram "launch support" ring.
- NEVER create or use additional accounts to vote or comment on your own launch.
- NEVER launch a product you are not a maker of, or list yourself as a maker of something you did not build.
- NEVER relaunch within 6 months, or relaunch without a substantive change.
- NEVER publish a tagline over 60 characters or one that does not say what the product does.
- NEVER claim a metric, customer count, award or integration you cannot show.
- NEVER DM Product Hunt users asking them to look at your launch.

Soft rules: reply to every single comment personally within minutes - comment volume and maker
responsiveness are visible and genuinely influence ranking; thank people by name; if someone finds a bug,
fix it during the day and say so in the thread; do not argue with criticism; support other launches on your
day (it is noticed).

## Good vs bad example

**Good**
```
Tagline:  Spot Postgres schema drift before the migration breaks   (58 chars)
Gallery1: A terminal screenshot, two schemas side by side, 4 differences highlighted,
          one labelled "would break your migration" in red.
Maker comment opening:
  "Hi PH - I'm Gil. I broke production twice in one month, both times because a migration
   worked locally and failed on staging, where the schema had quietly drifted. I couldn't
   find a tool that told me which differences actually mattered at 2am, so I wrote one.
   It doesn't handle partitioned tables yet and the output is ugly on narrow terminals..."
```
Why: tagline states the benefit in the user's language and contains the search term; the first gallery
image proves the product exists and is legible at feed size; the maker comment opens with a specific story
and volunteers a limitation inside the first 80 words.

**Bad**
```
Tagline:  🚀 The #1 AI-Powered Revolutionary Database Platform for Modern Teams!!  (74 chars)
Gallery1: A 3D rendered abstract cloud illustration with the logo, no product visible.
Maker comment:
  "Hey hunters!!! 🔥 We're SO EXCITED to launch today! Please UPVOTE us to help us reach
   #1!!! 🚀🚀 We need your support! Drop an upvote and I'll check out your product too! 🙏
   #producthunt #ai #saas #startup"
```
Why: over the character limit, says nothing about what the product does, no product in the gallery image,
explicit upvote solicitation, vote-trading offer ("I'll check out yours too"), and hashtags on a platform
that has none. The upvote solicitation alone is enough to have the launch's votes discounted.

## Sources

- Product Hunt - preparing for launch (assets, tagline, gallery specs): https://www.producthunt.com/launch/preparing-for-launch
- Product Hunt community guidelines (no vote solicitation): https://help.producthunt.com/en/articles/8830316-community-guidelines
- Tagline 60-character limit and no-upvote-asking rule (2026): https://getlaunchlist.com/checklists/producthunt
- Launch timing (00:01 PT, 24-hour cycle): https://smollaunch.com/guides/launching-on-producthunt
- Product Hunt API (read-only, no posting endpoint): https://api.producthunt.com/v2/docs
- Relaunch policy (~6 months): https://help.producthunt.com/en/articles/8830291-relaunching-a-product
