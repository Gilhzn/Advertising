---
platform: steam
updated: 2026-09-11
wave: assisted
---
# Steam

## Audience & culture

Steam is where PC games make money, and it is a **wishlist machine, not a social network**. Almost
everything a developer does on Steam is in service of one number: **wishlists before launch**, because
Steam's launch visibility (the Popular Upcoming list, the front-page algorithm, the Discovery Queue) is
driven by wishlist volume and velocity.

The mental model:
- The **store page is the product**. Capsule art, the first 30 seconds of the trailer, and the first three
  screenshots do 90% of the conversion work.
- **Announcements/events** are the only "posting" surface, and they reach people who already follow or
  wishlist the game. They do not acquire new audience directly - but they do drive the algorithm (a game
  with recent activity surfaces more) and they convert wishlists into purchases on launch/sale days.
- **Steam Next Fest** is the single biggest free visibility event available to an unreleased game, and you
  get exactly one shot per game.
- Reviews are the long-term engine: "Very Positive" changes everything downstream, and the first 10-30
  reviews set the tone.

Cultural notes:
- Steam players read the store page carefully and punish mismatch between the trailer and the game.
- The Steam Community is combative and detail-oriented. Answer bug reports in the discussions; it is visible
  to buyers.
- Discount culture is strict: Steam enforces cadence rules (you cannot discount immediately after launch or
  repeatedly at will), and a launch discount is capped.
- Localisation, especially into Simplified Chinese, Russian and Spanish, has an outsized ROI relative to
  effort.

## Formats that work

**Store page.** The foundational asset. Short description (the first thing anyone reads), about section,
capsules, screenshots, trailer, tags, system requirements.

**Announcement / event post.** Published through the Steamworks event tool. Types: Game Update, Major
Update, Sale, Cross-promotion, Dev Stream, Event. Each has its own template and visibility rules. A **Major
Update** announcement gets extra placement; use the type honestly, because misuse is enforceable.

**Steam Next Fest participation.** Demo + livestreams + the fest's own pages.

**Demo.** A separate app on the store page. The single most effective wishlist-generating asset for an
unreleased game.

**Playtest.** A gated build for feedback, requested from the store page. Generates followers and useful data
without spending your "demo moment".

**Curator outreach / Steam keys.** Not a post format but the main press channel - keys to curators,
streamers and press through Steamworks.

**Discussions.** The forum on your own game's page. Moderate it, answer it, pin the roadmap.

### Asset specs
- **Header capsule: 460x215** - the most-seen image; must read at 231x87.
- **Main capsule: 1232x706** - front-page/featured placement.
- **Small capsule: 462x174**; **Vertical capsule: 748x896**; **Library capsule: 600x900**.
- **Screenshots: 1920x1080**, at least 5, ideally 8-10. First three matter most.
- **Trailer: 1920x1080**, 30-90 seconds, gameplay in the first 5 seconds, no logo intro.
- Capsule rule of thumb: **the game's name legible at thumbnail size, and one instantly readable visual
  idea.** No scenes, no busy collages.

## Limits

| Thing | Limit |
|---|---|
| Short description | 300 characters (the text that appears in search, the queue and link embeds) |
| About / full description | no practical hard limit (the engine's metadata records 10,000 chars as the working cap); use Steam's BBCode for structure |
| Announcement title | ~100 characters practical |
| Announcement body | BBCode; images, GIFs and embedded YouTube supported |
| Tags | up to 20 (Steam uses the top 15); players can also add tags |
| Screenshots | at least 5 required; 1920x1080 |
| **Steam Direct fee** | **$100 per app**, recoupable after $1,000 of adjusted gross revenue |
| **Next Fest: one per game, ever** | a title may participate in **only one** Next Fest |
| Next Fest eligibility | unreleased and staying unreleased until after the fest; public store page (Coming Soon counts); **a playable demo live before the fest begins**; Steamworks account in good standing; not a prologue or repackaged preview of an already-released Steam title |
| Next Fest 2026 dates | **23 Feb - 2 Mar 2026**, **15-22 Jun 2026**, **19-26 Oct 2026** (Oct edition runs 10:00 PDT to 10:00 PDT) |
| Next Fest registration deadline | roughly **7-8 weeks before** the event (for Oct 2026: registration closed 31 Aug 2026; recommended demo submission 21 Sep; all items in review by 5 Oct) |
| Discount rules | a discount requires ~30 days between discounts and ~30 days after release before the first discount; launch discounts are limited |
| API | the Steamworks Web API does **not** expose announcement posting for third-party apps. **The engine prepares the announcement copy and assets; the developer publishes through Steamworks manually** |
| Native scheduling | yes, inside Steamworks - events and announcements can be scheduled, and store page/launch times are set in Steamworks |
| Cost | $100 Steam Direct fee per app; 30% revenue share (25% above $10M, 20% above $50M) |

## Best times

All times UTC; **convert to the business timezone before scheduling.** Steam's audience is global with a
heavy US + Western Europe + China skew.

- **Launches and major announcements: 10:00 Pacific (17:00/18:00 UTC depending on DST)** - this is the hour
  Valve uses for its own events (Next Fest starts and ends at 10:00 PT) and it puts you in front of the US
  morning, the EU evening and the Asian late night in one shot.
- **Best launch days: Tuesday, Wednesday, Thursday.** Avoid Fridays (the weekend charts are set by then),
  Mondays, and the week of any Steam seasonal sale or a major AAA release.
- **Avoid entirely:** the Steam Summer Sale, Autumn Sale and Winter Sale windows for a *launch* (your game
  competes with 90%-off AAA titles); these are excellent windows for a *discount announcement* on an
  already-released game.
- **Announcement cadence for an unreleased game: every 2-4 weeks.** Steam rewards a store page with recent
  activity; a page with nothing for six months looks abandoned to both the algorithm and the player.
- For Israel (UTC+3 summer): 10:00 PT = **20:00 local**.

## Hooks, structure & CTAs

Steam's hook is the **capsule + short description pair**. They are seen together, thousands of times, in
lists you do not control.

**Short description (300 chars)**: genre + the specific twist + the fantasy, in plain language. No
adjectives about how good it is - describe what the player does.

### Skeleton 1 - store page core

```
Short description (<=300):
  [Genre] where [the specific mechanic twist]. [What the player does, one sentence.]
  [The fantasy or the stakes, one sentence.]

  e.g. "A roguelike where your only input is one button. Hold to charge, release to dash -
  every attack, door and conversation runs through the same mechanic. Get out of a
  collapsing subway before it finishes collapsing."

About the game (BBCode):
  [Animated GIF]
  [h2] What you do [/h2]       - 3 sentences, second person
  [h2] Features [/h2]          - 4-6 bullets, each one concrete and verifiable
  [GIF]
  [h2] How long is it [/h2]    - honest
  [h2] Accessibility [/h2]     - controls, colourblind, subtitle size (players filter on this)
  [h2] About the team [/h2]    - short, human

Tags:        up to 20, ordered - the first ones weight most
Trailer:     gameplay in the first 5 seconds, no studio logo intro
Screenshots: 8-10, 1920x1080, first three show three different things
```

### Skeleton 2 - major update announcement

```
Title: [Update name] - [the single headline change]
       "Patch 1.4: Co-op"

[Header image, 1920x1080 or a wide GIF]

[One paragraph: what the update is and why, in the developer's own voice.]

[h2] New [/h2]
- [concrete item]
- [concrete item]

[h2] Fixed [/h2]
- [the bugs people actually reported, named]

[h2] Known issues [/h2]
- [be honest - this is what builds trust in the discussions]

[One line: how to get it - "restart Steam to pull the update".]
[Optional: one link to the Discord or the roadmap. One.]
```

### Skeleton 3 - Next Fest / demo announcement

```
Title: [Game] demo is live for Steam Next Fest

[GIF of the demo's best 3 seconds]

The demo is [X] minutes and covers [what part of the game]. It's the [tutorial / first
area / a self-contained slice] and your save [does / doesn't] carry over.

We're streaming on [date, time with timezone] and answering questions in the discussions
all week.

If you like it, a wishlist genuinely helps us get seen - and if you bounce off it, the
discussion thread for feedback is [link]. We read all of it.
```
"A wishlist helps" is acceptable and normal on Steam - unlike upvote-asking elsewhere, wishlisting is the
platform's intended mechanic. Do not offer anything in exchange for it.

## Hashtag/keyword practice

- **No hashtags on Steam.** Ever. Not in announcements, not in the store page.
- **Tags are the discovery system.** Up to 20, and Steam uses roughly the top 15. Order matters - put the
  most defining tags first. Mix:
  - 2-3 core genre tags (`Roguelike`, `Metroidvania`, `Turn-Based Tactics`)
  - 2-3 sub-genre/mechanic tags (`Deckbuilding`, `Bullet Hell`, `Base Building`)
  - 2-3 mood/setting tags (`Atmospheric`, `Cyberpunk`, `Cozy`)
  - practical tags (`Singleplayer`, `Controller`, `Great Soundtrack`, `Short`)
- Tags drive the **Discovery Queue and "More like this"** - being tagged alongside a successful comparable
  is the cheapest visibility on Steam. Look at 3 successful comparables and match the useful tags.
- **Search keywords** come from the game's name, the short description and the tags - Steam search is weak,
  so the name matters more than SEO copy.
- **Localise the store page.** Simplified Chinese, Russian, Spanish (LatAm), German, Brazilian Portuguese -
  each unlocks a search and browse audience that will otherwise never see the game.

## Anti-spam & community rules

- NEVER post a Steam announcement that is not about this game or its store page.
- NEVER link to a competing storefront (itch, Epic, GOG, your own webshop) in a Steam announcement.
- NEVER use the "Major Update" announcement type for a minor patch - Valve enforces announcement-type misuse.
- NEVER offer, imply or accept anything in exchange for a wishlist, a review or a Steam key ("review for a key" is a bannable Steamworks violation).
- NEVER claim a review score, award, rating or press quote you have not received.
- NEVER post promotional content in another game's Steam discussions or community hub.
- NEVER submit the same game to a second Steam Next Fest - each title may participate only once, ever.
- NEVER register for Next Fest without a playable demo that will be live before the fest begins.
- NEVER release the game before a Next Fest you are registered for concludes (it disqualifies the entry).
- NEVER run a discount that breaches Steam's discount cadence rules (roughly 30 days between discounts and 30 days after launch).

Soft rules: publish an announcement every 2-4 weeks while unreleased; answer every discussion thread within
a day; put the roadmap in a pinned post and keep it honest; send keys to curators and small streamers 2-3
weeks before launch, never on launch day; localise the short description first if you cannot localise
everything; ask for feedback in the demo's discussion thread and visibly act on it.

## Good vs bad example

**Good** (announcement)
```
Title: Patch 1.4 - Co-op, and the Alt-Tab crash is finally dead

[GIF: two players, one screen, both dashing through a closing door]

Local co-op is in. Same save, drop in and out at any time, second player uses any connected
gamepad. It's the thing most of you asked for in the demo discussions and it took longer
than we said it would - sorry about that.

[h2] New [/h2]
- Two-player local co-op, drop-in/drop-out
- Four maps rebuilt for two players
- Steam Deck: verified, 60fps on the default profile

[h2] Fixed [/h2]
- The Alt-Tab crash during boss fights (this was a shader recompile on focus loss)
- Audio desync on some AMD cards
- Save corruption if you quit during the elevator sequence

[h2] Known issues [/h2]
- Split-screen UI overlaps at 4:3 resolutions - fix is in for 1.4.1
- Co-op achievements only unlock for player 1 right now

Restart Steam to pull it. Bug reports in the discussions, we read all of them.
```

**Bad**
```
Title: 🔥🔥 HUGE UPDATE!!! BEST GAME OF 2026!!! 🔥🔥

OUR AMAZING GAME IS NOW EVEN MORE AMAZING!!! Critics are calling it the BEST roguelike
ever made!!! ⭐⭐⭐⭐⭐

👉 WISHLIST NOW and get a FREE key!!!
👉 Leave us a positive review and DM us for a key for a friend!!
👉 Also available on itch.io and our own store - cheaper there!!
👉 Join our Discord!! Follow our Twitter!! #indiegame #roguelike #gamedev
```
Why: no information about what changed, fabricated critic quotes, **keys offered in exchange for wishlists
and positive reviews (a Steamworks violation that can remove the game)**, a link to competing storefronts
inside a Steam announcement, four CTAs, and hashtags on a platform that has none.

## Sources

- Steamworks documentation - marketing and events: https://partner.steamgames.com/doc/marketing
- Steam Next Fest October 2026 (dates, eligibility, one-fest-per-game rule): https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest/2026october
- Steam Next Fest June 2026: https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest/2026june
- Next Fest 2026 dates and registration deadlines: https://presskit.gg/field-guides/next-fest-scheduling-registration
- Steam store page asset sizes (capsules, screenshots): https://partner.steamgames.com/doc/store/assets
- Steam Direct fee ($100, recoupable at $1,000): https://partner.steamgames.com/steamdirect
- Steamworks discounting rules: https://partner.steamgames.com/doc/marketing/discounts
- Steam rules on keys and reviews: https://partner.steamgames.com/doc/features/keys
