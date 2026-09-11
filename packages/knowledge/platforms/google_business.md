---
platform: google_business
updated: 2026-09-11
wave: 2
---
# Google Business Profile

## Audience & culture

Google Business Profile (GBP) is not social media. It is the **conversion surface for local intent**: the
panel that appears when someone searches the business by name, or searches "[category] near me" and sees the
map pack. The audience is people who are already deciding.

For a local business this is the single highest-ROI channel in the entire plan, ahead of every social
network. For a SaaS, a game or a pure-online product it is close to irrelevant (no physical location = no
profile).

What actually drives the map pack ranking:
1. **Relevance** - category, services, business description, and the words in reviews.
2. **Distance** - the searcher's location (you cannot change this).
3. **Prominence** - review count and velocity, review ratings, photos, Q&A, web citations, and profile
   completeness.

Posts ("Updates") are a **freshness and conversion** signal, not a ranking rocket. They show in the profile,
in the "Updates" tab, and occasionally in the knowledge panel. Their real value: they answer the question a
searcher has at the moment of deciding (are you open, what's the offer, is this place any good today).

Cultural notes:
- Posts expire from prominence quickly; a weekly cadence keeps the profile looking alive.
- Photos are the most-viewed asset on the profile by a wide margin. Upload real, recent photos weekly.
- Reviews are the product. Responding to every review - especially the bad ones, calmly - is visible to
  every future searcher.
- Q&A is publicly editable: seed the real questions yourself (allowed) and answer them.

## Formats that work

**Update ("What's new") post.** The default. One photo + 150-300 words + a CTA button. Weekly.

**Offer post.** Structured: title, start/end date, optional coupon code, terms, redeem link. Surfaces with
an "Offer" label and is saveable by the user. Use for real, time-bounded offers only.

**Event post.** Title, start/end date and time, description, CTA. Use for anything with a date - a class, a
sale, a tasting, a workshop.

**Product.** A structured catalogue item with a price and a photo, shown in the Products tab.

**Photos.** Not a post type but the highest-traffic content on the profile. Interior, exterior (so people
recognise the door), team, product, and "at work" shots. Geotagged, recent, real.

**Q&A.** Seed and answer the 5-10 questions customers actually ask (parking, kashrut, accessibility,
languages spoken, walk-ins).

### Specs
- **Post image: 1200x900 (4:3)**, JPG or PNG, **between 10 KB and 5 MB**. Minimum 250x250.
- Profile photo: 720x720 recommended, 250x250 minimum.
- Cover photo: 1024x576 (16:9).
- No text-heavy images: Google's guidelines discourage images that are mostly text, and **phone numbers and
  URLs in images are against the photo guidelines**.

## Limits

| Thing | Limit |
|---|---|
| Post body | 1,500 characters - but Google truncates at roughly **250-300 characters** before "Read more". **Front-load everything.** Ideal: 150-300 characters |
| Post title (Event/Offer) | 58 characters |
| CTA buttons | Book, Order online, Buy, Learn more, Sign up, Call now - one per post |
| Image | 1200x900 (4:3), 10 KB - 5 MB, JPG/PNG |
| Video | up to 30 seconds, 75 MB, 720p+ (video posts are supported on the profile but **not through the Posts API** - `PLATFORMS.google_business.supports.video` is `false` for that reason) |
| Post lifetime | "What's new" posts remain visible but de-emphasise after ~7 days; Offer/Event posts run to their end date |
| Business description | 750 characters |
| **API access** | **A new Google Cloud project starts at 0 QPM - zero quota - until Google approves the access request.** Approval requires a submitted GBP API access form, a verified profile (Google reviewers generally expect an established, verified location), a real business website, and a stated use case. An approved project shows 300 QPM |
| API quota (approved) | typically 300 queries/minute per project; per-location write quotas apply |
| Native scheduling | none - the engine schedules and fires |
| Cost | free |

**Operational consequence:** until the Cloud project's GBP API request is approved, nothing can be
published. Treat GBP as "prepare + manual publish through the Google Business Profile app/web UI" until the
quota shows above zero.

## Best times

All times UTC; **convert to the business timezone before scheduling.** GBP is purely local - the business's
own timezone is the only one that matters.

- **Post 1-3 hours before the business's peak customer window.** For a restaurant that means late morning
  for lunch and mid-afternoon for dinner; for a service business, first thing in the morning.
- **General best window: 08:00-11:00 local**, weekdays.
- **Best days: Tuesday-Thursday** for services; **Thursday-Friday** for anything where people plan a weekend.
- **Weekly cadence** (one Update per week) is the practical target. More than 2-3 posts a week has
  diminishing returns; fewer than one a month makes the profile look abandoned.
- **Offers and Events must be posted 5-10 days before they start** so they have time to be seen.
- For Israel: the week runs Sunday-Thursday. **Sunday morning is the prime slot.** Post weekend-related
  offers on Wednesday or Thursday morning, not Friday. 09:00 Israel local = **06:00 UTC** in summer.

## Hooks, structure & CTAs

Write for someone who is standing on the street deciding whether to walk in. Specific, practical, no brand
voice.

The first 250 characters are all that show. Put the offer, the date, and the "what's in it for me" there.
The rest of the 1,500 is for the people who tapped "Read more".

CTAs: exactly one button. Match it to the intent - "Call now" for services, "Book" for appointments, "Order
online" for food, "Learn more" for everything else.

### Skeleton 1 - weekly update

```
Photo: 1200x900, real, recent, taken this week.

[First 200 chars: what is new/available/happening, with the concrete detail - a dish, a
service, a time, a price.]

[Next lines (below the fold): the context, the practical info - hours, address nuance,
parking, who it's for.]

[CTA button: Learn more / Call now]
```
Example shape:
```
The winter menu is up: three new soups, and the lamb kubbeh is back on Thursdays only.

We're open 11:00-22:00 Sunday to Thursday, 11:00-15:00 Friday. Kubbeh usually sells out by
19:00 on Thursdays, so call ahead if you're coming late. Street parking is free after 19:00
on Dizengoff.
[Call now]
```

### Skeleton 2 - Offer post

```
Title (<=58):   [Discount] on [thing] - [timeframe]
Start/end:      [real dates]
Body:           [What the offer is, who it applies to, and the honest limits in the first
                200 characters. Then the terms.]
Coupon code:    [if applicable]
Terms:          [written out - Google's policy requires offers you will honour]
CTA:            Redeem / Learn more
```

### Skeleton 3 - Event post

```
Title (<=58):   [Event name] - [date]
Start/end:      [date + time, both]
Body:           [What happens, how long, what it costs, whether to book, who it suits.
                First 200 chars carry date, price and booking.]
CTA:            Sign up / Book
Photo:          the space set up for the event, or last time's event
```

## Hashtag/keyword practice

- **No hashtags.** GBP posts do not use them and they look out of place. Zero.
- **Keywords matter for relevance ranking**, but the highest-value places are not the posts:
  1. **Primary category** (the single strongest relevance lever - choose the most specific accurate one).
  2. **Secondary categories** (up to 9).
  3. **Services / menu items** - each one is an indexed entry.
  4. **Business description** (750 chars) - write the category term and the neighbourhood naturally.
  5. **Post bodies** - mention the service and the area in normal sentences.
  6. **Review text** - you cannot write it, but you can ask customers "if you mention what you had, it
     helps other people" (never script a review, never offer anything for one).
- **Do not keyword-stuff the business name.** Adding "Best Plumber Tel Aviv" to the business name violates
  Google's naming guidelines and is the most common cause of profile suspension.
- Mention the **neighbourhood**, not just the city - "Florentin", "Rehavia", "Hadar" - that is how people
  search.

## Anti-spam & community rules

- NEVER publish through an unapproved Cloud project - a project at 0 QPM has no access and every call fails.
- NEVER add keywords, locations or descriptors to the business name field (suspension risk).
- NEVER solicit, incentivise, filter or gate reviews (offering a discount for a review, or asking only happy customers, violates Google's policy and can suspend the profile).
- NEVER post an offer or price the business will not honour.
- NEVER put a phone number, URL or heavy text overlay in a post image (against the photo guidelines).
- NEVER post content that is not about this specific location.
- NEVER create a second profile for the same location, or a profile for a location without a real presence there.
- NEVER respond to a negative review with customer details, accusations, or anything that could identify the reviewer beyond what they wrote.

Soft rules: post weekly; add 3-5 real photos a week; answer every review within 48 hours, in the review's
language; keep hours accurate including holiday hours (Israeli businesses: set special hours for every
chag - wrong holiday hours is the top local-search complaint); fill every field on the profile, including
attributes (wheelchair access, outdoor seating, languages).

## Good vs bad example

**Good**
```
[Photo: the workshop bench with a half-repaired bike, taken this morning]

Same-day tube and brake repairs if you drop the bike before 11:00. Everything else is
usually next-day this week - we're three people short until Sunday.

We're at Levinsky 42, entrance from the courtyard (the blue gate, not the shop front).
Open 08:00-18:00 Sunday to Thursday, 08:00-13:00 Friday. Electric bike service is
available but we don't do battery cells - Ofer on Herzl does those and he's good.

[Call now]
```
Why: answers the actual question (can you fix my bike today), honest about capacity, solves the
"I can't find the door" problem, accurate hours including Friday, one CTA, useful even to people it turns
away.

**Bad**
```
[Photo: a stock image of a generic bicycle with "BEST BIKE SHOP IN TEL AVIV!!! CALL
03-1234567" written across it in red]

🚴 WE ARE THE BEST BIKE REPAIR SHOP IN TEL AVIV, RAMAT GAN, GIVATAYIM, HERZLIYA, BAT YAM
AND ALL OF ISRAEL!!! 🚴 Bike repair Tel Aviv, bicycle repair near me, best bike shop,
cheap bike repair, electric bike repair Tel Aviv, bike service Tel Aviv...

⭐ Leave us a 5 star review and get 10% off your next service! ⭐
#bike #bikerepair #telaviv #cycling
```
Why: stock image with a phone number and text overlay (photo guideline violation), keyword-stuffed
location list, unverifiable superlative, **incentivised review solicitation (a suspension-level policy
violation)**, hashtags that do nothing, and not one piece of information a customer could use.

## Sources

- Google Business Profile APIs - prerequisites and access request: https://developers.google.com/my-business/content/prereqs
- GBP API usage limits (0 QPM until approved, 300 QPM once approved): https://developers.google.com/my-business/content/limits
- Local Posts API reference: https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts
- Post character limit 1,500 with ~250-300 char truncation: https://www.socialchamp.com/blog/guide-to-google-business-profile-posts/
- Post image spec 1200x900, 10 KB - 5 MB: https://recurpost.com/schedule-google-business-profile-posts/google-business-profile-post-image-size/
- Google Business Profile guidelines (naming, reviews, photos): https://support.google.com/business/answer/3038177
- Prohibited and restricted content, review policy: https://support.google.com/contributionpolicy/answer/7400114
