# @adv/knowledge

The marketing knowledge base. Plain markdown files that the **runtime** agents (strategist, community-scout,
copywriter, compliance-guard, analyst) read and quote **verbatim** inside their prompts.

Nothing here is code that runs at request time except `src/index.ts`, which reads files off disk and returns
them as strings. The value of this package is the prose.

## Structure

```
packages/knowledge/
├── rules/
│   └── anti-spam.md         Source of truth for compliance-guard: hard "- NEVER" rules,
│                            soft rules, and per-platform legal/policy notes.
├── platforms/
│   ├── bluesky.md           One file per id in PLATFORM_IDS (packages/shared/src/platforms.ts).
│   ├── telegram.md          17 files: bluesky, telegram, discord, facebook, instagram, threads,
│   ├── ...                  linkedin, x, reddit, tiktok, youtube, pinterest, google_business,
│   └── steam.md             product_hunt, hacker_news, itch_io, steam.
├── categories/
│   ├── game.md              One file per BUSINESS_CATEGORIES value:
│   ├── saas.md              game, saas, mobile_app, local_business, other.
│   ├── mobile_app.md
│   ├── local_business.md
│   └── other.md
└── src/
    ├── index.ts             loadPlaybook / loadCategory / loadRules / loadStrategyContext
    └── index.test.ts        Structural contract tests (see "Tests" below).
```

`src/index.ts` resolves paths relative to `dist/..`, i.e. the package root, so the markdown directories ship
alongside `dist/` and are read at runtime. **Do not move `platforms/`, `categories/` or `rules/` under
`src/`** - they are deliberately outside the TypeScript `rootDir`.

## API

```ts
import { loadPlaybook, loadCategory, loadRules, loadStrategyContext } from "@adv/knowledge";

loadRules();                                  // rules/anti-spam.md
loadPlaybook("reddit");                       // platforms/reddit.md
loadCategory("game");                         // categories/game.md
loadStrategyContext("game", ["steam", "x"]);  // rules + category + each platform, joined by "\n\n---\n\n"
```

Every loader returns `""` for a missing file rather than throwing, so a new `PlatformId` added to
`@adv/shared` degrades to "no playbook" instead of crashing a job. The test suite is what catches the
missing file.

## File contract

### `platforms/<id>.md`

Frontmatter:

```yaml
---
platform: <PlatformId>     # must match the filename and the id in PLATFORM_IDS
updated: YYYY-MM-DD
wave: 1 | 2 | assisted     # must match PLATFORMS[id].wave
---
```

Required section headers, verbatim (the tests assert these exact strings):

| Section | What belongs in it |
|---|---|
| `## Audience & culture` | Who is there, what voice works, what gets ignored. |
| `## Formats that work` | Post types **with specs**: aspect ratios, video lengths, carousel counts, image sizes. |
| `## Limits` | A table: characters, media count/size, API rate limits, posting caps, review gates, cost. |
| `## Best times` | UTC ranges, plus an explicit note to convert to the business timezone. |
| `## Hooks, structure & CTAs` | At least **3 concrete post skeletons** the copywriter can fill in. |
| `## Hashtag/keyword practice` | How many, which kind, where they go, and what the platform actually indexes. |
| `## Anti-spam & community rules` | Hard `- NEVER` lines **first** (5+), then soft rules. |
| `## Good vs bad example` | One short example of each, with a one-line "why". |
| `## Sources` | URLs. Mark anything unverified as "unverified" inline where it is stated. |

Target length: **150-400 lines**. Long enough to be useful in a prompt, short enough that five of them plus
the rules still fit in a reasonable context window.

### `categories/<category>.md`

Frontmatter: `category`, `updated`.

Required section headers, verbatim:

- `## Where this category wins` - ranked platforms with the rationale for the ranking.
- `## Communities` - specific subreddits, Discord servers, forums, Facebook groups, Telegram channels and
  launch programmes, **each with the rule that gets you removed if you ignore it**.
- `## Launch sequence (first 30 days)` - day-by-day, covering Day 1 through Day 30.
- `## Content pillars that work` - 4-5 pillars with example angles.
- `## KPIs and realistic benchmarks` - weak / OK / good bands, honestly calibrated.
- `## Common mistakes`
- `## Sources`

`local_business.md` additionally carries an `## Israeli context` subsection (Hebrew audiences, the
Sunday-Thursday week, chagim and GBP special hours, local Facebook groups, WhatsApp/Telegram, Amendment 40
consent rules).

### `rules/anti-spam.md`

- Every hard rule is **one line, starting with `- NEVER`**, so `compliance-guard` can split on newlines,
  match, and quote the exact rule back in a `blocked` verdict. Never wrap a NEVER rule across two lines.
- `## Soft rules` are quality guidance: they lower a draft's score and trigger a rewrite, they do not block.
- `## Per-platform legal and policy notes` carries disclosure requirements, restricted-claim categories and
  platform-specific policy (Meta branded content, FTC endorsement guides, Google review policy, Steamworks
  key rules, Israeli spam law).

The hard rules in `.claude/skills/platform-playbooks/SKILL.md` are the origin set; `rules/anti-spam.md` is a
superset and is the file the runtime reads. **If the skill and this file disagree, fix both.**

## How to update

1. **Verify anything time-sensitive first.** Limits, pricing, review gates, quotas and fest dates all move.
   Use WebSearch/WebFetch, prefer the platform's own developer docs, and cite what you checked in
   `## Sources`. Anything you could not confirm must be marked **"unverified"** at the point where it is
   stated - the runtime agents quote these files verbatim, so an unhedged wrong number becomes a wrong post.
2. **Edit the markdown.** Keep the section headers exactly as listed above; the tests match on the literal
   strings.
3. **Bump `updated:`** in the frontmatter of every file you touched.
4. **Run the tests:** `pnpm -F @adv/knowledge test`.
5. **Typecheck:** `pnpm -F @adv/knowledge typecheck`.
6. If a runtime agent's behaviour depends on the new content (a new hard rule, a new required section),
   update the agent prompt in `packages/agents` and add or adjust an eval there.

### Adding a platform

1. Add the id to `PLATFORM_IDS` and the metadata to `PLATFORMS` in `packages/shared/src/platforms.ts`.
2. Create `platforms/<id>.md` following the contract above. The test suite iterates `PLATFORM_IDS`, so the
   new platform is tested automatically and a missing file fails the build.
3. Make sure `wave:` in the frontmatter matches `PLATFORMS[id].wave`, and that the `## Limits` table agrees
   with `PLATFORMS[id].maxChars`, `supports` and `costPerPostUsd`. **When the metadata and the playbook
   disagree, the playbook is what the agent reads** - so fix the metadata too rather than leaving a
   contradiction.

### Adding a category

1. Add the value to `BUSINESS_CATEGORIES` in `packages/shared/src/platforms.ts`.
2. Create `categories/<category>.md` following the contract. It is picked up by the tests automatically.

## Tests

`src/index.test.ts` is a **structural contract**, not a content review. It asserts that:

- every id in `PLATFORM_IDS` has a non-empty file with valid frontmatter, all nine required sections, at
  least 5 `- NEVER` lines, at least one source URL, and a business-timezone note;
- every value in `BUSINESS_CATEGORIES` has a non-empty file with valid frontmatter, all six required
  sections, and a launch sequence spanning Day 1 to Day 30;
- `rules/anti-spam.md` has at least 8 `- NEVER` lines, each on its own line, plus soft rules and the
  per-platform legal notes;
- `loadStrategyContext` concatenates the right number of documents and skips missing ones.

It cannot check whether the content is *accurate*. That is what the `updated:` dates and step 1 of "How to
update" are for.

## Known staleness risks

These are the facts most likely to be wrong first. Re-verify them before any release:

- **X API pricing** ($0.015/post, $0.20/post with a link) - changed three times in 2026 alone.
- **YouTube `videos.insert` quota** - moved to its own bucket (1 unit, 100 calls/day) on 1 June 2026; the
  caveat in `packages/shared/src/platforms.ts` still describes the old 1,600-unit cost.
- **Instagram 100/24h and Threads 250/24h publishing caps** - query the live limit endpoints rather than
  trusting the docs.
- **TikTok, Pinterest, YouTube and Google Business Profile review/audit gates** - these decide whether a
  platform can publish at all, and they change without notice.
- **Steam Next Fest dates and registration deadlines** - three editions per year, and a game only gets one
  ever.
