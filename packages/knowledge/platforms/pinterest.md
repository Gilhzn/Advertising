---
platform: pinterest
updated: 2026-09-11
wave: 2
---
# Pinterest

## Audience & culture

Pinterest is a **visual search engine with purchase intent**, not a social network. Nobody follows brands
here in any meaningful way; people search, save and come back months later. That makes Pinterest the only
platform in the plan where a single pin can still be driving traffic two years after it was published.

Audience: ~70% women historically, though Gen Z and male users are the fastest-growing segments. Dominant
categories: home, food, fashion, beauty, weddings, DIY, parenting, travel, finance/planning, and - relevant
here - **templates, printables, checklists, and anything that looks like a plan**.

Cultural notes:
- **Search intent is the whole game.** Keywords in the pin title, description, board name, board description
  and the image's on-pin text all feed Pinterest's index.
- Pins have a long tail: meaningful traffic arrives weeks after publishing. Do not judge a pin in 48 hours.
- Saves ("repins") matter more than clicks for distribution; clicks matter more for the business.
- Fresh pins beat repins: Pinterest rewards **new images pointing at existing URLs**. Making 4 different
  images for one blog post is the standard, sanctioned practice - but only if the images are genuinely
  different, not colour-swapped duplicates.
- Seasonality is huge. Pinterest users plan 30-90 days ahead: publish holiday content 45+ days early.
- Weak fit: developer tools, B2B SaaS, games. Strong fit: local services with a visual output (interiors,
  food, events, fitness), consumer apps in planning/wellness/finance, e-commerce, anything with templates.

## Formats that work

**Standard image pin.** **1000x1500, 2:3 aspect ratio** - Pinterest's recommended shape and consistently
the highest-performing one. Include on-pin text (a title overlay) that states the benefit; many users never
read the description.

**Multi-page pin.** Multiple images/pages in one pin. Good for step-by-step and before/after sequences.
(Idea Pins were merged into the unified Pin format in 2023 - there is no separate Idea Pin format now.)

**Video pin.** 1000x1500 (2:3) or 1080x1920 (9:16). MP4/MOV/M4V, up to 2 GB. Length 4 seconds to 15
minutes, but **6-15 seconds drives the strongest engagement**. Silent-first: text on screen, no reliance on
audio.

**Product pin.** With a catalogue feed, pins carry live price and availability. For e-commerce this is the
single highest-converting Pinterest object.

**Board.** A board is a landing page. Board titles and descriptions are indexed - name them the way people
search ("Small Kitchen Storage Ideas"), not the way brands name things ("Our Inspiration").

## Limits

| Thing | Limit |
|---|---|
| Pin title | 100 characters (Pinterest truncates at 100) |
| Pin description | 800 characters (often hidden in the feed but **indexed for search** - this is where keywords go) |
| Image | recommended 1000x1500 (2:3); max 20 MB; JPEG/PNG |
| Video | MP4/MOV/M4V, up to 2 GB, 4 seconds - 15 minutes; 2:3 or 9:16 |
| Board name | 50 characters; board description 500 |
| Alt text | supported and indexed - always fill it |
| **API access tier** | **Trial access is sandbox-only: all pins and boards created with Trial access are visible only to their creator.** Standard access requires app review, including a video recording of the app performing a Pinterest API action |
| API rate limit (Trial) | 1,000 requests/day for the whole app |
| API rate limit (Standard) | 100 requests/second per user per app |
| Native scheduling | Pinterest's own UI can schedule up to 30 days out (one scheduled pin at a time per board in some accounts); the API cannot - the engine schedules and fires |
| Cost | free |

**Operational consequence:** until the app has Pinterest Standard access, everything the engine publishes is
invisible to anyone but the account owner. Treat Pinterest as "prepare + manual publish" until review
clears, and say so in the wizard.

## Best times

All times UTC; **convert to the business timezone before scheduling.** Pinterest's long tail means timing
matters less here than anywhere else - but the initial distribution test still happens on publish.

- **Evening: 20:00-23:00 local** is the strongest consistent window (planning time, after kids are in bed).
- **Secondary: 14:00-16:00 local** on weekdays.
- **Best days: Saturday and Sunday**, then Tuesday and Wednesday. Pinterest is one of the few platforms
  where weekends genuinely outperform.
- **Seasonality beats time of day.** Publish seasonal content **45-60 days before** the season: back-to-school
  in June, winter holidays in October, Passover/Pesach content in February, summer content in April.
- For Israel (UTC+3 summer): 21:00 local = **18:00 UTC**. Note that Pinterest's Israeli user base is small;
  for Israeli businesses Pinterest is usually worth it only if the audience is international or the content
  is visual-universal (food, design).

## Hooks, structure & CTAs

The hook is the **on-pin text overlay**, not the description. Three to six words, high contrast, readable at
thumbnail size (test it at 200px wide).

Hook patterns: "[Number] [thing] that [outcome]", "How to [outcome] without [pain]", "The [adjective]
[thing] nobody tells you about", "[Season] [category] checklist".

CTAs: Pinterest CTAs are implicit - the pin *is* the CTA. Add a light one in the description ("Full recipe
on the blog", "Free template - link on the pin") and make sure the destination page matches the pin exactly.
A pin that promises a checklist and lands on a pricing page is the fastest way to lose distribution.

### Skeleton 1 - content pin driving to a blog post / resource

```
Image (1000x1500):
  Top third:    headline overlay, 4-6 words, bold, high contrast
  Middle:       the photo / screenshot / illustration
  Bottom strip: small logo + URL

Title (<=100 chars):  [The search phrase, verbatim] - e.g. "Small Kitchen Storage Ideas
                      That Actually Fit"
Description (<=800):  [2-3 natural sentences containing the primary keyword and 3-4
                      related terms. Then one line: "Full guide on the blog."]
Alt text:             [Literal description of the image]
Board:                [A board whose name is itself a search phrase]
Link:                 [Direct to the specific page, never the homepage]
```

### Skeleton 2 - product pin (e-commerce / local retail)

```
Image (1000x1500): product in use, in a real setting, with one text line stating the
                   benefit ("Fits a 40cm shelf").
Title:             [Product type] + [key attribute] + [use case]
Description:       [What it is, materials/specs, who it's for, 3-4 keyword phrases,
                   price if stable]
Link:              product page
```

### Skeleton 3 - short video pin (service / how-to)

```
0:00-0:01  The finished result (people decide from the thumbnail frame - lead with the payoff)
0:01-0:08  The 3-4 steps, fast cuts, text label on each step
0:08-0:12  The result again, held, with the brand mark
No audio dependency. Text throughout.

Title:       How to [outcome] in [time]
Description: [Steps in text, with keywords] + [link pointer]
```

## Hashtag/keyword practice

Pinterest is the platform where **keyword practice is the strategy**.

- **Hashtags are close to useless** on Pinterest in 2026 and Pinterest no longer treats them as a ranking
  signal. Use 0-2 if any; they clutter the description that actually matters.
- **Keyword placement, in priority order:** on-pin text overlay > pin title > pin description > board name >
  board description > alt text > the destination page's own title.
- Research keywords using **Pinterest's own search bar autocomplete** and the "guided search" tiles that
  appear above results - those tiles are literally Pinterest telling you the related queries it indexes.
- Write descriptions as **natural sentences containing the phrases**, not comma-separated keyword lists
  (Pinterest demotes stuffing).
- One primary keyword per pin. Four different pins for one URL should target four *different* keywords, not
  the same one four times.
- Name boards as search phrases. "Freelance Invoice Templates" beats "Work Stuff".

## Anti-spam & community rules

- NEVER publish user-visible pins from an app with only Trial access - Trial pins are sandbox-only and invisible to everyone but the creator.
- NEVER create near-duplicate pins (same image, minor colour change) pointing at the same URL - Pinterest treats that as spam.
- NEVER point a pin at a destination that does not deliver what the pin promises (bait-and-switch is the top demotion cause).
- NEVER keyword-stuff titles or descriptions with comma-separated term lists.
- NEVER use before/after body imagery or weight-loss claims.
- NEVER post another creator's image without rights, and NEVER pin from a source you cannot link to.
- NEVER exceed 1,000 API requests/day on Trial access.
- NEVER auto-publish more than ~10-15 pins per day from one account - higher volumes trip Pinterest's spam heuristics.

Soft rules: publish 3-5 fresh pins per week consistently rather than 50 in one day; give every pin a
different primary keyword; keep boards tightly themed; fill alt text; update seasonal pins' destination
pages before the season rather than making new pins from scratch.

## Good vs bad example

**Good**
```
Image:       1000x1500. A small kitchen, shot from the door. Top third overlay in dark
             text on a cream band: "7 storage ideas for a 6m² kitchen". Bottom strip:
             small logo + site URL.
Title:       7 Small Kitchen Storage Ideas for Tiny Apartments
Description: Seven storage ideas we used in a 6 square metre Tel Aviv kitchen, including
             a magnetic knife rail, an over-sink drying shelf, and a 15cm pull-out pantry.
             Every one fits in a rental without drilling into tiles. Full breakdown with
             measurements and where we bought each piece is on the blog.
Alt text:    Narrow kitchen with a magnetic knife rail, over-sink shelf, and a slim
             pull-out pantry beside the fridge.
Board:       Small Kitchen Storage Ideas
Link:        /blog/small-kitchen-storage
```
Why: 2:3, thumbnail-legible overlay, title is a real search query, description is natural prose carrying
five keyword phrases, alt text filled, board is a search phrase, and the link delivers exactly what the
pin promised.

**Bad**
```
Image:       1080x1080 square photo of a storefront, no text overlay, logo in the centre.
Title:       Check us out!
Description: kitchen, kitchens, storage, small kitchen, kitchen ideas, home, home decor,
             decor, interior, interior design, apartment, apartment ideas, tiny home,
             organization, organizing #kitchen #home #decor #interiordesign #organization
Link:        homepage
```
Why: square (loses half the vertical feed space), no on-pin text, a title that matches no search query,
a comma-stuffed keyword list Pinterest demotes, useless hashtags, and a homepage link that delivers nothing
the pin implied.

## Sources

- Pinterest access tiers (Trial = sandbox-only, Standard requires review): https://developers.pinterest.com/docs/key-concepts/access-tiers/
- Pinterest API rate limits (Trial 1,000/day; Standard 100/s per user): https://developers.pinterest.com/docs/reference/rate-limits/
- Pin specs, 1000x1500 / 2:3, title 100 / description 800: https://posteverywhere.ai/blog/pinterest-aspect-ratios
- Video pin specs (MP4/MOV/M4V, 2 GB, 4s-15min, 6-15s best): https://recurpost.com/best-pinterest-scheduler/pinterest-pin-dimensions/
- Idea Pins merged into the unified Pin format: https://help.pinterest.com/en/business/article/create-a-pin
- Pinterest Creator/Community Guidelines (spam, duplicate pins, misleading links): https://policy.pinterest.com/en/community-guidelines
