---
platform: tiktok
updated: 2026-09-11
wave: 2
---
# TikTok

## Audience & culture

TikTok is the highest-ceiling and lowest-floor channel available: a 12-second clip from a zero-follower
account can do 2 million views, and a polished brand ad can do 400. Distribution is content-first - the For
You page tests every upload on a small audience and promotes based on **watch-through rate, rewatches,
shares and comments**, in roughly that order.

Audience skews 16-34 but the 35-54 band is now substantial. TikTok is also a **search engine** for a large
share of that audience - "how do I", "best X near me", "is X worth it" queries run on TikTok before Google.

Cultural notes:
- Production value is negative signal. A clip shot on a phone in a real place outperforms a studio spot.
- The first 1-2 seconds decide everything. No logos, no intros, no "hey guys".
- Speak to one person. Face-to-camera with a specific claim beats b-roll with a voiceover.
- Native text-on-screen, native captions, native fonts. An imported, watermarked or letterboxed video is
  demoted.
- Comments are content. The best-performing follow-up is a video replying to a comment on the first video.
- Trends matter but chasing a trend that does not fit the product reads as cringe and costs credibility.
  Chase *formats* (the structure of a trend) rather than *sounds*.

## Formats that work

**Short talking-head with a claim.** 12-25 seconds. "We're a bakery and here's the thing nobody tells you
about sourdough." Cheapest to make, highest hit rate.

**Demo / satisfying loop.** 8-20 seconds, one continuous shot of the product doing the thing. For games,
apps and physical products this is the workhorse.

**Before/after or "day in the life".** 20-45 seconds with 3-5 cuts.

**Reply-to-comment video.** Screenshot of the comment pinned in the corner, then the answer. Costs nothing
and reliably outperforms the original.

**Listicle with on-screen text.** "3 things I'd do differently" - each beat 4-6 seconds.

**Photo carousel.** Up to 35 images with music. Underrated: carousels get high dwell and are much cheaper to
produce than video. Good for portfolios, menus, screenshots, before/after sets.

### Specs
- **Aspect ratio 9:16, 1080x1920.** Safe zones: keep text out of the bottom 180px (caption/UI) and the
  right 120px (buttons).
- Length: **7-34 seconds** is the sweet spot for promotional content. Up to 10 minutes allowed; up to 60
  minutes for some accounts. Anything over 60 seconds needs a very strong reason.
- Formats accepted by the Content Posting API: **.mp4, .mov, .webm, .avi**, up to **1 GB**, minimum **3
  seconds**.
- Captions: use TikTok's auto-captions (they are indexed for search) plus on-screen text for the hook.

## Limits

| Thing | Limit |
|---|---|
| Caption | 2,200 characters (was 150 - long captions are now indexed for search; use 100-300 chars) |
| Video length | 3 seconds minimum; up to 10 minutes standard, 60 minutes for eligible accounts |
| Video file (API) | 1 GB; .mp4 / .mov / .webm / .avi |
| Photo carousel | up to 35 images |
| **Unaudited API client** | **all direct posts are forced to SELF_ONLY (private) viewership**; up to 5 users may post per 24h |
| Audit | required to post publicly; typically 2-4 weeks; requires a demo video of the posting flow and a published privacy policy |
| Per-creator posting cap | ~15 direct posts per day across all API clients (**unverified** - TikTok does not publish this figure) |
| API rate limit | 6 requests/minute per user for the Content Posting API (**unverified**) |
| Native scheduling | TikTok's own UI can schedule up to 10 days out; the API cannot - the engine schedules and fires |
| Cost | free |

**Operational consequence:** until the app passes TikTok's audit, the engine can only create **private**
posts. The wizard must say this plainly, and the plan should treat TikTok as "prepare + manual publish"
until the audit clears, exactly like the assisted platforms.

## Best times

All times UTC; **convert to the business timezone before scheduling.**

- **Peak: 14:00-17:00 local, Tuesday and Thursday** - the most consistent window in 2026 aggregate data.
- **Secondary: 19:00-23:00 local** (evening scroll) and **06:00-09:00 local** (before work/school).
- **Best days: Tuesday, Wednesday, Thursday.** Sunday evening is strong.
- TikTok's distribution is the least time-sensitive of any platform: videos routinely take off 2-7 days
  after upload. **Do not over-optimise timing here** - optimise the first two seconds instead.
- For Israel (UTC+3 summer): 15:00 local = **12:00 UTC**.

## Hooks, structure & CTAs

The hook is visual and verbal simultaneously, in the first 2 seconds. Write the hook before you write
anything else.

Hook patterns that work:
- "I've run a bakery for 9 years. Here's the bread nobody orders and why it's the best one."
- "This is what 8 months of solo game dev looks like." [shows the thing immediately]
- "You're doing X wrong and it's costing you Y."
- A visually surprising first frame with no words at all.

CTAs: one, spoken and on-screen, in the last 2 seconds. "Link's in the bio", "Comment 'demo' and I'll send
it", "Follow if you want part 2" (only if part 2 genuinely exists).

### Skeleton 1 - founder talking head (services, SaaS, local)

```
0:00-0:02  Hook, face to camera, mid-sentence. No greeting.
0:02-0:08  The claim, with one specific number or detail.
0:08-0:18  The mechanism - show it, don't describe it. Cut to screen/product.
0:18-0:24  The payoff or the counter-intuitive bit.
0:24-0:27  CTA, spoken + on-screen.

Caption: [the hook restated as a searchable sentence] [2-4 keyword hashtags]
```

### Skeleton 2 - product demo loop (game / app / physical product)

```
0:00-0:02  The most surprising frame of the whole thing. Full screen, no UI.
0:02-0:10  One continuous take of the thing working, real audio.
0:10-0:16  The result / the reaction / the finished state.
0:16-0:18  One line of on-screen text: what it is + where to get it. Loop back to frame 1.

No voiceover needed. Trending-adjacent audio that matches the energy.
Caption: [what it is in plain words] [link pointer] [3 hashtags]
```

### Skeleton 3 - reply to a comment

```
0:00-0:01  The pinned comment on screen, read aloud.
0:01-0:15  The honest answer, including the part that isn't flattering.
0:15-0:20  One extra thing they didn't ask about but will want.

Caption: Replying to @user - [the question restated for search]
```

## Hashtag/keyword practice

- **3-5 hashtags.** Two niche + two broad + one branded is a good mix. More than 5 dilutes the topic signal.
- Avoid `#fyp`, `#foryou`, `#viral` - they do nothing and mark the account as amateur.
- **TikTok is a search engine: keywords beat hashtags.** The spoken words (auto-transcribed), the on-screen
  text (OCR'd) and the caption are all indexed. Say the search term out loud: "sourdough starter", "indie
  roguelike", "bookkeeping for freelancers".
- Write the caption as a sentence someone would search, not as a slogan.
- Use the TikTok Creative Center to check what a niche hashtag's actual volume is before committing to it.
- Add the location to local-business videos - "near me" search is a real traffic source.

## Anti-spam & community rules

- NEVER publish a public post through an unaudited API client - unaudited clients can only create SELF_ONLY (private) posts, and attempting otherwise fails or silently privates the content.
- NEVER upload a video carrying another platform's watermark (TikTok demotes reuploads).
- NEVER use unrelated trending hashtags or sounds to farm reach.
- NEVER buy views, likes or followers, or participate in engagement pods.
- NEVER post branded or paid content without enabling the Branded Content toggle.
- NEVER post AI-generated realistic content without the AI-generated label.
- NEVER make health, medical, weight-loss or financial-return claims.
- NEVER repost another creator's video as your own, even with credit in the caption.

Soft rules: post 3-5 times a week minimum (TikTok rewards volume more than any other platform); reply to
comments with videos; keep a consistent visual identity so viewers recognise the second video; never delete
a video that flopped - it costs nothing to leave up and occasionally revives.

## Good vs bad example

**Good** (bakery, 22 seconds)
```
[0:00, hands tearing open a loaf, steam, no words for 1 second]
"This is the bread we sell the least of, and it's the one I'd pick every time."
[0:04, cut to the shelf, camera moves past it]
"It's 36 hours. Rye starter, no commercial yeast, and it's darker than people expect so
nobody picks it up."
[0:12, cut to a slice with butter]
"If you come in this week and ask for the ugly one, it's 20% off. I just want people to
try it."
[0:20, on-screen text: 'Herzl 14, Tues-Sat']
Caption: the rye nobody orders. 36 hour ferment, rye starter, no commercial yeast.
#sourdough #bakery #telaviv #breadtok
```
Why: hook in 1 second, specific and credible, a real offer with real terms, location for local search,
4 relevant hashtags, searchable keywords spoken aloud.

**Bad**
```
[0:00-0:04, logo animation]
[0:04, "Hey guys! Welcome back to our channel!"]
"Today we want to tell you about our amazing bakery which has been voted the best in the
country and offers a wide range of high-quality products..."
[static shot of the storefront, 30 seconds, no cuts]
Caption: Check out our bakery!! Best bread ever!! 🍞🥖🥐
#fyp #foryou #viral #foryoupage #trending #bakery #bread #food #yummy #delicious #tiktok
#explore #viralvideo #trend #followme
```
Why: 4 seconds of logo before any content (the video is dead by second 2), YouTube-channel greeting,
unsupported "voted best", no motion, no hook, 15 hashtags including the useless `#fyp` cluster, caption
that nobody would ever search for.

## Sources

- TikTok Content Posting API - audit and SELF_ONLY restriction: https://developers.tiktok.com/doc/content-posting-api-get-started
- Unaudited client restrictions (SELF_ONLY, 5 users/24h): https://vorplabs.com/agent-tools/tiktok-content-posting-api
- Video format and size limits (.mp4/.mov/.webm/.avi, 1 GB, 3s min): https://postproxy.dev/blog/how-to-post-to-tiktok-via-api/
- TikTok video specs 9:16 / 1080x1920: https://anfx.co/blog/youtube-shorts-tiktok-reels-video-size-guide/
- Best times to post on TikTok 2026 (Tue/Thu 14:00-17:00): https://sproutsocial.com/insights/best-times-to-post-on-social-media/
- TikTok Community Guidelines: https://www.tiktok.com/community-guidelines
- TikTok Branded Content Policy: https://www.tiktok.com/legal/page/global/bc-policy/en
