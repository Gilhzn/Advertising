---
platform: telegram
updated: 2026-09-11
wave: 1
---
# Telegram

## Audience & culture

Telegram is not a feed - it is a broadcast and messaging network. There is no discovery algorithm worth
gaming. Growth comes from (a) linking your channel from every other surface you own, (b) cross-posting deals
with other channel owners, and (c) being genuinely worth a notification.

Two surfaces matter:
- **Channels** (one-to-many broadcast, unlimited subscribers, no subscriber chat unless a discussion group is
  linked). This is the owned surface the engine publishes to.
- **Groups** (many-to-many, up to 200,000 members). These are communities we do **not** own. Promotion in a
  group without the admin's explicit permission is spam and gets the bot and the account banned.

Cultural notes:
- Every post is a push notification on someone's phone. Posting 5 times a day is how you lose a channel.
  1 post/day is a healthy maximum; 3-5 per week is normal for a business channel.
- Telegram audiences are international, heavily Russian-, Persian-, Arabic-, Hebrew- and Portuguese-speaking,
  and crypto-adjacent in many niches. Language matters: an Israeli business should run a Hebrew channel,
  possibly with a separate English one, never a mixed-language feed.
- Formatting is rich (bold, italic, spoiler, code, quotes, inline links) and used generously. Emoji as
  bullet markers is normal here, unlike LinkedIn.
- Link previews render and can be disabled per message - disable them when the preview image is ugly or when
  you want a clean text post.
- Pinned messages are the closest thing to a landing page. Keep one pinned "what this channel is + main link".

## Formats that work

**Text broadcast with an inline link.** The bread and butter. 300-800 characters, 2-4 short paragraphs,
bold first line, one link, one CTA button if using a bot.

**Photo + caption.** Image on top, caption under it. Caption is capped at 1,024 characters - if the text is
longer, send the photo and text as two messages or send the text with a link preview instead.
- Recommended image: 1280x720 (16:9) or 1080x1080. JPEG/PNG.

**Media group (album).** 2-10 photos/videos sent as one grouped message; only the first item's caption is
shown. Good for screenshot sets, a feature tour, event photos.

**Video / round video note.** MP4 up to 2 GB via bot upload. Short (15-60s) vertical clips perform best.
Video notes (circular, 1 minute, recorded in-app) feel personal and are impossible to fake-produce - great
for founder updates, but they cannot be sent as a file by a bot in most flows.

**Inline keyboard buttons.** A bot-sent message can carry URL buttons ("Try it", "Read the changelog",
"Join the beta"). This is the single highest-leverage Telegram-native feature for a business channel: CTR on
a button beats an inline link substantially.

**Poll.** Native polls (quiz mode optional) are the cheapest engagement device on the platform and give you
real product signal. Max 10 options, 300 chars per option, 255-char question.

**Pinned announcement.** Pin launch posts; unpin within a week so the pin stays meaningful.

## Limits

| Thing | Limit |
|---|---|
| Message text | 4,096 characters (UTF-8) |
| Media caption | 1,024 characters |
| Media group (album) | 2-10 items |
| Photo upload (bot) | 10 MB by URL / 50 MB by file upload |
| Video / document upload (bot) | 50 MB via Bot API, up to 2 GB with a local Bot API server |
| Poll | 255-char question, 10 options, 300 chars each |
| Channel subscribers | unlimited |
| Group members | 200,000 |
| Bot rate limit (global) | ~30 messages/second across all chats |
| Bot rate limit (per chat) | ~1 message/second |
| Bot rate limit (per group) | **20 messages per minute** in any one group |
| Paid Broadcasts | up to 1,000 msg/sec, requires >=10,000 Stars on the bot balance, costs Stars per message |
| Native scheduling | Telegram apps can schedule; the Bot API cannot - the engine schedules and fires |
| Cost | free |

Every Bot API method counts toward the rate limits, not just `sendMessage` - `editMessageText`,
`sendPhoto`, `deleteMessage` and `answerCallbackQuery` all consume budget.

## Best times

All times UTC; **convert to the business timezone before scheduling.**

- **Weekday peak: 09:00-11:00 UTC and 16:00-19:00 UTC.** Telegram is a phone app - commute and evening
  windows dominate.
- **Evening is strongest overall: 18:00-21:00 local.** For an Israeli audience that is 15:00-18:00 UTC in
  summer (UTC+3), 16:00-19:00 UTC in winter (UTC+2).
- **Avoid 22:00-07:00 local.** A notification at 02:00 costs subscribers, permanently.
- **Best days: Monday-Thursday.** Friday afternoon through Saturday is dead for Israeli/Hebrew channels
  (Shabbat); Saturday evening onward recovers.
- Frequency beats timing here: consistent (same days, same rough hour) matters more than the exact minute.

## Hooks, structure & CTAs

Structure a Telegram post like an SMS from a friend who has something worth your time: one bold line that
says what happened, two lines of detail, one link.

Hooks that work: version numbers ("v2.3 is out - the thing you all asked for"), a number, a question you
will answer in the post, a heads-up with a deadline ("demo goes offline Sunday").

CTAs: exactly one, and prefer an inline button. "Open the changelog", "Grab the demo", "Vote in the poll".

### Skeleton 1 - product update

```
**v2.4 - offline mode**

You can now edit while disconnected; changes sync when you're back. This was the most
requested thing in the channel poll (61%).

Two caveats: conflicts resolve last-write-wins, and attachments still need a connection.

[Button: Read the changelog -> ...]
```

### Skeleton 2 - value post (no ask)

```
**Three ways teams lose a week on onboarding**

1. Seat provisioning by email thread
2. No sandbox data, so nobody can click anything
3. Docs written for the person who built it

We wrote each one up with the fix we use -> link
```

### Skeleton 3 - album drop (game / visual product)

```
[album: 4-6 screenshots]
Caption on the first item:
**Biome pass is done.** Six new environments, all hand-placed. Swipe for the whole set.
Demo link in the pinned message.
```

## Hashtag/keyword practice

- Telegram hashtags work **inside a channel only** - they filter that channel's own history. They are not a
  discovery mechanism across Telegram.
- Use 1-3 hashtags as *category tags* for your own archive: `#changelog`, `#devlog`, `#sale`, `#tutorial`.
  Subscribers click them to find all past posts of that type. This is genuinely useful; do it consistently.
- Global search ranks channels by name, `@username` and description keywords - put your main keyword in the
  channel title and bio, not in post hashtags.
- No emoji-hashtag spam. Never more than 3 tags.

## Anti-spam & community rules

- NEVER post promotional content in a Telegram group we do not own or administer.
- NEVER send unsolicited DMs from the business bot or account to users who have not messaged us first.
- NEVER add users to a channel or group without their action (Telegram treats mass-adding as abuse and limits the account).
- NEVER exceed 20 bot messages per minute into a single group, or 30 messages/second globally.
- NEVER post more than 2 messages per day to an owned channel without a real reason (outage, launch day).
- NEVER publish a post whose only content is a link with no framing.

Soft rules: keep a pinned "start here" message; give subscribers a reason to keep notifications on (early
access, channel-only discounts); use polls to make the channel two-way; if you run a linked discussion group,
moderate it - an unmoderated discussion group fills with crypto spam within days.

Telegram's platform-level enforcement is blunt: a bot that spams gets rate-limited then blocked, and a user
account that mass-DMs gets limited or banned with no practical appeal.

## Good vs bad example

**Good**
```
**The offline bug is fixed.**

If you saw edits vanish after a tunnel or a lift, that was us - a sync retry that dropped the
queue on reconnect. Fixed in 2.4.1, rolling out now, no action needed on your side.

Sorry about that one. If anything still looks off, reply in the discussion group.
```
Why: respects the notification, tells subscribers something they need, honest, one clear next step.

**Bad**
```
🔥🔥 HUGE NEWS 🔥🔥 Our app is the BEST productivity tool of 2026!!! 🚀 Download now!!!
👉 link 👈 Also check our other channels: @x @y @z #app #productivity #startup #saas #tech #best
```
Why: no information, self-awarded superlative, three CTAs, cross-channel spam, meaningless hashtags -
and it fires a push notification to everyone to deliver nothing.

## Sources

- Telegram Bot API reference (limits, methods): https://core.telegram.org/bots/api
- Telegram bot rate limits (30/s global, 1/s per chat, 20/min per group): https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this
- Telegram limits reference: https://limits.tginfo.me/en
- Bot API limits summary 2026: https://www.conferbot.com/limits/telegram
- Paid Broadcasts (1,000 msg/sec, Stars requirement): https://core.telegram.org/bots/api#paid-broadcasts
