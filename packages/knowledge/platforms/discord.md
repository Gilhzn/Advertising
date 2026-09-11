---
platform: discord
updated: 2026-09-11
wave: 1
---
# Discord

## Audience & culture

Discord is where a product's community *lives*, not where it is discovered. There is no feed and no
algorithm. The only two legitimate promotional surfaces are:

1. **Your own server** - announcements, changelog, sneak peeks, playtests. Unlimited freedom.
2. **Designated self-promo channels in other servers** - most large communities (`#self-promotion`,
   `#showcase`, `#share-your-work`, `#devlog`) allow one post per person per week or per month, with
   explicit rules pinned in the channel.

Everything else is spam and gets you banned from the server, and repeated offences get the account
flagged platform-wide.

Cultural notes:
- Discord users are allergic to marketing copy in a way that exceeds even Bluesky. Write like a person in a
  group chat.
- Reactions, not replies, are the main engagement signal. A post with 40 reactions and 2 replies did well.
- Threads (message threads) keep discussion out of the main channel - use one for any post that will generate
  conversation.
- `@everyone` / `@here` are nuclear. In an announcements channel, use them for real releases only, and give
  people a role to opt in (`@updates`) instead.
- Announcement channels can be **followed** by other servers, which republishes your posts into theirs. This
  is the only organic cross-server distribution Discord offers - set your `#announcements` as an Announcement
  Channel so partner servers can follow it.
- Forum channels (`#showcase`, `#support`) behave like a lightweight forum; posts there stay findable, unlike
  chat messages.

## Formats that work

**Plain message with formatting.** Markdown works: `**bold**`, `*italic*`, `` `code` ``, ```` ```code blocks``` ````,
`> quotes`, `||spoiler||`, `# Heading`, `- lists`, and masked links `[text](url)` (bots/webhooks only).
Keep announcement posts to 600-1,200 characters with line breaks - a wall of text is scrolled past.

**Embed (bot/webhook).** A structured card with title, description, colour strip, thumbnail, image, fields
and footer. This is the right format for changelogs and releases: it is visually distinct from chat, and the
colour strip makes version types scannable (green = feature, orange = fix, red = breaking).

**Image / GIF drop.** Gameplay clips, screenshots, before/afters. Short looping MP4/GIF under 10 MB gets
watched; anything that needs a download does not.

**Event.** Scheduled Events (playtest, AMA, dev stream) show in the server's event list and send reminders.
The best retention tool on the platform.

**Forum post.** For servers with a forum-type showcase channel: title + first message + tags. Titles are
searchable, so write them like a search query, not a slogan.

**Poll.** Native polls (up to 10 answers, 1h-7d duration) for feature prioritisation and playtest scheduling.

## Limits

| Thing | Limit |
|---|---|
| Message content | 2,000 characters (4,000 for Nitro users; **bots and webhooks are always capped at 2,000**) |
| Embeds per message | 10 |
| Total text across all embeds in one message | 6,000 characters |
| Embed title | 256 chars; description 4,096; fields 25; field name 256; field value 1,024; footer 2,048 |
| File upload | 20 MB free tier (25 MB in an ongoing experiment), 50 MB Nitro Basic, 500 MB Nitro; server boost levels raise the server-wide cap |
| Poll | 10 answers, 1 hour to 7 days |
| Channel name | 100 chars; server name 100; forum post title 100 |
| Bot rate limit (global) | 50 requests/second per bot |
| Webhook rate limit | 5 requests per 2 seconds per webhook (**unverified** - Discord does not publish per-webhook numbers; treat 5/2s as a safe ceiling and honour `X-RateLimit-*` headers) |
| Channel message rate | 5 messages per 5 seconds per channel per bot |
| Native scheduling | none for messages (Events can be scheduled) - the engine schedules and fires |
| Cost | free |

Discord returns `429` with a `retry_after` value; always honour it rather than retrying on a fixed backoff.

## Best times

All times UTC; **convert to the business timezone before scheduling.** Discord activity follows the
*gaming/evening* curve, not the office curve.

- **Weekday peak: 19:00-23:00 UTC** for a European + US-East audience; **00:00-03:00 UTC** catches US-West
  evening.
- **Weekend peak: 15:00-23:00 UTC, Saturday and Sunday.** Unlike almost every other platform, weekends are
  the *best* time on Discord - that is when people are in voice channels and playing.
- **Worst: 06:00-13:00 UTC** on weekdays (school/work).
- For a Hebrew-speaking / Israeli server: evening is 17:00-20:00 UTC in summer. Friday evening through
  Saturday afternoon is quiet; Saturday night is a strong window.
- Announcements: post when people are *around to react*, because early reactions decide whether others open
  the channel at all.

## Hooks, structure & CTAs

Discord hooks are about *what changed for the reader*, framed as a heads-up between peers. There is no
scroll to stop - the message is already in front of them. What you must earn is a click.

CTAs: one. Prefer a masked link with an action verb. `[Grab the build](url)`, `[Open the patch notes](url)`,
`[Sign up for the playtest](url)`.

### Skeleton 1 - release announcement (embed)

```
Title:        v1.4 - Co-op
Colour:       green
Description:  Two-player local co-op is in. Same save, drop-in/drop-out, second player
              uses any connected gamepad.
Field "New":  Co-op mode - Steam Deck verified - 4 new maps
Field "Fixed":Crash on Alt-Tab during a boss - audio desync on AMD
Field "Known":Split-screen UI overlaps at 4:3
Footer:       Update is live now - restart Steam to pull it
Button/link:  Full patch notes
```
Optionally ping `@updates` (an opt-in role), never `@everyone` for a point release.

### Skeleton 2 - sneak peek / build in public

```
been rebuilding the inventory for two weeks. here's the old one and the new one, same save.

[image: before/after]

the thing that took the time wasn't the UI, it was making drag-and-drop feel right on a
controller. 11 iterations.

what would you change? thread below 👇
```

### Skeleton 3 - post in someone else's #self-promotion channel

```
**[Name]** - [one-line what it is, plain words]

[2-3 sentences: who it's for, what's different, what state it's in]

[one link]
Happy to answer anything here, and if you'd rather tell me it's bad, that's useful too.
```
Read the channel's pinned rules first. Most allow one post per week/month; several require you to have
been in the server for N days, or to comment on others' posts first.

## Hashtag/keyword practice

Discord has **no hashtags**. `#name` is a channel link, not a tag. Do not write hashtags in Discord
messages - it marks the post as copy-pasted from another platform, which is the single most common
self-promo mistake.

What matters instead:
- **Forum channel tags.** If you post in a forum channel, apply the correct tags - they are the only filter
  users have.
- **Searchable titles.** Discord search is keyword-based over message text. Write the product name, the
  engine/stack name and the problem in the message body so it is findable later.
- **Role names.** `@updates`, `@playtesters`, `@beta` - build opt-in roles so announcements reach the people
  who want them without `@everyone`.

## Anti-spam & community rules

- NEVER post promotional content in any Discord server or channel we do not own, except in a channel whose pinned rules explicitly designate it for self-promotion, and then only with human approval.
- NEVER use `@everyone` or `@here` for anything other than a genuine release or an outage.
- NEVER DM members of a server with a pitch - Discord treats unsolicited advertising DMs as spam and bans accounts for it.
- NEVER post the same message into multiple servers' self-promo channels in the same session.
- NEVER include hashtags in a Discord message.
- NEVER post more than once per week in another server's self-promo channel, or more often than that channel's stated rule allows, whichever is stricter.
- NEVER join a server and post a link as your first message.

Soft rules: participate in the server for a week before you post anything of your own; answer questions in
`#help` channels in your niche - that builds more trust than any post; when someone gives feedback, thank
them and say what you will do with it; keep your own server's `#announcements` low-volume so the follow
feature stays valuable to partner servers.

## Good vs bad example

**Good** (in a gamedev server's `#showcase`, after two weeks of participating)
```
**Tunnelrat** - a one-button roguelike about a rat in a collapsing subway

Solo project, Godot 4, about 8 months in. The whole game is one button: hold to charge,
release to dash. Everything else (combat, doors, dialogue) is built on that.

Demo's free, ~20 minutes: [link]

The bit I'm least sure about is the tutorial - it takes people about 3 minutes to
understand the charge mechanic and I think that's too long. If you bounce off it, telling
me where would genuinely help.
```

**Bad**
```
@everyone 🎮🔥 CHECK OUT MY NEW GAME TUNNELRAT!!! 🔥🎮 The MOST addictive roguelike of 2026!!
WISHLIST NOW: link  #indiegame #gamedev #roguelike #indiedev
Also join my server: discord.gg/xxxx  DM me for a free key!!
```
Why: `@everyone` abuse in someone else's server, hype with no information, hashtags (wrong platform),
three CTAs, server-poaching, and a DM solicitation - each one individually is a ban.

## Sources

- Discord Developer Docs - rate limits: https://discord.com/developers/docs/topics/rate-limits
- Discord message and embed limits: https://discord.com/developers/docs/resources/message
- Discord character limits 2026 (2,000 / 4,000 Nitro, bots capped at 2,000): https://www.usecarly.com/blog/discord-character-limit/
- Discord embed limits cheat sheet (10 embeds, 6,000 chars total): https://discord-webhook.com/en/blog/discord-webhook-embed-limits/
- Discord file size limits 2026 (20 MB free / 50 MB Nitro Basic / 500 MB Nitro): https://filesize.org/limits/discord/
- Discord Community Guidelines (spam, unsolicited DMs): https://discord.com/guidelines
