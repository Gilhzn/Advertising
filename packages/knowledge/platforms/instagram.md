---
platform: instagram
updated: 2026-09-11
wave: 1
---
# Instagram

## Audience & culture

Instagram in 2026 is a **discovery** platform first and a follower platform second. Reels and the Explore
surface distribute to non-followers by default; the follower feed is a minority of a post's reach for
accounts under ~50k. That means: every post should be legible to someone who has never heard of the
business.

Audience skews 18-44, mobile-only, visually literate and fast. Saves and shares (sends to a friend or to a
story) are the strongest ranking signals - more than likes. Design content for "I need to send this to
someone" or "I'll need this later".

Cultural notes:
- Aesthetic consistency matters (colour, typography, framing). The profile grid is a shop window.
- Faces and hands outperform product-only shots.
- Text-on-image is expected and read; the caption is secondary but carries the CTA and the keywords.
- Carousels are the best-performing format for anything educational - swipe depth is a ranking input.
- Stories are where the relationship lives (polls, questions, behind-the-scenes, link stickers).
- Comments from the account itself count; replying fast lifts distribution.
- Strong categories: food, retail, fitness, beauty, travel, local services, consumer apps, games with strong
  visuals. Weak: B2B SaaS, developer tools.

## Formats that work

**Reel** (the growth engine). 9:16, 1080x1920, MP4/H.264 + AAC.
- Reels can technically run up to 20 minutes, but **Instagram does not recommend Reels longer than 3
  minutes to new audiences** - keep promotional Reels at **7-30 seconds**, with 15s the sweet spot.
- Hook in frame 1-2 (a visual, not a logo). Burned-in captions. Loop-friendly ending.
- Cover frame: design it as a grid thumbnail (1:1 safe area in the middle).

**Carousel** (the educational engine). Up to **20 slides in-app**, but the Content Publishing API is
**limited to 10 items** - the engine must cap at 10.
- 1080x1350 (4:5) for maximum feed height, or 1080x1080 (1:1).
- Slide 1 = the hook (a claim, a number, a mistake). Slide 2 = why it matters. Slides 3-8 = one idea each.
  Final slide = the CTA + a "save this" prompt.

**Single image.** 1080x1350 (4:5) preferred; 1080x1080 (1:1) acceptable. For products, shoot on a clean
background with one human element.

**Story.** 1080x1920, 24 hours. Link sticker, poll sticker, question sticker, countdown sticker. Use 3-7
frames, not 15. Stories are where you ask things; the feed is where you show things.

**Collab post.** Co-authored with another account - the post appears in both feeds and both audiences see
it. The highest-leverage organic growth move on the platform; use it for every partnership.

## Limits

| Thing | Limit |
|---|---|
| Caption | 2,200 characters; only ~125 characters show before "more" |
| Hashtags | 30 maximum (use 3-5) |
| Account mentions per post | 20 |
| Carousel (app) | 20 items |
| Carousel (API) | **10 items** - hard cap for the engine |
| Image | JPEG recommended, max 8 MB, aspect 4:5 to 1.91:1 |
| Reel | up to 20 min (recommended <= 3 min, ideal 7-30 s), 9:16, max 1 GB via API |
| Story | 15 seconds per frame (video auto-splits) |
| **Publishing rate limit** | **100 API-published posts per rolling 24-hour period per account** (a carousel counts as 1). Meta's docs elsewhere say 50 - treat 100 as the ceiling and query `GET /{ig-user-id}/content_publishing_limit` for the live number |
| Graph API rate limit | Business Use Case: 200 calls per user per hour, plus the `4800 x impressions` 24h formula |
| Account requirement | Business or Creator account **linked to a Facebook Page** |
| Native scheduling | not available via API - the engine schedules and fires (two-step: create container, then publish) |
| Cost | free |

The publishing window is a **moving** 24 hours: capacity freed 24h after each publish, not at midnight.

## Best times

All times UTC; **convert to the business timezone before scheduling.**

- **Morning: 06:00-09:00 local** - Metricool's 2026 study found this the strongest consistent window.
- **Lunch: 11:00-13:00 local.**
- **Evening: 19:00-21:00 local**, with 20:00 the single highest-view hour.
- **Best days: Tuesday, Wednesday, Thursday.** Monday morning and Friday afternoon are weak.
- **Reels are less time-sensitive** than feed posts - a Reel can pick up distribution 24-72 hours after
  posting. Feed posts and Stories are time-sensitive; Reels are not.
- For Israel (UTC+3 summer / UTC+2 winter): 20:00 local = **17:00 UTC** in summer. Sunday behaves like a
  Monday; Friday after 13:00 local and Saturday daytime are quiet, Saturday 20:00+ is strong.

## Hooks, structure & CTAs

Two hooks per post: the **visual hook** (frame 1 / slide 1) and the **caption hook** (first 125 characters).
They must not say the same thing.

Caption structure:
```
[Hook line - a claim, number, or question. Under 125 chars.]
(line break)
[2-4 short paragraphs, one idea each, mobile line lengths]
(line break)
[One CTA]
(line break)
[3-5 hashtags]
```

CTAs that work: "Save this for your next X", "Send this to the person who keeps doing Y", "Comment WORD and
I'll DM you the template", "Link in bio". One only.

### Skeleton 1 - carousel teardown (SaaS / app / service)

```
Slide 1: "We lost 40% of signups on one screen." [large text, brand colour]
Slide 2: Screenshot of the screen, circled in red
Slide 3: "Three things wrong with it" [list]
Slides 4-6: One fix per slide, each with a before/after crop
Slide 7: The result, with the real number
Slide 8: "Save this - the checklist is in the caption" + logo

Caption:
We lost 40% of signups on one screen. Here's the teardown.

The screen asked for a company name before anyone had seen the product. We moved it to
after the first save and signups recovered in a week.

Full checklist:
1. Nothing before value
2. One field per decision
3. Show progress, not steps

Save this before your next onboarding review.

#productdesign #saas #ux #onboarding #buildinpublic
```

### Skeleton 2 - Reel (game / physical product)

```
0:00-0:02  The most surprising 2 seconds you have. No logo, no title card.
0:02-0:06  Context in one on-screen line: "this is X, it does Y"
0:06-0:18  The thing working, one continuous take, real audio where possible
0:18-0:25  The payoff / the result / the reaction
0:25-0:28  One line CTA on screen

Caption:
[One line of context]. [One line of detail].
[CTA - link in bio / demo out now / comment for the code]
#tag1 #tag2 #tag3
```

### Skeleton 3 - local business single image

```
Image: 4:5, the product/space with one person in frame, natural light.

Caption:
[Concrete offer or news in one line - under 125 chars]

[2 lines: what it is, what it costs, when]
[1 line: practical - address, hours, how to book]

[CTA: Book via the link in bio / DM us to reserve]

📍 [location tag - always]
#citytag #neighbourhoodtag #categorytag
```

## Hashtag/keyword practice

- **3-5 hashtags.** Instagram's own guidance since 2024 is that 3-5 relevant tags beat 30; 30 tags reads as
  spam and does not increase reach.
- Mix three tiers: one broad (500k-2M posts), two-three niche (10k-200k), one branded/owned tag.
- Put them **in the caption**, not the first comment - Instagram's search indexes the caption. (The "first
  comment" trick is obsolete.)
- **Keywords now matter more than hashtags.** Instagram search is keyword-based over captions, on-screen
  text, and audio transcripts. Say the thing you want to be found for, out loud, in the video and in the
  caption.
- **Alt text on every image** (accessibility + it feeds the keyword index).
- Always tag the **location** for local businesses, and tag collaborators/products where relevant.
- Trending audio still lifts Reel distribution, but only if the audio fits - mismatched trending audio on a
  product demo reads as desperate.

## Anti-spam & community rules

- NEVER exceed 100 API-published posts per 24-hour moving window per account (query the live limit endpoint before a burst).
- NEVER post more than 30 hashtags, and NEVER use unrelated high-volume tags to farm reach.
- NEVER use engagement pods, follow/unfollow automation, or bulk auto-DMs.
- NEVER run a "like, follow, tag 3 friends and share to your story to win" giveaway without the required rules and eligibility text.
- NEVER publish branded or paid content without the Paid Partnership label.
- NEVER post before/after body imagery, weight-loss claims, or health outcome claims.
- NEVER repost another creator's Reel or photo without permission and visible credit.
- NEVER post a Reel with a visible TikTok watermark (Instagram demotes it).

Soft rules: reply to every comment in the first hour; use the Collab feature for partnerships instead of
"link in their bio"; keep the grid visually coherent; post Stories on days you do not post to the feed; do
not delete and repost a post that underperformed in the first hour - Reels build over days.

## Good vs bad example

**Good** (Reel caption, indie game)
```
We spent three weeks making the door open correctly. Here's why it mattered.

The old door was instant. Nobody believed the world was real. The new one takes 0.4s, the
handle turns, and the room audio changes as it opens. Same room, completely different game.

Demo's free this week - link in bio.

#gamedev #indiegame #gamefeel #unity
```
Why: specific, shows craft, one CTA, 4 relevant tags, and the video (0.4s door, with audio) is inherently
watchable and loops.

**Bad**
```
🚀🚀 NEW GAME ALERT!!! 🎮 Our INCREDIBLE indie game is OUT NOW!!! The BEST roguelike EVER
MADE!! 🔥 Follow us, like this post, tag 3 friends and share to your story for a chance to
WIN A FREE COPY!!! 🎁 LINK IN BIO!!! DM us for keys!!!
#game #games #gaming #gamer #gamers #indiegame #indiegames #indiedev #gamedev #videogames
#pcgaming #steam #roguelike #rogue #pixelart #pixel #art #instagaming #gaminglife #gamergirl
#gamerboy #playstation #xbox #nintendo #twitch #streamer #follow #followme #like #likeforlike
```
Why: 30 hashtags including irrelevant and follow-for-follow tags, four CTAs, unsupported superlatives,
tag-and-share giveaway mechanics, and nothing that tells anyone what the game actually is.

## Sources

- Instagram Content Publishing API (containers, publish, limits): https://developers.facebook.com/docs/instagram-platform/content-publishing
- Instagram publishing rate limit, 100 posts / 24h moving window: https://www.blotato.com/blog/instagram-posting-api
- Instagram API rate limits 2026 (200 calls/user/hour BUC): https://www.getphyllo.com/post/instagram-api-rate-limits-explained----and-how-to-scale-beyond-them-2026
- Carousel: 20 in-app vs 10 via API: https://support.post-bridge.com/media-limits-and-processing/instagram-carousel-post-photo-limit-10-photos-maximum
- Reels length and 3-minute distribution note (2026): https://www.socialcal.app/blog/instagram-video-length-limits-2026
- Reels spec 1080x1920 / 9:16: https://socialsizes.io/instagram-reels-size/
- Best times to post, Metricool 2026 Instagram study: https://metricool.com/best-time-to-post-social-networks/
- Instagram Community Guidelines: https://help.instagram.com/477434105621119
