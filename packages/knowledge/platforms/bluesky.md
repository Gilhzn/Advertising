---
platform: bluesky
updated: 2026-09-11
wave: 1
---
# Bluesky

## Audience & culture

Bluesky is a text-first, chronological-by-default network built on the AT Protocol. The population skews
technical, open-source-friendly, journalism-adjacent, queer-friendly and allergic to marketing voice. Users
opted out of X deliberately; they notice and punish anything that reads like a corporate social media
manager wrote it.

What this means in practice:
- First person, lowercase-friendly, conversational. "we shipped a thing" outperforms "We are thrilled to
  announce".
- Building in public works extremely well. Screenshots of work-in-progress, bugs you hit, numbers you are
  embarrassed by - all of it travels.
- Threads (self-replies) are normal and read well; there is no penalty for a 5-post thread.
- Feeds are the discovery engine, not an algorithm. Custom feeds (e.g. tech, gamedev, design, science) are
  built by users and pull posts by keyword, hashtag or author list. Getting into the right feed matters more
  than follower count. Starter Packs are the follower-growth mechanism.
- Quote-posting is a conversational act, not an attack. Reply guys are rarer than on X.
- Link posts are not throttled. External links work fine, and the link card renders from Open Graph tags.

Do not: post the same corporate line you posted on LinkedIn, use engagement-bait questions ("Agree?"),
thread-jack, or auto-post a feed of blog titles.

## Formats that work

**Text post (the default).** 300 graphemes. One idea, one link, optional image. This is 70% of what you
should publish here.

**Thread (self-reply chain).** Post 1 is the hook and must stand alone. Posts 2-5 carry the detail. Put the
link in the last post or in post 1, never in the middle. Threads of 3-6 posts perform best.

**Image post.** Up to 4 images per post. Alt text is culturally mandatory - Bluesky users will reply asking
for it, and several popular feeds filter out images without alt text.
- Recommended: 1200x675 (16:9) for link-card-style images, 1000x1000 (1:1) for screenshots, 1080x1350 (4:5)
  for portrait. Max resolution 4000x4000.
- Formats: JPEG, PNG, WebP. Max ~2 MB per image after client-side compression (raised from 1 MB in April 2026).

**Video post.** One video per post, no mixing with images. MP4 only.
- Up to 10 minutes and 300 MB per video (raised 25 August 2026). Practically: 15-60 seconds performs best.
- 9:16 or 1:1; captions burned in (autoplay is muted).

**Link card.** Attach a URL and Bluesky renders an OG card. Make sure the destination has `og:title`,
`og:description` and a 1200x630 `og:image`. A post with a card plus 1-2 lines of your own framing beats a
bare link every time.

**Starter Pack / custom feed placement.** Not a post format but a distribution move: get added to a relevant
Starter Pack, and use the exact keywords that popular feeds filter on (e.g. "gamedev", "indiedev", "rust").

## Limits

| Thing | Limit |
|---|---|
| Post text | 300 graphemes (roughly 300 Latin characters); hard byte ceiling 3,000 bytes UTF-8 |
| Images per post | 4 |
| Image size | ~2 MB each after compression; max 4000x4000 px; JPEG/PNG/WebP |
| Video per post | 1 (cannot combine with images) |
| Video length / size | up to 10 minutes, 300 MB, MP4 only |
| Alt text | supported on every image and video; use it |
| Display name | 64 chars; bio 256 chars |
| Rate limit (account) | 5,000 points/hour and 35,000 points/day; a `createRecord` (post) costs 3 points -> ~1,666 posts/hour theoretical |
| Rate limit (IP) | 3,000 HTTP requests per 5 minutes |
| Native scheduling | none - the scheduler must hold and fire the post itself |
| Cost | free (self-hosted PDS or bsky.social) |

Practical posting cap for a business account: **2-4 posts per day**, 1-2 of them promotional at most. The
rate limits are irrelevant; audience tolerance is the real limit.

## Best times

All times UTC. **Convert to the business timezone before scheduling** - the engine stores UTC, the audience
lives in local time. For an Israel-based business (UTC+3 in summer, UTC+2 in winter) subtract 2-3 hours from
the local target to get UTC.

- **Weekday peak: 13:00-16:00 UTC** (morning in the US, late afternoon in Europe). This is the widest overlap
  window for the English-speaking technical audience.
- **Secondary: 20:00-23:00 UTC** (US evening). Good for "here's what I shipped today" posts.
- **European-only audience: 07:00-09:00 UTC.**
- **Best days: Tuesday, Wednesday, Thursday.** Weekend traffic is lower but competition is much lower too -
  good for longer build-in-public threads.
- Chronological feeds mean a post's life is short (2-6 hours). Repeating a good post a week later with a
  different hook is acceptable here, unlike on LinkedIn.

## Hooks, structure & CTAs

Hooks that work: a concrete number, a confession, a screenshot, a strong opinion with a reason, a
before/after. Hooks that fail: "Excited to share", "Big news", any sentence starting with "Introducing".

CTAs: one per post, soft. "link in the post", "happy to answer anything", "would love feedback on the
onboarding" all work. "Sign up now", "Don't miss out", "Tag a friend" do not.

### Skeleton 1 - build in public (best default)

```
[one-line result with a number]
[one line on how / what surprised you]
[link]
```

Example shape:
```
spent the week cutting our cold start from 4.1s to 900ms. the fix was embarrassing: we were
re-parsing the config on every request.

wrote up what we found -> https://example.com/blog/cold-start
```

### Skeleton 2 - thread launch (3-5 posts)

```
1/ [the problem in one sentence, no product name]
2/ [why the existing options do not solve it]
3/ [what we built - first mention of the product, plus screenshot]
4/ [one concrete detail that proves it is real: a benchmark, a limitation, a weird edge case]
5/ [link + "it's free to try / early access / feedback welcome"]
```

### Skeleton 3 - visual drop (game/app/design)

```
[3-8 word caption in the voice of the thing]
[video or 1-4 images, all with alt text]
[optional second line: one technical detail]
[link, or "wishlist/demo" pointer]
```

## Hashtag/keyword practice

Bluesky supports real hashtags and they are clickable, but culture keeps them minimal.
- **0-2 hashtags per post.** Three or more reads as spam.
- Use them to enter a *feed*, not to reach a general audience: `#gamedev`, `#indiedev`, `#rustlang`,
  `#a11y`, `#screenshotsaturday`.
- Put them at the end of the post, or inline if grammatical.
- Keywords matter as much as hashtags: many custom feeds filter on plain words in the post body. Say
  "gamedev" or "TypeScript" in the sentence itself.
- Recurring community tags worth knowing: `#screenshotsaturday` (Sat), `#wipwednesday`, `#devlog`,
  `#indiegame`, `#buildinpublic`.

## Anti-spam & community rules

- NEVER post the same text to Bluesky that was published verbatim to X or LinkedIn in the same campaign.
- NEVER post an image or video without alt text.
- NEVER post more than 4 times in a day for a business account, or more than 2 promotional posts per day.
- NEVER mass-reply to unrelated posts with a product link (that is the fastest way to get labelled and
  muted by moderation lists).
- NEVER buy or trade follows, or ask for reposts in exchange for anything.
- NEVER auto-crosspost an RSS feed without human-written framing per post.

Soft rules: reply to everyone who replies to you within a few hours; quote-post to add, not to dunk; if you
correct a post, post the correction as a reply rather than deleting and reposting (deleting kills the
thread's replies).

Moderation on Bluesky is label-based and community-run: getting added to a "spam" or "promo" labeller list is
effectively invisible deplatforming, and it is done by users, not by an appeals-friendly trust & safety team.
Treat it as irreversible.

## Good vs bad example

**Good**
```
our indie roguelike now runs at 60fps on a steam deck. the win came from batching 3,000 sprite
draws into 40. before/after frame graph below, both captured on the same save.

demo is free this week -> store link
[2 images, both with alt text describing the frame graphs]
```
Why: concrete number, proof artifact, one CTA, alt text, no hype adjectives.

**Bad**
```
🚀 Excited to announce the launch of our REVOLUTIONARY new roguelike! 🎮 Wishlist NOW and don't
miss out!! Retweet to enter our giveaway!! #gaming #gamer #indie #indiedev #roguelike #steam #pcgaming
```
Why: X-native hype voice, 6 hashtags, giveaway/repost solicitation, no substance, no alt text, "Retweet"
is not even the right verb on this platform.

## Sources

- Bluesky post and media limits (2026): https://publishq.com/blog/bluesky-api-post-limits
- Bluesky video limits, 10 min / 300 MB, Aug 2026: https://useagentsky.com/blog/bluesky-video-limits
- Bluesky image size and resolution changes, Apr 2026: https://publishq.com/bluesky-limits
- AT Protocol rate limits: https://docs.bsky.app/docs/advanced-guides/rate-limits
- Bluesky community guidelines: https://bsky.social/about/support/community-guidelines
- Best-time-to-post aggregate data 2026: https://metricool.com/best-time-to-post-social-networks/
