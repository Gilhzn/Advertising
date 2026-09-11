---
platform: itch_io
updated: 2026-09-11
wave: assisted
---
# itch.io

## Audience & culture

itch.io is the indie game commons: jam games, experimental work, free demos, assets, tools, zines and
TTRPGs. The audience is developers, jam participants, curious players and a substantial free-first crowd.
Discovery is weak and mostly comes from jams, the "Fresh/Popular" lists, and external traffic you bring
yourself.

What itch.io is genuinely good for:
- **Hosting a free demo** that you can point every other channel at, with no gatekeeping and no review.
- **Game jams** - the single best discovery mechanism on the platform. A jam entry gets played, rated and
  commented on by other participants, which is real feedback from people who finish games.
- **Devlogs** - a public development record that is indexable and that you can link from Twitter/Bluesky/
  Discord. Devlog posts appear in a browsable devlog feed.
- **Revenue share you set yourself** (default 10%, adjustable to 0%), and direct payouts.

What it is not: a traffic source you can rely on for a commercial launch. Treat itch.io as the **home of the
demo and the devlog**, with Steam as the commercial destination.

Cultural notes:
- Page presentation is the whole store listing: a GIF-heavy page with a clear "what is this game" above the
  fold converts far better than a wall of text.
- The community is generous and allergic to marketing. "Dumping links and leaving" is explicitly removable
  behaviour in the forums.
- Free + "name your own price" with a suggested amount outperforms a hard low price for a first project.
- Ratings/comments on a jam entry are your best early qualitative data.

## Formats that work

**Project page.** The store listing. Cover image, trailer/GIFs, short pitch above the fold, controls, system
requirements, devlog links, tags.

**Devlog post.** Attached to a project, appears in the project page's devlog tab and in itch.io's devlog
feeds. 300-800 words plus GIFs. This is the engine's main publishable artefact on itch.io.

**Release Announcements forum post.** The one community board where announcing a finished release is
explicitly on-topic. One post per release, not per update.

**Devlogs forum board.** For work-in-progress updates. **Screenshots are mandatory if the project has a
visual component**, and low-effort posts are removed.

**Jam entry.** Submit to a jam; the rating period brings players. Ludum Dare, GMTK Jam, Brackeys, the
thematic monthly jams and the engine-specific jams (Godot Wild Jam) all work.

**Bundle / sale participation.** itch.io's seasonal sales and charity bundles bring real traffic.

### Asset specs
- **Cover image: 630x500** (itch.io's recommended size; displayed at various crops, so keep the important
  content centred). PNG/JPG/GIF - **an animated GIF cover works and stands out in lists**.
- Screenshots: 3-6, any size, consistent aspect ratio. GIFs of 3-8 seconds outperform static shots.
- Trailer: hosted on YouTube/Vimeo and embedded; 30-60 seconds.
- Banner (optional): 960x220 approx for the page header.

## Limits

| Thing | Limit |
|---|---|
| Project title | 80 characters (practical) |
| Short description / tagline | **~120 characters**, shown in lists and in embeds - the most important text on the page |
| Page description / devlog body | Markdown or rich text; no practical hard limit (the engine's metadata records 10,000 chars as the working cap) |
| Tags | **up to 10**, chosen from itch.io's tag vocabulary plus free tags |
| Cover image | 630x500 recommended; animated GIF allowed |
| Upload size | up to 1 GB per file by web upload; larger via `butler` (itch.io's CLI) with no practical cap |
| Platforms | Windows/macOS/Linux/Android/HTML5 builds, all on one page |
| Revenue share | developer-set, default 10% |
| API | the itch.io API is read-only for page data; **`butler` pushes builds, not posts.** **There is no posting API for devlogs or forum posts - the engine prepares the text and the user publishes manually** |
| Native scheduling | project pages can be set to "Restricted/Draft" and published manually; devlogs cannot be scheduled |
| Cost | free to publish |

## Best times

All times UTC; **convert to the business timezone before scheduling.** itch.io's audience is players and
developers on their own time, so the curve is the gaming curve, not the office curve.

- **Best window: 15:00-21:00 UTC** (US morning through EU evening).
- **Best days: Friday and Saturday** - people look for something to play at the weekend. Thursday evening
  also works as a "here's your weekend game" slot.
- **Jam deadlines dominate everything.** Releasing during a big jam's rating period means the jam audience
  is already browsing; releasing the week after a big jam means competing with hundreds of fresh entries.
- A devlog's distribution is small and durable rather than spiky - timing matters much less than the GIF in
  the first screen.
- For Israel (UTC+3 summer): 18:00 UTC = **21:00 local**.

## Hooks, structure & CTAs

The hook on itch.io is **a GIF**. The short description is the second hook. Text is third.

### Skeleton 1 - project page

```
Cover (630x500):       animated GIF of the single clearest 3 seconds of gameplay
Title:                 [Name]
Short description:     [<=120 chars. Genre + the twist. "A roguelike where your only
                       input is one button."]

Page body:
  [Animated GIF, full width - the game doing the interesting thing]
  **[One-line pitch, bold]**
  [2-3 sentences: what you do in the game, in second person. "You're a rat in a collapsing
  subway. Hold to charge, release to dash."]

  **Features** (3-5 bullets, concrete, no adjectives)
  **Controls** (a table - players leave pages that don't say this)
  **[GIF 2]**
  **How long is it?** [honest answer]
  **Status / what's next** [one paragraph]
  **Credits**

Tags:                  [<=10: genre, perspective, engine, mood, "short", "demo"]
Pricing:               Free, or "name your own price" with a suggested amount
```

### Skeleton 2 - devlog post

```
Title: [Specific and concrete. "Rebuilding the dash so it feels like it has weight"
       not "Devlog #7"]

[GIF or screenshot in the first screen - mandatory if the project is visual]

[What changed, in one paragraph, specific.]

[Why - the problem with the old version, ideally shown side by side.]

[How - the technical or design detail. This is what other devs come for.]

[What's next, one line.]

[One link: the demo, or the Steam page. One only.]
```

### Skeleton 3 - Release Announcements forum post

```
Title: [Game name] - [genre], [platform], [price]
       e.g. "Tunnelrat - one-button roguelike, Windows/Linux/web, free"

[GIF]

[2-3 sentences: what it is and what's interesting about it.]
[Length / price / platforms.]
[Link to the itch page.]
[One honest note: "it's my first finished game, feedback on the tutorial especially
welcome."]
```
Post this **once per release**. Updates go in the Devlogs board or the project's devlog, not here.

## Hashtag/keyword practice

- **itch.io uses tags, not hashtags.** Never write a `#hashtag` in a devlog or forum post.
- **Up to 10 tags**, and they are the platform's main discovery mechanism - itch.io's browse pages are
  tag-driven. Choose:
  - 1-2 genre tags (`roguelike`, `metroidvania`, `visual-novel`)
  - 1 perspective/style tag (`pixel-art`, `first-person`, `2d`)
  - 1 engine tag (`godot`, `unity`, `bitsy`) - developers browse these
  - 1-2 mood/theme tags (`atmospheric`, `horror`, `cozy`)
  - practical tags: `short`, `demo`, `singleplayer`, `controller`
  - accessibility and language tags where true
- Use itch.io's **existing tag vocabulary** where one exists - a free-text tag nobody browses is wasted.
- The **short description** is the text that appears in browse lists, search results and link embeds
  everywhere else. It is the highest-leverage 120 characters on the platform.
- Set the **genre, platforms, input methods and accessibility** metadata fields - they drive itch.io's
  filters, which is how the small amount of organic browsing that happens actually happens.

## Anti-spam & community rules

- NEVER post a release announcement anywhere on itch.io except the Release Announcements board, and only once per release.
- NEVER post to the Devlogs board without screenshots if the project has a visual component.
- NEVER post a link with no substance ("dumping links and leaving" is explicitly removable on itch.io).
- NEVER post to any itch.io community board without human approval.
- NEVER post the same announcement to multiple itch.io boards.
- NEVER post promotional content in another developer's project comments or devlog comments.
- NEVER exceed a reasonable self-promotion level on the forums - itch.io moderators remove excessive posters and revoke topic-creation rights.
- NEVER submit a game to a jam whose rules you have not read (most require the work to be made during the jam).
- NEVER use an AI-generated cover or screenshots without disclosure - itch.io requires AI-generated content to be disclosed on the project page.

Soft rules: rate and comment on other jam entries before asking anyone to play yours (jams are explicitly
reciprocal); reply to every comment on your page; keep the devlog going even when nothing exciting happened
(consistency is what builds a following here); put the controls on the page; mark the page's status
accurately (In development / Released / On hold).

## Good vs bad example

**Good** (devlog post)
```
Title: The dash now has weight, and it took 11 tries

[GIF: old dash on the left, new dash on the right, same jump, same enemy]

The dash used to move you 180px instantly. It read as a teleport, and in playtests nobody
used it offensively because they couldn't tell whether they'd hit anything.

The new one takes 9 frames: 2 frames of crouch, 5 of movement with a trailing afterimage,
2 of recovery where you're still vulnerable. Same distance, completely different feel -
and now people use it to kill things, which is what it was for.

The part that took 11 iterations wasn't the animation, it was the vulnerability window. At
0 frames it felt cheap; at 6 frames it felt punishing. 2 is the number where people kept
trying it.

Next: the same treatment for the wall-grab.

Demo's free and about 20 minutes: [link]
```

**Bad**
```
Title: NEW UPDATE!!! PLAY MY GAME!!!

🎮🔥 Hey everyone!! My AMAZING new game is OUT NOW!!! It's the BEST roguelike on itch!!!
PLEASE play it and leave a 5 star rating!!! 🔥🎮

Download here: [link]
Also follow me on Twitter, Instagram, TikTok and YouTube!!
Wishlist on Steam!! Join my Discord!!

#indiegame #gamedev #roguelike #indiedev #pixelart
```
Why: no screenshot (removable on the Devlogs board), no information about what changed, self-awarded
superlative, a request for 5-star ratings, five competing CTAs, hashtags on a tag-based platform, and it
reads exactly like the "dumping links and leaving" that itch.io moderators remove.

## Sources

- itch.io Release Announcements board (rules link in the board header): https://itch.io/board/10022/release-announcements
- itch.io Devlogs board rules (screenshots mandatory, no link dumping, low-effort removal): https://itch.io/board/10021/devlogs
- itch.io devlog documentation: https://itch.io/docs/creators/devlogs
- itch.io project page / image asset guidance (cover 630x500): https://itch.io/docs/creators/design
- itch.io community rules: https://itch.io/docs/legal/community-rules
- butler (build upload CLI): https://itch.io/docs/butler/
- itch.io AI disclosure requirement: https://itch.io/docs/creators/quality-guidelines
