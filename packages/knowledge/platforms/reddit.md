---
platform: reddit
updated: 2026-09-11
wave: 2
---
# Reddit

## Audience & culture

Reddit is the highest-intent and highest-risk channel in the plan. A single well-placed post in the right
subreddit can outperform three months of everything else; a badly-placed one gets the account banned from
that subreddit permanently and can get the domain site-wide shadowbanned.

The governing reality: **every subreddit is its own country with its own laws.** Sitewide rules are the
floor; the sidebar, the wiki and the pinned mod post are what actually apply. The engine must read a
subreddit's rules before drafting, and **every community post requires human approval**.

Cultural notes:
- Reddit hates marketing and loves makers. "I built this, here's how, here's what's broken" works. "Check
  out our solution" does not.
- Disclose affiliation in the post body. Being found out later is worse than being downvoted now.
- Comment karma matters more than post karma to AutoModerator and to humans. Comment for weeks before you
  post.
- Titles carry the post. Reddit is a title-driven platform; the body is read by people the title convinced.
- The first hour decides everything - early upvote velocity determines whether the post reaches r/all or
  dies at 3 points.
- Reddit posts rank in Google. A good thread is a durable SEO asset, unlike a social post.

## Formats that work

**Text (self) post.** The default for anything in a discussion or maker community. 300-900 words, with
formatting: a bolded TL;DR, headers, a short list, and a genuine question at the end.

**Image post.** For visual products and games. Reddit's native image host performs better than an external
link. 1080x1080 or 1920x1080.

**Video post.** Native upload autoplays; external YouTube links get fewer views. Under 60 seconds, captions
burned in.

**Link post.** Only where the subreddit's culture expects it (news subs). In maker subs, a link post with no
body reads as a drive-by.

**Comment.** Genuinely the highest-ROI Reddit activity for a business. Answering a question in your domain,
where your product is *one* of several answers you mention, builds more durable traffic than any post.

**AMA.** Only after you have standing. Requires mod coordination.

**Weekly self-promo / feedback threads.** Most maker subs have one (`Self-promotion Saturday`, `Feedback
Friday`, `Marketing Monday`). These are the compliant way to promote and should be the default plan.

## Limits

| Thing | Limit |
|---|---|
| Title | 300 characters |
| Self-post body | 40,000 characters |
| Comment | 10,000 characters |
| Images per gallery post | 20 |
| Image upload | 20 MB |
| Video upload | 1 GB / 15 minutes |
| Subreddit-side gates | most strict subs require 30-90 days account age and 50-500 karma (commonly comment karma); thresholds are usually unpublished |
| Posting cooldown | Reddit rate-limits new/low-karma accounts to roughly 1 post per 10 minutes sitewide |
| API rate limit | **100 queries per minute per OAuth client ID** (10 QPM unauthenticated), averaged over a 10-minute window |
| API access | free for non-commercial use within 100 QPM; **commercial use requires Reddit approval and a paid agreement (~$0.24 per 1,000 calls; reported enterprise entry ~$12,000/mo)** - the engine's use is borderline and must be reviewed |
| App approval | new API apps need manual approval |
| Native scheduling | mod-only (subreddit scheduled posts); the engine schedules and fires |

## Best times

All times UTC; **convert to the business timezone before scheduling** - but note that most large English
subreddits are US-centric, so **US Eastern is the reference timezone, not the business's.**

- **Best: 12:00-15:00 UTC** (07:00-10:00 US Eastern) Monday-Thursday. Posts made as the US wakes up have the
  full working day to accumulate votes.
- **Secondary: 17:00-19:00 UTC** (lunchtime US Eastern).
- **Best days: Monday and Tuesday** for maker/business subs; **Saturday morning US** for hobby and gaming
  subs.
- **Worst: Friday evening and Saturday night US time.**
- Non-US subreddits (r/israel, r/europe, national subs) follow their own local curve - check the sub's own
  activity pattern rather than assuming US hours.
- **The first hour is everything.** Only schedule a Reddit post for a time when a human can reply to comments
  for the following 60-90 minutes.

## Hooks, structure & CTAs

The title does the work. Aim for a title that a) states a concrete outcome or situation, b) contains no
marketing adjectives, c) makes the reader curious about the *how*.

Good title patterns:
- "We cut our onboarding from 9 screens to 2. Here's what we learned (and what broke)."
- "I spent 8 months building a one-button roguelike. It flopped. Postmortem."
- "Free tool I built to diff Postgres schemas - looking for people to tell me what's wrong with it"

Bad title patterns: anything with "Introducing", "Check out", "The best", an exclamation mark, or emoji.

CTAs: one, and it should be a request for *feedback*, not a purchase. "Would love to hear where it breaks."

### Skeleton 1 - maker post / Show-and-tell (r/SideProject, r/IndieDev, r/SaaS)

```
Title: [Concrete outcome or honest framing, no adjectives]

**What it is:** [one sentence, plain]
**Why I built it:** [the personal itch - 2-3 sentences, specific]
**How it works:** [3-5 bullets, technical enough to be credible]
**What's not good yet:** [2-3 real weaknesses - this is the part that earns trust]
**Disclosure:** I built this. [Free / $X / open source].

[Link]

What I'd most like feedback on: [one specific question].
```

### Skeleton 2 - value post (no product in the title or first half)

```
Title: [A lesson or teardown with a number]

[The situation, 2 paragraphs, specific and honest]

[What you tried that didn't work - at least two things]

[What worked, with the mechanism]

[The numbers]

[Only here, one line: "I run [product] - that's where these numbers come from. Happy to
go into detail on any of this."]
```

### Skeleton 3 - weekly self-promo thread comment

```
**[Name]** - [one line, plain words]

[2-3 sentences: who it's for, what stage it's at, what's different]
[Link]
[One honest line about a limitation]

Happy to swap feedback with anyone else in this thread - drop yours and I'll look.
```
Feedback-exchange subs (r/playmygame, r/alphaandbetausers, r/roastmystartup) *require* reciprocity: look at
other people's work and comment before or immediately after posting your own.

## Hashtag/keyword practice

- **Reddit has no hashtags.** Writing one marks the post as cross-posted spam. Zero, always.
- **Flair is mandatory in most subs** and is the closest analogue - pick the correct flair or AutoModerator
  removes the post.
- **Title keywords matter for Google**, which is where a large share of Reddit's long-tail traffic comes
  from. Write the title the way someone would search for the problem.
- Subreddit search is weak; the practical discovery mechanism is Google `site:reddit.com` + the sub name.
  Write for that.
- Do not keyword-stuff the body; Reddit readers notice immediately.

## Anti-spam & community rules

- NEVER post to any subreddit without human approval and without reading that subreddit's rules, sidebar and wiki first.
- NEVER post from an account younger than 30 days, with under ~100 comment karma, or whose self-promotional share of recent posts would exceed 10% after this post.
- NEVER post the same title or body to more than one subreddit (crossposting the identical text is the single most common ban reason).
- NEVER post more than once per subreddit per 30-day launch window.
- NEVER solicit upvotes, use alt accounts to vote or comment on your own post, or ask anyone to upvote a link.
- NEVER post outside a subreddit's designated self-promotion thread when the rules restrict promotion to that thread.
- NEVER omit a disclosure that you are the maker or are affiliated with the product.
- NEVER delete and repost a post that underperformed - mods see it and read it as manipulation.
- NEVER DM a redditor a product pitch after they comment on your post.

Soft rules: build comment karma in the target subs for 2-4 weeks before the first post; answer every comment
including the hostile ones, without defensiveness; if a mod removes the post, message them politely once and
accept the answer; prefer being the third-best answer in someone else's thread over posting your own.

## Good vs bad example

**Good** (r/SideProject)
```
Title: I built a Postgres schema diff tool because I broke production twice in one month

Both times were the same mistake: a migration that worked on my machine and not on staging,
because staging had drifted. I couldn't find a tool that showed me drift in a way I'd
actually read at 2am, so I wrote one.

It connects to two databases and prints a diff: tables, columns, indexes, constraints,
and (the part I actually needed) which differences would break a migration vs which are
cosmetic.

What's not good yet: it doesn't handle partitioned tables, the CLI output is ugly on
narrow terminals, and I've only tested it against PG 15-17.

It's free and open source (MIT): [link]. I built it, that's the disclosure.

The thing I'd most like to know: is "would this break a migration" a useful classification,
or is it too clever and people just want the raw diff?
```

**Bad**
```
Title: 🚀 Introducing SchemaGuard - The BEST Postgres tool of 2026! Check it out!!

Hey guys! We're excited to introduce SchemaGuard, the revolutionary AI-powered database
solution that will transform your workflow! 🔥

✅ AI-powered
✅ Enterprise-ready
✅ 10x faster

Sign up now and get 50% off: [link]
Upvote if you like it! Also posted this in r/PostgreSQL, r/devops and r/programming!
```
Why: marketing title with emoji, no disclosure, no substance, unverifiable claims, discount CTA, upvote
solicitation, and an admission of crossposting identical text to three subs - any one of which is a ban.

## Sources

- Reddit Data API rate limits (100 QPM OAuth / 10 QPM unauthenticated): https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki
- Reddit Data API terms and commercial pricing: https://prowlo.com/blog/reddit-data-api
- Reddit self-promotion norms 2026 (90/10 retired officially, enforced by mods): https://redship.io/blog/reddit-self-promotion-rules
- Subreddit karma and account-age gates 2026: https://www.subredditanalyzer.com/how-much-karma-do-you-need-to-post-on-reddit
- Reddit Content Policy (vote manipulation, spam): https://redditinc.com/policies/content-policy
- Reddiquette: https://support.reddithelp.com/hc/en-us/articles/205926439
