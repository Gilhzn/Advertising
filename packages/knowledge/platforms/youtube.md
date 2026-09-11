---
platform: youtube
updated: 2026-09-11
wave: 2
---
# YouTube (Shorts)

## Audience & culture

YouTube is the only platform in the plan where content **compounds**. A TikTok is dead in a week; a YouTube
video keeps earning views for years because YouTube is the world's second-largest search engine and its
recommendation system surfaces old videos indefinitely.

The engine targets **Shorts** (vertical, <= 3 minutes) because they are cheap to produce and share source
footage with TikTok and Reels. But the long-tail value lives in the metadata: title, description, tags and
the first 100 characters. Treat every Short as a small SEO asset.

Cultural notes:
- **Click-through rate on the thumbnail/title** and **average view duration** are the two metrics that
  matter. Everything else is downstream.
- Shorts are judged on *viewed vs swiped away* in the first 2 seconds, like TikTok, but they also surface
  through search and the related-videos rail, which TikTok does not do.
- Audiences are more tolerant of length and explanation here than on TikTok. A 50-second Short that
  actually teaches something performs well.
- The comment section is durable and is a real support/feedback channel.
- Subscribers matter more here than followers do elsewhere - the subscriptions feed and notifications are
  real distribution.
- A Short can and should point at a long-form video, a playlist or a link in the description/pinned comment.

## Formats that work

**Short (primary).** 9:16, 1080x1920, **up to 3 minutes** (anything <= 3:00 with a vertical or square
aspect ratio is automatically classified as a Short). Sweet spot: **20-50 seconds**.
- Hook in the first 1-2 seconds.
- Burned-in captions (YouTube's auto-captions are good but the on-screen hook text must be yours).
- A loop-friendly ending lifts the rewatch metric.

**Tutorial Short.** "How to do X in 30 seconds." Highest search value - these get found for years.

**Devlog / behind-the-scenes Short.** For games and hardware, the "how it's made" angle carries.

**Trailer (long-form, 16:9).** 1920x1080, 30-90 seconds, for game and product launches. This is the asset
Steam, Product Hunt and the press will embed. Worth producing once properly.

**Long-form explainer (8-15 min).** Out of scope for most campaigns but the highest-value asset if the
business has the capacity. A Short that clips a long video and points at it is the standard funnel.

**Community post.** Text/image/poll posts to subscribers - available to channels above the eligibility
threshold. Cheap engagement between uploads.

### Thumbnail (long-form)
1280x720, 16:9, under 2 MB, JPG/PNG. Three or fewer words of text, a face with a clear expression, high
contrast. Shorts use a frame from the video - pick it deliberately.

## Limits

| Thing | Limit |
|---|---|
| Title | 100 characters (first ~60 show in search/mobile) |
| Description | 5,000 characters (first ~100-150 show above "show more") |
| Tags | 500 characters total |
| Short length | <= 3 minutes (180s) with vertical/square aspect to classify as a Short |
| Long-form length | 12 hours / 256 GB (15 min until the account is verified) |
| Thumbnail | 2 MB, 1280x720 |
| Upload limit (unverified account) | 15-minute videos, no custom thumbnails |
| **API quota** | 10,000 units/day per Cloud project for general endpoints. **Since 1 June 2026 `videos.insert` bills to its own bucket at 1 unit per call, capped at 100 calls/day** (it previously cost ~1,600 units, then ~100 from 4 Dec 2025). `search.list` costs 100 units and is capped at 100 calls/day |
| **Audit** | uploads from an unaudited API project are forced to **private**; a compliance audit is required to publish publicly |
| Native scheduling | yes - `status.publishAt` schedules a private video to go public at a set time. Prefer this over holding the post in our scheduler |
| Cost | free within quota; extra quota by application only |

**Note on the repo metadata:** `packages/shared/src/platforms.ts` states "1,600 quota units per upload
(~6/day)". That was correct before December 2025 and is now **out of date** - uploads are 1 unit against a
separate 100/day bucket. The user-visible caveat should be updated to reference the audit (which is the real
blocker), not the quota.

## Best times

All times UTC; **convert to the business timezone before scheduling.**

- **Publish 2-4 hours before your audience's peak viewing window**, so the video has accumulated early
  signals when the traffic arrives. For a US audience that means **13:00-15:00 UTC** (09:00-11:00 ET) for an
  evening peak.
- **Weekday peak viewing: 19:00-22:00 local.** **Weekend peak: 09:00-11:00 and 19:00-23:00 local.**
- **Best upload days: Thursday and Friday** (weekend watch time) and **Tuesday** for tutorial/how-to content.
- Shorts are far less time-sensitive than feed posts - the Shorts shelf keeps testing for days. Consistency
  of schedule matters more than the hour.
- For Israel (UTC+3 summer): 20:00 local = **17:00 UTC**.

## Hooks, structure & CTAs

Two hooks: the **title** (search + CTR) and the **first 2 seconds** (retention). They serve different
audiences - do not make them identical.

Title patterns that work: "How I [outcome] in [time]", "[Number] [things] that [outcome]", "Why [common
belief] is wrong", "[Product/genre] but [twist]". Put the keyword in the first 40 characters.

CTAs: one, in the last 3 seconds, plus a link in the description's first line. "Full tutorial in the
description", "Demo's free, link below", "Subscribe if you want the rest of this build".

### Skeleton 1 - tutorial Short (highest search value)

```
0:00-0:02  State the outcome as a promise. On-screen text = the search query.
           "Diff two Postgres schemas in 30 seconds"
0:02-0:08  The problem in one sentence, shown on screen.
0:08-0:35  The steps. Screen recording, zoomed in enough to read on a phone.
           On-screen step numbers.
0:35-0:42  The result.
0:42-0:45  CTA: "Tool's free, link in the description."

Title:       How to diff two Postgres schemas in 30 seconds
Description: [First line: one sentence with the keyword + the link]
             [3-4 lines of detail]
             [Timestamps if > 60s]
             [Link block: site, docs, GitHub]
Tags:        postgres, schema diff, database migration, devops
```

### Skeleton 2 - game/product Short

```
0:00-0:02  The single most striking visual. No logo.
0:02-0:06  On-screen text: what it is, 6 words.
0:06-0:30  The thing working. Real gameplay/usage, real audio, minimal cuts.
0:30-0:38  The payoff or the one weird detail people will comment about.
0:38-0:40  CTA: "Demo's free - link below." Loop to frame 1.

Title:       [Genre/product] + [the specific twist]. No "Official Trailer" unless it is one.
Description: One line hook + store link in the FIRST line (above the fold).
```

### Skeleton 3 - devlog / build-in-public Short

```
0:00-0:02  "Week 14. I deleted the whole combat system."
0:02-0:10  Why - with footage of the old one.
0:10-0:30  What replaced it, side by side.
0:30-0:38  What it cost (time, scope) - be honest.
0:38-0:40  "Next week: [specific thing]." (This is the subscribe hook.)
```

## Hashtag/keyword practice

- **Up to 3 hashtags in the description**; the first three also render above the title. More than 15
  hashtags causes YouTube to ignore all of them.
- For Shorts, `#Shorts` is no longer required for classification (aspect ratio and length do it) but does no
  harm.
- **Keywords are the real system.** YouTube indexes: title, description, tags, auto-transcript, and on-screen
  text via OCR. Say the keyword out loud in the first 10 seconds.
- **First 100-150 characters of the description** are what shows in search results and what the algorithm
  weights most. Put the keyword sentence and the link there.
- Tags (500 chars) are a minor signal now; include the obvious 5-8 terms and move on.
- Use **chapters** on anything over 2 minutes - they generate additional search entry points.
- Add the video to a **playlist** on upload; playlists rank in search independently.

## Anti-spam & community rules

- NEVER publish publicly from an API project that has not passed the YouTube compliance audit - unaudited uploads are forced to private.
- NEVER exceed 100 `videos.insert` calls per day per Cloud project.
- NEVER use misleading titles or thumbnails (clickbait that the video does not deliver is a strike-level policy violation).
- NEVER upload content with a visible TikTok or Instagram watermark.
- NEVER buy views, subscribers or comments.
- NEVER post spam comments on other channels' videos promoting the product.
- NEVER upload paid or branded content without ticking the paid-promotion disclosure in the upload flow.
- NEVER upload realistic synthetic/AI-generated content without the "altered or synthetic content" disclosure.
- NEVER use music you do not have rights to - Content ID will claim or block the video, including Shorts.

Soft rules: reply to comments in the first 24 hours; pin a comment with the link and the one thing people
keep asking; keep a consistent upload day; use the end screen and pinned comment rather than mid-video
link-begging; put the link in the *first* line of the description, not after a wall of boilerplate.

## Good vs bad example

**Good**
```
Title:       I cut a 4.1s cold start to 900ms by deleting one line
Short (38s): 0:00 "Our API took 4.1 seconds to answer the first request. Here's the line
             that caused it." [screen recording, the line highlighted]
             0:05 the config parse, shown running per-request in a profiler
             0:15 the fix, live, with the profiler rerunning
             0:30 "900 milliseconds. Same code, one cached parse."
             0:35 "Full write-up's in the description."
Description: We cut our API cold start from 4.1s to 900ms by caching a config parse that
             was running on every request. Full write-up: https://example.com/blog/cold-start
             ...
Tags:        api performance, cold start, node.js, profiling
```
Why: the title is a search query and a promise, the hook is 2 seconds, the payoff is shown not claimed,
the keyword is spoken aloud, and the link is in the first line of the description.

**Bad**
```
Title:       🔥 THIS CHANGED EVERYTHING!!! (YOU WON'T BELIEVE #3) 🔥
Short (2:50):0:00-0:20 animated logo intro with music
             0:20 "Hey guys, welcome back to the channel, don't forget to LIKE and
             SUBSCRIBE and hit that notification bell!"
             0:45 finally starts explaining, in 16:9 letterboxed inside a 9:16 frame
Description: Subscribe for more!!! Follow us on Instagram Facebook Twitter TikTok!!!
             Links below!!! #shorts #viral #fyp #trending #subscribe #like #follow
             #youtube #youtubeshorts #explore #new #best #2026 #tech #coding #programmer
             #developer #software (x40 more)
```
Why: clickbait title that promises nothing specific, 20 seconds of intro (the Short is dead by second 2),
subscribe-begging before content, letterboxed video in a vertical frame, no keyword anywhere findable, and
a hashtag count high enough that YouTube ignores all of them.

## Sources

- YouTube Data API quota and compliance audits: https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits
- `videos.insert` quota change (1 unit, own bucket, 100/day from 1 Jun 2026): https://www.getphyllo.com/post/youtube-api-limits-how-to-calculate-api-usage-cost-and-fix-exceeded-api-quota
- Scheduling via `status.publishAt`: https://developers.google.com/youtube/v3/docs/videos/insert
- Shorts classification (<= 3 min, vertical/square): https://support.google.com/youtube/answer/10059070
- Shorts spec 1080x1920 / 9:16: https://anfx.co/blog/youtube-shorts-tiktok-reels-video-size-guide/
- YouTube Community Guidelines and spam policy: https://support.google.com/youtube/answer/2801973
- Paid product placement and synthetic content disclosure: https://support.google.com/youtube/answer/154235
