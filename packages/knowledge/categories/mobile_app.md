---
category: mobile_app
updated: 2026-09-11
---
# Category playbook: Mobile apps (iOS / Android)

## Where this category wins

The defining fact for mobile: **the App Store and Google Play are themselves the largest discovery channel**,
and everything you do off-store is partly a ranking input for on-store discovery. Ranked by return per hour:

1. **App Store Optimisation (ASO)** - the store listing is the funnel. Title, subtitle, keyword field
   (iOS), short/long description (Play), screenshots, preview video, ratings. Not a "platform" in this
   engine, but the first thing to fix, always.
2. **TikTok / Instagram Reels / YouTube Shorts** - the acquisition engine for consumer apps in 2026. A
   15-second screen recording showing the app solving a real annoyance is the highest-converting asset
   available, and the same clip runs on all three.
3. **Reddit** - vertical subs (r/productivity, r/fitness, r/personalfinance, r/adhd, r/language_learning...)
   are where people describe the problem your app solves. Also r/iosapps, r/androidapps, r/apple for launch
   posts. Strictest rules of any channel here.
4. **Product Hunt** - works well for mobile apps, especially utilities and AI-adjacent apps. Drives the
   "featured" signal and a durable backlink.
5. **Instagram** - for lifestyle, health, finance, parenting and creator-adjacent apps: the audience matches
   and carousels convert.
6. **Discord + Telegram** - retention and beta cohorts, not acquisition.
7. **X / Bluesky / Threads** - founder build-in-public and press/reviewer reach. Threads gives unusually
   good organic reach for consumer topics.
8. **YouTube (long-form)** - review and "best apps for X" videos. Reaching out to mid-size reviewers is a
   real channel; making your own long-form is slow.
9. **LinkedIn** - only for B2B or prosumer apps, and for the founder narrative.
10. **App review sites and press** (TechCrunch, The Verge, MacStories, Android Police, 9to5Mac, local tech
    press) - one-shot, worth a proper pitch for a genuinely novel app.
11. **Facebook groups** - for niche communities (parenting, local hobby, health conditions). Manual,
    approval-gated, high value in the right group.
12. **Pinterest / Steam / itch.io / Hacker News / Google Business Profile** - skip, except HN if the app has
    a real technical story.

## Communities

Each entry lists **the rule that gets you removed if you ignore it**.

### Reddit
| Community | Key posting rule |
|---|---|
| r/iosapps | Launch posts allowed with the correct flair; **must state the price and whether there is a subscription**. Hidden subscriptions are the top complaint. |
| r/androidapps | Same; **disclose if it is free with IAP**. Requires flair and a direct Play link. |
| r/apple, r/android | Huge, and almost entirely hostile to self-promotion. Only genuinely notable apps, and expect scrutiny. |
| r/SideProject | Friendliest place to launch. **Disclose you built it**; no bare links. |
| r/iOSProgramming, r/androiddev, r/FlutterDev, r/reactnative | **Developer** subs - technical posts only. "Check out my app" is removed; "here's how I implemented X, app link at the bottom" is fine. |
| r/alphaandbetausers, r/TestFlight, r/beta | Explicit beta-recruitment subs; reciprocity expected. |
| Vertical subs (r/productivity, r/ADHD, r/GetMotivated, r/fitness, r/personalfinance, r/language_learning, r/bujo) | **Where the users actually are, and almost all ban app promotion outright.** The compliant play: answer questions, disclose affiliation, mention the app only when directly asked. Slow, and the highest-quality installs you will get. |
| r/AppHookup, r/GooglePlayDeals | For price drops and free-for-a-limited-time promotions only. Must be a genuine, time-bounded discount. |
| r/roastmyapp, r/design_critiques | Feedback, reciprocity expected. |

Reddit discipline: 3+ weeks of comments before the first post, one post per sub per 30 days, price and
monetisation disclosed every time, never the same text twice.

### Discord / Telegram / forums
| Community | Key posting rule |
|---|---|
| Your own Discord/Telegram | The beta cohort and the review-day army. Build it during beta, not after launch. |
| **TestFlight / Play beta communities** | Recruit through your own channels and the beta subreddits. Keep testers informed or they churn before launch. |
| **Indie Hackers / Dev.to** | Story with numbers, not an announcement. |
| **Indie iOS/Android dev Discords, Slack groups** | `#showcase` channels, one post per milestone. |
| **Facebook groups** (condition-, hobby- or parenting-specific) | Read the pinned rules; most allow promotion on one day per week or in a pinned thread. Manual only, with approval. |
| **Telegram groups** | Do not promote in groups you do not own. Ban risk is platform-level. |

### Launch programmes
| Programme | Key posting rule |
|---|---|
| **Product Hunt** | One launch, relaunch after ~6 months with a substantive change. Tagline <=60 chars. **Never ask for upvotes.** Include both store links in the gallery. |
| **Apple: "Nominate your app"** (App Store featuring) | Submit through App Store Connect ahead of a release. Apple looks for a polished listing, platform-feature adoption (widgets, Live Activities, App Intents, Vision/watchOS support) and a clear story. A feature is the single biggest install event available to an iOS app. |
| **Google Play: "Nominate for editorial"** / Play Console promotional programmes | Same principle; adopt the newest platform features and keep the listing pristine. |
| **App review sites** (MacStories, 9to5Mac, Android Police, The Sweet Setup, AppAdvice) | Email with a promo code/key, a 60s video, 3 screenshots and a two-paragraph pitch, **7-14 days before launch**. |
| **Beta directories** (BetaList, Betabound, TestFlight roundups) | Free listings, low but non-zero traffic. |
| **Launch aggregators** (Uneed, Peerlist, Fazier, Microlaunch, AppSumo for lifetime deals) | The week after Product Hunt. |

## Launch sequence (first 30 days)

Day 0 assumption: the app is submitted or approved, and at least 10 people outside the team have used it.

**Days 1-6 - the store listing is the product**
- Day 1: **Screenshots.** Six of them, each with a 3-6 word benefit caption on top, in a consistent frame.
  This is the highest-impact asset in the entire launch; most installs are decided on screenshots 1-3.
- Day 2: **Title + subtitle + keyword field (iOS) / short description (Play).** One primary keyword phrase
  people actually type. Not your brand story.
- Day 2: App preview video (15-30s, no intro, the app doing the thing, muted-first).
- Day 3: Long description written for a human, with the keyword phrase used naturally 2-3 times (Play
  indexes the long description; iOS does not).
- Day 3: In-app review prompt wired to fire **after a success moment**, not on launch, and never more than
  the platform limit (iOS: 3 prompts per 365 days).
- Day 4: Analytics: install → first-run → activation → day-7 retention, defined and instrumented in PostHog
  before any traffic.
- Day 5: Landing page with both store badges, a 30s silent demo video, and the privacy policy (required by
  both stores).
- Day 6: Press kit: 5 screenshots, a 60s video, the one-paragraph pitch, promo codes, contact.

**Days 7-14 - content engine and pre-launch audience**
- Day 7: Clip #1 (15-25s screen recording, real use, burned-in captions) → TikTok + Reels + Shorts.
- Day 8: Build the beta/waitlist list: post in r/TestFlight, r/alphaandbetausers, your own channels.
- Day 9: Founder posts start: X/Bluesky/Threads daily build-in-public, one observation per day.
- Day 10: Clip #2. Reply to every comment on clip #1.
- Day 11: Start commenting in 3 vertical subreddits. No promotion. 20 min/day.
- Day 12: Email 15 app reviewers and 5 relevant YouTubers with promo codes, 7-14 days ahead of launch.
- Day 13: Clip #3. Prepare the Product Hunt assets.
- Day 14: Tell the beta list the launch date and ask them to be around on the day - for **reviews**, which
  is the one thing that compounds.

**Days 15-22 - launch week**
- Day 15 (Tue/Wed/Thu): App goes live. **Product Hunt launch at 00:01 PT the same day.** Maker comment
  immediately; reply all day.
- Day 15: Ask the beta cohort for App Store / Play reviews. This is the most valuable 24 hours the app will
  ever have for ratings. Never offer anything in exchange.
- Day 15: Clip #4 (the launch clip), X thread, LinkedIn post if relevant, Threads, Discord/Telegram.
- Day 16: r/iosapps or r/androidapps post with price and monetisation disclosed.
- Day 17: r/SideProject post with a different angle and a real lesson.
- Day 18: Secondary launch platforms (Uneed, Peerlist, Fazier).
- Day 19: Clip #5. Double down on whichever of the first four performed.
- Day 20: Follow up with reviewers who did not reply, once.
- Day 21: Publish the "launch numbers" post - installs, conversion, what worked - on X/LinkedIn/Indie
  Hackers. This consistently outperforms the launch announcement.
- Day 22: Nominate the app for App Store featuring / Play editorial.

**Days 23-30 - retention and iteration**
- Day 23: Look at the day-1 and day-7 retention curve. If day-1 is under 25%, stop marketing and fix
  onboarding - everything else is pouring water into a bucket with a hole.
- Day 24: First update shipped (bug fixes from launch feedback) + a store listing "What's New" that people
  will actually read. Updates are a Play ranking signal.
- Day 25: Vertical-subreddit value post (no link, or a link only in a comment when asked).
- Day 26: Clips #6 and #7, based on what the data said.
- Day 27: A/B test screenshot 1 (both stores support store listing experiments; Play's are more powerful).
- Day 28: Ask activated users (not all users) for reviews in-app after a success moment.
- Day 29: Review acquisition by channel in PostHog; kill the two weakest.
- Day 30: Set the 90-day cadence: 3 clips/week, 1 Reddit value post/fortnight, monthly update + "What's
  New", continuous screenshot testing.

## Content pillars that work

1. **The 15-second annoyance fix.** The app solving one specific irritation, screen-recorded, no narration
   needed. The workhorse for TikTok/Reels/Shorts.
   - Angles: "this is how I stopped X"; the three-tap version of a ten-tap task; the thing your phone
     should do and does not.
2. **Before/after and transformation.** For habit, health, finance and productivity apps.
   - Angles: a real 30-day log; a user's data with permission; the messy shoebox → the organised version.
3. **Behind the app / building in public.** Design decisions, rejections, App Review stories, the honest
   numbers.
   - Angles: "Apple rejected us 3 times, here's why"; the feature we cut; the pricing experiment; the first
     100 users.
4. **Teaching the domain, not the app.** The pillar that builds trust in vertical communities where you
   cannot promote.
   - Angles: a genuinely useful guide to the problem; the mistake everyone makes; a template or checklist.
5. **Community and proof.** Reviews read aloud, user-submitted screenshots, feature requests you shipped.
   - Angles: "you asked for this in a 1-star review and you were right"; the leaderboard; the support
     conversation that changed the roadmap.

Weekly mix: 3 x pillar 1/2 (the clips), 1 x pillar 3 or 5, and pillar 4 running continuously as comments in
vertical communities.

## KPIs and realistic benchmarks

| Metric | Weak | OK | Good | Notes |
|---|---|---|---|---|
| **Store page → install (conversion rate)** | <15% | 25-35% | 45%+ | Driven almost entirely by screenshots 1-3 and the rating. Fix here before buying traffic. |
| **Day-1 retention** | <20% | 25-35% | 45%+ | The onboarding metric. Below 20% nothing else matters. |
| **Day-7 retention** | <8% | 12-20% | 30%+ | |
| **Day-30 retention** | <3% | 6-10% | 15%+ | Consumer-app median day-30 sits in the single digits. |
| Free → paid (freemium) | <1% | 2-5% | 8%+ | |
| Trial → paid (subscription) | <20% | 30-45% | 60%+ | Depends heavily on whether payment details are taken up front. |
| **Rating** | <4.0 | 4.3-4.6 | 4.7+ | Below 4.0 materially suppresses store conversion. Prompt after success moments only. |
| Review count, month 1 | <10 | 30-100 | 300+ | Ask the beta cohort on day 1. |
| Launch-day installs (no ad spend, no audience) | <50 | 200-800 | 2,000+ | Product Hunt top-5 typically adds 300-1,500 installs. |
| Clip → install rate (TikTok/Reels/Shorts) | <0.2% | 0.5-1% | 2%+ | 100k views producing 700 installs is a good clip. |
| Cost per install (if you ever pay) | >$5 | $1.50-3 | <$1 | Only after organic retention is proven. |
| App Store feature | - | - | 5k-100k+ installs | Unpredictable; nominate every meaningful release. |
| Reviewer/press reply rate | <2% | 5-10% | 20%+ | Personalised, with a promo code and a 60s video. |

Reality check: a solid 30 days with no ad budget produces roughly **500-3,000 installs and 30-150 ratings**
for a consumer app. Retention, not install count, decides whether month 2 is bigger than month 1.

## Common mistakes

1. **Treating the store listing as an afterthought.** Screenshots outperform every off-store tactic in this
   file, per hour spent.
2. **Screenshots that are just device frames with no captions.** Every screenshot needs a 3-6 word benefit
   line readable at thumbnail size.
3. **Asking for reviews on first launch** or with a generic prompt. Prompt after a success moment; iOS
   allows only 3 prompts per user per year - do not waste them.
4. **Hiding the subscription.** Both stores' reviewers and Reddit's app subs punish this hard, and it
   generates 1-star reviews that cost more than the extra conversions.
5. **Marketing before day-1 retention is above ~25%.** Paid or organic, you are buying churn.
6. **Posting "check out my app" in vertical subreddits.** Instant removal, occasionally a domain ban. Those
   subs are reached by answering questions over months.
7. **One clip and giving up.** Expect 8-15 clips before one works. Judge the channel on its best clip.
8. **Not shipping updates.** Play in particular rewards update cadence, and "What's New" is read.
9. **No landing page.** You need a place for press, App Store review, and people who are on desktop.
10. **Launching on a Friday or into a major platform event** (WWDC, Google I/O week, a big iOS release week).
11. **Ignoring localisation.** Localising the store listing (title, subtitle, keywords, screenshots) into
    3-5 languages is one of the cheapest install multipliers available.
12. **Burning the beta list before launch day** - use them for reviews on day 1, not for installs in week -2.
13. **Vanity install tracking.** Installs without activation and day-7 retention tell you nothing.
14. **Asking for 5-star reviews explicitly.** Against both stores' guidelines; ask for "a review", never a
    rating value, and never offer anything in return.

## Sources

- `platforms/tiktok.md`, `platforms/instagram.md`, `platforms/reddit.md`, `platforms/product_hunt.md`,
  `platforms/youtube.md` in this package
- Apple App Store Product Page and ASO guidance: https://developer.apple.com/app-store/product-page/
- Apple: requesting App Store reviews (3 prompts / 365 days): https://developer.apple.com/documentation/storekit/requesting-app-store-reviews
- Nominate your app for App Store featuring: https://developer.apple.com/app-store/nominations/
- Google Play store listing and listing experiments: https://support.google.com/googleplay/android-developer/answer/9866151
- Google Play ratings and reviews policy (no incentivised reviews): https://support.google.com/googleplay/android-developer/answer/9898684
- r/iosapps and r/androidapps posting rules: https://www.reddit.com/r/iosapps/wiki/rules
- Mobile retention benchmark ranges: https://www.adjust.com/resources/ebooks/mobile-app-trends/
