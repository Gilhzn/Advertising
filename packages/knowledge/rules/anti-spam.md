---
scope: all
updated: 2026-09-11
kind: rules
---
# Anti-spam and compliance rules

Source of truth for `compliance-guard`. Every hard rule is a single line starting with `- NEVER` so it can be
matched, quoted and enforced mechanically. A draft that violates any hard rule is **blocked**, not softened.
Soft rules are quality guidance: violating them lowers the score and triggers a rewrite, not a block.

## Hard rules (NEVER) - block the post

- NEVER post to a community we do not own (subreddit, Hacker News, Product Hunt, a Discord server or Telegram group we do not administer, a Facebook group, an itch.io or Steam forum board) without explicit human approval recorded on the post.
- NEVER post identical or near-identical text (>80% similarity) to more than one community; adapt tone, framing and examples to each community's rules.
- NEVER exceed one promotional post per community per launch window (30 days) unless that community's written rules explicitly allow more (e.g. a weekly self-promo thread).
- NEVER post to Reddit from an account younger than 30 days, with under ~100 comment karma, or whose self-promotional share of recent posts would exceed 10% after this post (90/10 discipline).
- NEVER mass-DM users, cold-DM people who have not contacted the business, solicit upvotes/votes/reviews, join or use engagement pods, or offer anything of value in exchange for a vote, follow or review.
- NEVER claim a feature, metric, price, customer count, funding, award, ranking, certification or partnership that is not present in the business description, the website, or an approved source document.
- NEVER invent testimonials, reviews, user quotes, download counts, revenue figures, "used by X companies" claims, or fake scarcity ("only 3 spots left") that is not a real, enforced limit.
- NEVER post in a Discord server or Telegram group outside channels we own or channels the server rules explicitly designate for self-promotion.
- NEVER include hashtags, emoji or marketing tone in a Hacker News submission, and NEVER use a Show HN title that is anything other than "Show HN: <name> - <plain description of what it is>".
- NEVER ask for upvotes on Product Hunt, Hacker News or Reddit; asking people to "check it out, comment and give feedback" is the only permitted phrasing.
- NEVER publish a medical, health, legal, financial, earnings or safety claim (cures, treats, diagnoses, "guaranteed returns", "you will make $X", "risk-free investment") unless the exact claim is present in an approved source document and the required disclosure is included.
- NEVER omit a sponsorship, affiliate, partnership or paid-promotion disclosure when one applies; the disclosure goes in the visible part of the post (before any "see more" fold), not in a comment or the last hashtag.
- NEVER impersonate a person, brand, employee or customer, and NEVER post as if a first-person user experience were ours when it is not.
- NEVER publish a post that contains an unresolved template placeholder (`{{...}}`, `TODO`, `LOREM`, `INSERT`, `[name]`) or a broken/unset destination link.
- NEVER use a competitor's brand name in a way that disparages them, implies endorsement, or targets their trademark in hashtags or ad copy.
- NEVER include personal data of a third party (a customer's name, photo, email, phone, address, or a screenshot containing them) without recorded consent.
- NEVER post the same link to more than 3 platforms within a 15-minute window; stagger cross-platform publication by at least 20 minutes per destination.
- NEVER automate an account action a platform forbids: auto-follow/unfollow, auto-like at scale, automated comment spraying, or creating accounts programmatically.
- NEVER post AI-generated media that depicts a real, identifiable person, or that is photorealistic and could be mistaken for a real photo of a real event, without an on-post AI disclosure.

## Soft rules (score down, rewrite)

- Lead with the value to the reader in the first line; the product name can wait until line two.
- One CTA per post. Two CTAs halve both.
- Use the native format: 9:16 vertical for Reels/Shorts/TikTok, carousel for how-tos and teardowns, text-first on Bluesky/Threads/X/HN, image-first on Instagram/Pinterest.
- Alt text on every image, always. Describe the content, not the brand.
- Write in the business's configured content language (`en` or `he`); never mix languages in one post body.
- Emojis only where the platform culture uses them (Instagram, Threads, TikTok, Telegram: yes. LinkedIn: sparingly, max 2. HN, Steam announcements, r/gamedev: none).
- Hashtags: 3-5 on Instagram/Threads, 0-2 on X/Bluesky/LinkedIn, 2-5 keyword-style on TikTok, 0 on Reddit/HN/Discord/Telegram/Steam.
- Prefer specific numbers you actually have ("loads a 40MB project in 1.2s") over adjectives ("blazing fast").
- Disclose that you are the maker whenever posting your own product into a discussion space. "I built this" beats being caught.
- Reply to every comment in the first 3 hours after posting; an unattended launch thread reads as a drive-by.
- Give value before asking: in any community, comment on other people's posts for at least a week before your own post lands.
- Keep the link out of the first comment only when the platform actually penalises links; on most platforms in 2026 the in-post link performs fine and hiding it looks manipulative.

## Per-platform legal and policy notes

**All platforms - advertising disclosure.** Paid or incentivised content must be disclosed in-post. The FTC
Endorsement Guides require a clear, conspicuous, unavoidable disclosure ("#ad", "Paid partnership with X",
"I was given this free"). In the EU, the UCPD/DSA equivalent applies; in Israel, Consumer Protection Law
requires marketing content to be identifiable as such. Put the disclosure before the fold.

**Meta (Facebook, Instagram, Threads).** Branded content must use the platform's paid-partnership label, not
only a text disclosure. Ads and organic posts about housing, employment, credit, social issues, elections or
politics fall under Special Ad Categories / authorisation - do not auto-publish those. No before/after body
images, no claims of guaranteed health or weight-loss outcomes, no personal-attribute targeting language
("you diabetics").

**LinkedIn.** Professional context: no exaggerated income claims, no "get rich" framing, no MLM recruitment
language. Job postings and financial-services content are subject to extra policies. Disclose employer
affiliation when writing about the employer.

**X.** Financial promotion rules apply to crypto/trading content; unlabelled paid promotion violates the
Advertiser/Creator policies. The API bills per post - a compliance failure costs money as well as reach.

**Reddit.** Sitewide rules ban vote manipulation, ban evasion and undisclosed commercial spam. Each subreddit's
own rules take priority over anything in this file; read them (in the sidebar and the wiki) before drafting.
Disclose affiliation in the post body, not just in a reply.

**TikTok / YouTube.** Branded-content toggle is mandatory for paid promotion. No health, medical or financial
outcome claims. AI-generated realistic content must be labelled with the platform's AI-content toggle.
YouTube additionally requires the "altered or synthetic content" disclosure in the upload flow.

**Google Business Profile.** Posts must be about this specific location. No pricing or offers you will not
honour, no phone numbers or URLs in the image, no soliciting or gating reviews (review-gating is a policy
violation and grounds for suspension). Never post a review you did not receive.

**Pinterest.** No misleading claims, no "before/after" health/weight imagery, no repetitive near-duplicate pins
for the same URL (Pinterest treats that as spam).

**Hacker News.** No hashtags, no marketing adjectives, no vote solicitation, no astroturfing, one Show HN per
project (a substantive update may justify a second, months apart). Respond personally in the thread.

**Product Hunt.** Only the maker or an authorised hunter may launch. No vote solicitation, no incentivised
votes, no coordinated voting groups; PH detects and zeroes those. Ask for comments and feedback instead.

**Steam.** Announcements must be about the game and the store page; no off-topic promotion, no linking to
competing storefronts in a Steam announcement, no fake discount framing (Steam enforces discount cadence
rules). Never claim a review score or award you have not received.

**itch.io.** Release Announcements board for finished releases; Devlogs board for progress updates with
screenshots. "Dumping links and leaving" is explicitly removable. Keep self-promotion to a reasonable level.

**Telegram / Discord.** Unsolicited promotion in groups you do not own is spam and gets the account banned at
platform level, not just kicked. Bot broadcasts must respect rate limits and must offer an unsubscribe path.

**Email adjacency.** Any post that collects emails must link to a privacy policy; GDPR/CCPA consent language is
required for EU/California audiences, and Israeli Amendment 40 (spam law) requires opt-in plus an unsubscribe
mechanism for commercial messages.

## Escalation

If a draft trips a hard rule, `compliance-guard` returns `blocked` with the exact NEVER line quoted and a
suggested compliant rewrite. If a draft is uncertain (a claim that may or may not be supported by the source
documents), it returns `needs_human` rather than guessing.

## Sources

- Platform playbooks skill: `.claude/skills/platform-playbooks/SKILL.md` (hard rules origin)
- FTC Endorsement Guides / .com Disclosures: https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking
- Meta Branded Content policies: https://www.facebook.com/policies_center/branded_content
- Reddit content policy: https://redditinc.com/policies/content-policy
- Hacker News guidelines: https://news.ycombinator.com/newsguidelines.html
- Product Hunt launch guidelines: https://www.producthunt.com/launch/preparing-for-launch
- Google Business Profile content policy: https://support.google.com/business/answer/7213077
- Steamworks announcement and discount rules: https://partner.steamgames.com/doc/marketing
- itch.io Release Announcements board rules: https://itch.io/board/10022/release-announcements
