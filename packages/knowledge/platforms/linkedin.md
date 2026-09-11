---
platform: linkedin
updated: 2026-09-11
wave: 1
---
# LinkedIn (personal profile)

## Audience & culture

LinkedIn is the only platform where **B2B buying actually happens organically**. The audience is
decision-makers, operators, recruiters and job-seekers, in a professional frame of mind, on a desktop or a
commute.

The single most important structural fact: **personal profiles massively outreach Company Pages.** A post
from the founder's profile typically gets 5-20x the reach of the same post from the company Page. The engine
publishes to the personal profile by default (self-serve API); Company Page posting requires LinkedIn's
Community Management API review.

Cultural notes:
- LinkedIn rewards **dwell time** and **comments**, not likes. A post someone reads for 30 seconds and
  comments on beats one with 200 reactions.
- The algorithm suppresses outbound links less than folklore claims in 2026, but a link still costs some
  reach. The standard compromise: link in the first comment *and* a line in the post saying "link in the
  comments". Do not hide the link entirely - that is now seen as a tired growth hack.
- Native documents (PDF carousels) and multi-image posts are the highest-engagement formats.
- Personal narrative works, but the "broetry" style (one. line. per. sentence. with a fake profound ending)
  is now widely mocked. Write like a competent colleague, not a LinkedIn influencer.
- Posting cadence: 2-4 times per week beats daily. LinkedIn dampens reach when you post more than once in
  ~18 hours.
- Comments on **other people's** posts are a first-class distribution channel. A thoughtful comment on a big
  post reaches more people than most of your own posts.

## Formats that work

**Text post.** 1,300-1,900 characters is the measured sweet spot (1,301-2,500 shows roughly a 27%
engagement lift over posts under 400 characters). Short paragraphs, one idea each, whitespace.

**Document / PDF carousel.** Upload a PDF; LinkedIn renders a swipeable carousel. 1080x1350 (4:5) pages,
8-12 pages. Highest engagement format on the platform (~6% typical engagement rate on multi-image and
document posts vs ~5.6% on video).

**Multi-image post.** 2-9 images, 1200x1500 (4:5). Good for event recaps, before/afters, team.

**Native video.** 1-3 minutes, 1080x1350 (4:5) or 1080x1920 (9:16) for LinkedIn's vertical video feed.
Captions burned in (most watch muted). **Under 30 seconds drives the highest completion rate**; 30-90
seconds is the practical maximum for feed video.

**Poll.** 2-4 options, 1 day to 2 weeks. Large reach, low quality signal - use sparingly and only when the
answer genuinely informs something you will publish afterwards.

**Newsletter article.** For long-form (1,000+ words). Subscribers get a notification per issue - the
closest thing to owned email on the platform. Worth starting if the business publishes regularly.

## Limits

| Thing | Limit |
|---|---|
| Post text | 3,000 characters |
| Visible before "see more" | ~210 characters on desktop, ~140 on mobile - **the first 2 lines are the entire hook** |
| Images | up to 9 per post; 5 MB each; 1200x1500 (4:5) recommended |
| Document (PDF) | up to 300 pages / 100 MB; 8-12 pages performs best |
| Native video | 3 seconds to 15 minutes (API upload up to 30 min); 5 GB max; 75 KB min |
| Comment | 1,250 characters |
| Headline | 220 characters; About section 2,600 |
| Article | 110,000 characters |
| Poll | 4 options, 30 chars each |
| API | personal profile posting via `w_member_social` is self-serve; **Company Page posting requires Community Management API approval** |
| API rate limit | per-app and per-member daily throttles (LinkedIn does not publish exact numbers publicly - **unverified**); design for <= 5 posts/member/day |
| Native scheduling | LinkedIn's own UI supports scheduling; the API does not - the engine schedules and fires |
| Cost | free |

## Best times

All times UTC; **convert to the business timezone before scheduling.** LinkedIn is an office-hours
platform, so the business timezone (and the audience's) is decisive.

- **Best: Tuesday-Thursday, 08:00-10:00 local** - the commute/first-coffee window. Aggregated 2026 data
  puts Tue-Thu 08:00-10:00 at the top.
- **Secondary: 11:00-12:00 local** and **16:00-17:00 local.**
- Recent 2026 data also shows **Thursday and Friday** leading on both volume and engagement in some
  datasets - test Friday morning for your niche rather than assuming it is dead.
- **Avoid: Saturday and Sunday** (engagement drops hard), and after 18:00 local on any day.
- **Israel note:** the working week is Sunday-Thursday. **Sunday 08:00-10:00 local is a prime slot for an
  Israeli audience and dead for a US/EU audience** - if the business targets both, run separate slots.
  Sunday 09:00 Israel = **06:00 UTC** in summer. Friday is a half-day; do not schedule after 11:00 local.
- A LinkedIn post has a long tail (24-48 hours). The first 60-90 minutes determine reach, so post when you
  can be present to reply.

## Hooks, structure & CTAs

The first two lines are 90% of the job. Everything after "see more" is read only by people the hook
convinced.

Hooks that work: a number with a context ("We cut our sales cycle from 71 days to 34"), a mistake ("I
priced our product wrong for two years"), a specific scene ("A customer called at 23:00 on a Friday"), a
crisp counter-position ("Most onboarding docs are written for the person who built the product").

Hooks that fail: "Excited to announce", "I'm humbled to share", "Thoughts?", anything starting with a
definition.

CTAs: one, and make it low-friction. "What am I missing?" (invites comments), "Link in the comments",
"DM me if you want the template" (only if you will actually send it).

### Skeleton 1 - the operator story (best default)

```
[Hook: a specific moment or number - 2 lines max, this is above the fold]

[3-5 sentences of context. What the situation was. Concrete details.]

[What you did. The uncomfortable part.]

[What happened. A real number if you have one.]

[The generalisable lesson in 1-2 lines.]

[One question to the reader.]

(link in the first comment, with "link's in the comments" in the post)
```

### Skeleton 2 - document carousel (B2B teardown)

```
Page 1:  The claim / the number. Huge type. Brand colour.
Page 2:  Why this matters to the reader, in one sentence.
Pages 3-9: One idea per page. A heading, max 25 words, one supporting visual.
Page 10: The summary as a checklist.
Page 11: "I'm [name], I do [thing] at [company]. If this was useful, follow for more of it."

Post text (1,300-1,900 chars):
[Hook]
[The same argument in prose - assume many readers never open the PDF]
[CTA: "Swipe through the deck - the checklist is on the last page."]
```

### Skeleton 3 - launch / milestone (the one time announcement voice is allowed)

```
[Hook: the outcome, not the event. "Our first 100 customers taught us we were selling the
wrong thing." not "We hit 100 customers!"]

[What you learned, 3 specific things, each one sentence]

[What changes because of it]

[Credit, by name, to the people involved - LinkedIn rewards tagging real contributors]

[One CTA]
```

## Hashtag/keyword practice

- **0-3 hashtags.** LinkedIn deprecated hashtag-following feeds; hashtags now do almost nothing for
  distribution. Use 1-3 at most, at the very end, purely as topic labels.
- **Keywords in the first 210 characters** matter for LinkedIn search and for the algorithm's topic
  classification. If you want to be found for "fractional CFO", the phrase belongs in the hook.
- **Tag people, not topics.** Tagging 1-3 genuinely relevant people (who will plausibly engage) is the
  strongest reach lever available. Tagging 10 people who have nothing to do with the post is penalised.
- Optimise the **profile** as a landing page: headline with the value proposition and the keyword, a
  featured section pointing at the product, an About section written for a buyer.
- Comment keywords matter too - your comments are indexed and surfaced.

## Anti-spam & community rules

- NEVER auto-connect, auto-endorse, or send templated connection-request pitches.
- NEVER send an unsolicited sales DM to someone who has not interacted with the business.
- NEVER post more than once per 18 hours from the same profile.
- NEVER use engagement pods or comment-for-comment groups (LinkedIn actively detects and demotes them).
- NEVER publish income, earnings or investment-return claims ("our clients make $50k/month") without substantiation and disclosure.
- NEVER tag people who are not genuinely relevant to the post.
- NEVER post as a person if the content was not approved by that person - personal-profile posting is publishing in someone's own name.
- NEVER repost the same post within 30 days.

Soft rules: reply to every comment with more than "thanks"; spend 15 minutes commenting on others' posts
before and after you publish; keep emojis to 0-2 and never as bullet points; do not use "broetry"
line-per-sentence formatting for its own sake; credit collaborators by name.

## Good vs bad example

**Good**
```
We raised our price 40% and lost one customer.

For two years we charged $49/seat because that's what felt safe. Our closest competitor
charged $120 and we kept hearing "we went with them because it looked more serious".

In March we moved to $69 and grandfathered everyone. One churn. Two upgrades from teams who
said the old price made them doubt us.

The part I got wrong wasn't the number. It was thinking price was a cost question when for
our buyer it was a risk question.

If you've repriced recently - did you lose anyone?
```
Why: above-fold hook with a number, a real admission, a specific mechanism, a generalisable lesson, one
question that invites comments, no hashtags, no link, no hype.

**Bad**
```
🚀 Excited to announce 🚀

I am humbled and honored to share that our REVOLUTIONARY AI-powered SaaS platform has
officially LAUNCHED! 🎉🎉

✅ Cutting-edge AI
✅ Seamless integration
✅ 10x your productivity

DM me "GROWTH" to learn how we can transform your business! 🔥
Book a demo: [link]
Follow me for daily growth hacks!

#ai #saas #startup #entrepreneur #growth #hustle #innovation #digitaltransformation
#leadership #motivation #success #business #marketing #technology #future
```
Why: announcement voice, no information, three CTAs, DM-keyword bait, 15 hashtags, "10x your productivity"
is an unsubstantiated outcome claim, and the outbound link in-post costs reach on top of everything else.

## Sources

- LinkedIn Marketing API - share on LinkedIn (`w_member_social`): https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin
- LinkedIn Community Management API (Company Page posting, requires review): https://learn.microsoft.com/en-us/linkedin/marketing/community-management/
- LinkedIn character limits 2026 (3,000 chars; 210/140 before "see more"): https://authoredup.com/blog/linkedin-character-limit
- Post length engagement data (1,301-2,500 chars, +27%): https://socialrails.com/blog/linkedin-post-character-limits
- Format engagement rates (carousel 6.60%, document 5.85%, video 5.60%): https://finallayer.com/blog/ideal-linkedin-post-length
- Best times to post 2026 (Tue-Thu 08:00-10:00): https://sproutsocial.com/insights/best-times-to-post-on-social-media/
- LinkedIn Professional Community Policies: https://www.linkedin.com/legal/professional-community-policies
