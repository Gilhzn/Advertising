# Hacker News — assisted connector notes

Researched 2026-09-11. Confidence **high** for "the API is read-only": the official HN API is the
Firebase endpoint at `hacker-news.firebaseio.com`, which exposes items, users and the front-page
lists and has **no write methods at all**. Everything else comes from
`packages/knowledge/platforms/hacker_news.md` (**medium** confidence — HN publishes almost no hard
numbers).

## Why assisted

`authKind: "assisted"`, `capabilities.manualPublish = true`. There is no submit endpoint, no OAuth,
no app registration. `publish()` prepares the copy and returns `externalId = "manual:<post id>"`.

Submission must come from a **human, from their own account**. That is not only a technical
constraint: a Show HN submitted by anyone other than the person who will answer the comments fails.

## What the wizard prepares

- **Title: 80 characters, hard limit.** Format `Show HN: <plain description>`. Moderators actively
  rewrite titles containing adjectives, exclamation marks or emoji, and a rewritten title usually
  costs the submission its momentum.
- Text body: ~2,000 characters in practice (HN publishes no figure). What it does, why you built it,
  what is honestly not good yet, what it costs.

`PLATFORMS.hacker_news.maxChars` is 80 — deliberately the *title* limit, because the title is the
submission.

## Rate limits and gates

New accounts that mostly submit their own links get rate-limited; the thresholds are unpublished and
deliberately so. Downvoting needs ~500 karma. Multiple submissions of the same URL are collapsed.

The **second-chance pool** exists: moderators sometimes re-surface a good submission that got no
attention, and you may email `hn@ycombinator.com` **once**, politely, to ask. Abusing it is worse
than not asking.

## Insights

None. `fetchInsights()` returns `[]`. The Firebase API could read points and comment counts for a
known item id, which is a plausible wave-3 addition once the user pastes the item URL back.
