---
name: platform-playbooks
description: Where the marketing knowledge lives (packages/knowledge) and the hard anti-spam rules every runtime agent must respect. Load when writing prompts, playbooks, or compliance rules.
---
# Platform playbooks

Knowledge lives in `packages/knowledge/`:
- `platforms/<platform>.md` - audience, formats, limits, best times, hooks, rules, examples.
- `categories/<category>.md` - game | saas | mobile_app | local_business: where to promote, launch sequence, community lists, KPIs.
- `rules/anti-spam.md` - the hard rules below (source of truth, quoted by compliance-guard).
- `index.ts` loads files as strings for prompts (`loadPlaybook(platform)`, `loadCategory(category)`).

## Hard rules (NEVER)
- NEVER post to a community (subreddit, HN, Product Hunt, Discord server or Telegram group we do not own, Facebook group) without human approval.
- NEVER post identical text to more than one community; adapt to each community's tone and rules.
- NEVER exceed one promotional post per community per launch window (30 days) unless the community explicitly allows more.
- NEVER post on Reddit from an account younger than 30 days or with >10% self-promotion share (90/10 rule).
- NEVER mass-DM, solicit upvotes/votes, or use engagement pods.
- NEVER claim features, numbers, prices or awards not present in the business description or website.
- NEVER post in Discord/Telegram outside owned channels or explicitly designated promo channels.
- NEVER include hashtags on Hacker News; NEVER use marketing tone in a Show HN title.

## Soft rules
Lead with value (what the reader gets), one CTA, native format per platform (Reels/Shorts vertical 9:16, carousel for how-tos, text-first on Bluesky/Threads/X), alt text on every image, language per business setting, emojis only where the platform's culture uses them.
