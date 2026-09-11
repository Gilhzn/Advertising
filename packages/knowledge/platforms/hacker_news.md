---
platform: hacker_news
updated: 2026-09-11
wave: assisted
---
# Hacker News (Show HN)

## Audience & culture

Hacker News is an extremely high-signal, extremely low-tolerance audience: engineers, founders, researchers,
and a substantial number of people who will read your source code before they read your landing page.

A front-page Show HN can send 10,000-50,000 visitors in a day and produce the most useful technical feedback
you will ever receive for free. A badly-framed one sinks to zero points in twenty minutes and occasionally
gets the domain flagged.

The cultural rules are unusually explicit and unusually enforced:
- **No marketing voice. At all.** Not hedged marketing voice, not "tasteful" marketing voice. Plain
  declarative English describing what a thing is.
- **Show HN is for things people can try.** A blog post, a newsletter, a waitlist page or a landing page is
  not a Show HN. If there is nothing to click and use, it does not belong.
- **You must be the maker and you must be present.** The comment thread *is* the launch. Answering every
  technical question, including the hostile ones, with specifics is the entire game.
- HN respects honesty about limitations far more than polish. "It doesn't handle X yet and here's why" is the
  highest-status thing you can say.
- The audience is allergic to: emoji, exclamation marks, "revolutionary", "game-changing", AI-written
  replies, and any hint of astroturfing. They detect all of it reliably.
- Best fit: developer tools, infrastructure, open source, unusual technical projects, hardware, weird
  experiments, anything with a writeup of how it works. Poor fit: local businesses, consumer marketing apps,
  anything with a signup wall before you can see it.

## Formats that work

**Show HN** - for something you made that people can try now. The canonical format.

**Ask HN** - a question to the community. Not a promotional vehicle; do not use it as one.

**Link submission (plain)** - submitting a genuinely interesting technical writeup (including your own
engineering blog post) with the article's own title and no "Show HN:" prefix. Often a better fit than Show HN
for a company that has interesting engineering but no try-it-now artifact.

**Comment** - the highest-ROI HN activity by far. A substantive comment in a thread adjacent to your domain
builds more credibility than most submissions. Mention your product only if it is directly relevant, and
disclose that you made it.

**The writeup** - the asset that makes all of the above work: a technical post explaining how the thing works,
with real numbers, real tradeoffs and real failure modes. Host it on your own domain.

## Limits

| Thing | Limit |
|---|---|
| Title | **80 characters** (hard limit). Titles are frequently edited down by moderators |
| Text post body | ~2,000 characters practical (HN does not publish a hard figure) |
| Comment | no hard limit; brevity is status |
| Submissions per account | soft-limited; new accounts that submit repeatedly get rate-limited, and multiple submissions of the same URL are dedupe-collapsed |
| Karma gates | downvoting requires ~500 karma; new accounts can submit and comment immediately but are watched |
| Second-chance pool | moderators sometimes re-surface a good submission that got no attention; you can email hn@ycombinator.com once, politely, to ask for a re-run - do not abuse this |
| API | **the HN API is read-only (Firebase). There is no posting API.** The engine prepares the title and text; **the user submits manually** |
| Native scheduling | none |
| Cost | free |

## Best times

All times UTC. HN's audience is US-heavy and the front page is decided by early velocity, so **US hours
are the reference, not the business timezone** - but still convert the chosen slot into the business
timezone before scheduling, because a human has to be awake to work the thread for the next four hours.

- **Best window: 13:00-16:00 UTC** (08:00-11:00 US Eastern / 05:00-08:00 Pacific) on a weekday. Submissions
  landing as the US East Coast starts work have the longest runway.
- **Secondary: 16:00-19:00 UTC.**
- **Best days: Monday-Thursday.** Tuesday and Wednesday are the most-cited.
- **Avoid:** Friday afternoon US time, weekends (lower traffic, though also much lower competition - a
  Saturday Show HN can reach the front page with fewer points), and any day with major tech news.
- **Be available for 4+ hours after posting.** If you cannot answer comments, do not submit. This matters
  more than the hour.
- For an Israeli founder: 14:00 UTC = **17:00 local in summer (UTC+3)** - an easy slot.

## Hooks, structure & CTAs

There is no hook on HN in the marketing sense. There is only an accurate title.

**Title formula:** `Show HN: <Name> – <plain description of what it is>`
- Use an en dash or a hyphen. Lowercase after the dash is fine.
- No adjectives. No "easily", "simply", "powerful", "modern", "AI-powered" (unless the AI part is the
  technical substance, in which case say what model/approach).
- No exclamation marks. No emoji. No hashtags. No ALL CAPS.
- Under 80 characters including the "Show HN: " prefix.

Good titles:
```
Show HN: Pgdiff – compare two Postgres schemas and flag migration-breaking changes
Show HN: I built a 6502 emulator that runs in a spreadsheet
Show HN: Tunnelrat – a roguelike where the only input is one button
Show HN: Self-hosted uptime monitor in a single 4MB Go binary
```

Bad titles:
```
Show HN: The BEST tool for database migrations! 🚀
Show HN: Introducing Pgdiff - the revolutionary AI-powered schema platform
Show HN: Check out my new startup
Show HN: Pgdiff (looking for feedback!!)
```

CTA: none. The link is the CTA.

### Skeleton 1 - the Show HN text (the first comment you post yourself)

```
Hi HN. I'm [name]. [One sentence: what it is.]

[Why it exists: the specific problem, with a concrete incident. 2-4 sentences. No
marketing framing - just what happened.]

[How it works: the technical substance. This is the part HN reads. Name the language,
the approach, the hard part, the thing you had to give up. 3-6 sentences.]

[What it doesn't do: 2-3 honest limitations, stated plainly.]

[Licence / pricing, plainly: "MIT", "free, paid tier for teams at $X", "source is closed,
free tier is N".]

[One specific question you want answered.]

Happy to answer anything.
```

### Skeleton 2 - the engineering writeup (better than a Show HN for many companies)

```
Title (the article's own title, no "Show HN:"):
  "Cutting our Postgres cold start from 4.1s to 900ms"

Article structure:
  1. The symptom, with the number.
  2. How you measured it (tooling, methodology) - HN cares about this more than the result.
  3. The wrong hypotheses you chased first.
  4. The actual cause, with the profiler output.
  5. The fix, with the code.
  6. What it cost / what broke / what you'd do differently.
  7. One paragraph at the end, clearly marked, saying what your company does.
```

### Skeleton 3 - the comment (the slow, reliable route)

```
Someone asks about [your domain] in an unrelated thread.

[Answer the question fully and usefully first, with specifics, whether or not your
product is relevant.]

[Then, only if genuinely relevant: "Disclosure: I built [X], which does this - but for
your case [open source alternative] is probably the better fit because [reason]."]
```
Recommending a competitor when it is the better answer is the single highest-credibility move available on
HN, and it works.

## Hashtag/keyword practice

- **Zero hashtags. Ever.** A hashtag in an HN title or comment is an immediate signal that the poster does
  not belong here.
- No emoji, no `@mentions` (HN has no mention system), no "thread 🧵" formatting.
- **Title keywords:** the name of the technology matters ("Postgres", "Rust", "6502") because readers filter
  by technology, and because HN pages rank in Google. Include the real technical term; exclude the
  category-marketing term.
- HN's own search (Algolia) is used heavily - a clear, technology-naming title is findable for years.
- Do not SEO the title. HN moderators edit editorialised titles, and a title that looks SEO'd is flagged.

## Anti-spam & community rules

- NEVER include hashtags, emoji, exclamation marks or marketing adjectives in a Hacker News title or comment.
- NEVER use a Show HN title that is anything other than "Show HN: <name> – <plain description of what it is>".
- NEVER post a Show HN for something that cannot be tried (a landing page, a waitlist, a blog post, a newsletter).
- NEVER ask for upvotes anywhere, in any channel, including your own newsletter or Slack.
- NEVER use multiple accounts to submit, vote or comment (voting rings are detected and get domains banned).
- NEVER post a pre-written or AI-generated reply in the thread; every comment must be written by the maker in the moment.
- NEVER submit the same project more than once unless months have passed and something substantial changed.
- NEVER post to HN without human approval, and NEVER submit if no human can be present to reply for the next 4 hours.
- NEVER argue with or insult a commenter, and NEVER delete a submission because the feedback is harsh.

Soft rules: read the guidelines once, properly; answer the most critical comment first and most thoroughly;
if someone finds a bug, fix it during the thread and reply with the commit; say "you're right" when you are
wrong; link directly to the thing, not to a marketing page about the thing; if the submission dies, leave it
and email hn@ycombinator.com once to ask about the second-chance pool.

## Good vs bad example

**Good**
```
Title: Show HN: Pgdiff – compare two Postgres schemas and flag migration-breaking changes

Text:
Hi HN. Pgdiff connects to two Postgres databases and prints a diff of tables, columns,
indexes and constraints, marking which differences would break a migration and which are
cosmetic.

I wrote it because I took production down twice in one month. Both times a migration
passed locally and failed on staging, because staging had drifted months earlier and
nobody noticed. The existing tools I tried all printed a complete diff, which at 2am is
400 lines I won't read.

It's a single Go binary, uses the system catalogs rather than parsing DDL, and classifies
each difference by whether a migration touching that object would fail. The classification
is a hand-written rule set (about 40 rules), not inference - I tried inferring it from
migration history and it was wrong often enough to be dangerous.

It doesn't handle partitioned tables or custom types yet, and it's only tested against
PG 15-17. MIT licensed, no hosted version.

The thing I'd most like to know: is "would this break a migration" a useful axis, or do
people just want the raw diff and their own judgement?
```

**Bad**
```
Title: Show HN: 🚀 Pgdiff - The REVOLUTIONARY AI-Powered Database Platform! 🚀

Text:
Hey HN community!! 👋 We're SUPER EXCITED to share Pgdiff, the game-changing AI-powered
solution that will TRANSFORM how your team handles database migrations! 🔥

✅ AI-powered schema intelligence
✅ Enterprise-ready
✅ 10x faster migrations
✅ Trusted by leading teams

Sign up for the waitlist and get 50% off: https://pgdiff.example.com
Would really appreciate some upvotes to help us get visibility!! 🙏
#database #postgres #devtools #ai #startup
```
Why: emoji and exclamation marks in the title, marketing adjectives, "AI-powered" with no technical content,
unverifiable claims ("10x", "trusted by leading teams"), **a waitlist instead of something you can try**
(which disqualifies it as a Show HN outright), an upvote request, a discount CTA, and hashtags. This is
flagged and dead within ten minutes, and the domain may be penalised.

## Sources

- Hacker News Guidelines: https://news.ycombinator.com/newsguidelines.html
- Show HN rules (must be something people can try; no marketing tone): https://news.ycombinator.com/showhn.html
- HN FAQ (titles, 80-char limit, second-chance pool, moderation): https://news.ycombinator.com/newsfaq.html
- HN API (read-only): https://github.com/HackerNews/API
- Show HN launch practice 2026: https://favors.dev/blog/show-hn-launch-guide
- Posting and timing guidance: https://syften.com/blog/hacker-news-marketing/
