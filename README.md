# Advertising

An AI multi-platform promotion engine. Give it a short business/app/game description (plus an
optional image and link) and it turns that into a brand kit, a channel strategy, guided platform
setup (wizard + OAuth), scheduled posts, a business mailbox, per-platform and in-app analytics, and
a learning loop that recommends what to change next - in the product and in the plan.

A supervisor agent orchestrates a set of specialised agents, each running on the Claude model that
fits its job (see [Model policy](#model-policy)).

## What it does

1. **Intake** - you describe the business (or paste a link/screenshot); a strategist agent produces
   a **brand kit** (positioning, audiences, tone of voice, palette, tagline, bios, hashtags) and a
   **channel plan** (which platforms, cadence, content pillars, launch plan, KPIs).
2. **Setup** - for each platform in the plan you either connect via **OAuth** or, for platforms with
   no API, follow a **guided manual wizard** (prefilled bio/handle/description, your generated
   avatar and banner, links to the right settings page). The app never signs up for an account on
   your behalf.
3. **Content** - a copywriter + visual-director agent pair drafts posts and renders on-brand images
   from the brand kit's palette; a compliance-guard agent checks each post against platform and
   anti-spam rules before it reaches your approval queue.
4. **Approve & schedule** - every post to a community you don't own always requires a human approval
   click. Approved posts are scheduled and published by the worker.
5. **Learn** - an analyst agent watches per-platform metrics and in-app product analytics (PostHog
   heatmaps, hot screens, funnels), and a product-advisor agent turns that into ranked recommendations
   - including, where you've linked a repo, opening a pull request (never pushing directly).

## Architecture

```
                         ┌────────────────────────────┐
                         │           apps/web          │   Next.js dashboard
                         │  wizard · calendar/approvals │   (Vercel/Railway)
                         │  analytics · insights · mail │
                         └───────────────┬─────────────┘
                                         │ server actions
                                         ▼
                         ┌────────────────────────────┐
                         │          Postgres            │◄──── shared by both apps
                         │  businesses, brand_kits,      │      (no direct web<->worker calls;
                         │  channel_plans, posts,        │       only via DB rows + pg-boss queue)
                         │  platform_accounts, mailboxes,│
                         │  metric_snapshots, audit_log  │
                         └───────────────┬─────────────┘
                                         │ pg-boss jobs
                                         ▼
                         ┌────────────────────────────┐
                         │         apps/worker          │   pg-boss scheduler
                         │  discover_business            │   + Agent SDK runtime
                         │  generate_content · publish    │   + deterministic jobs
                         │  ingest_insights · refresh_dns │   (publish, ingest, DNS)
                         └───────────────┬─────────────┘
                                         │
             ┌───────────────┬──────────┼──────────────┬────────────────┐
             ▼               ▼          ▼               ▼                ▼
     packages/agents  packages/connectors  packages/email  packages/analytics  packages/media
     supervisor +      per-platform         Cloudflare DNS   PostHog client      satori/resvg
     specialised        adapters + OAuth     + Migadu/CF       (HogQL, heatmaps)   image templates
     agents (Claude)    + http/oauth utils    Email Routing                       + R2/S3 upload

     packages/shared   Zod schemas, PLATFORMS metadata, crypto (encryptSecret), logger
     packages/db       Drizzle schema + migrations
     packages/knowledge  playbooks: platforms/, categories/, rules/anti-spam.md (loaded into prompts)
```

`apps/web` and `apps/worker` never call each other directly - they only communicate through Postgres
rows and the pg-boss job queue, so either can be redeployed or scaled independently.

## Quick start

Requirements: Node >= 22, pnpm 10, Docker (for local Postgres).

```bash
pnpm install
docker compose up -d postgres            # or point DATABASE_URL at any Postgres 16+

cp .env.example .env                     # see below for the required variables
pnpm db:migrate
pnpm dev                                 # runs apps/web and apps/worker in parallel
```

Minimum environment variables to run locally:

```
DATABASE_URL=postgres://adv:adv@localhost:5432/adv
TOKEN_ENCRYPTION_KEY=<64 hex chars>       # encrypts OAuth tokens + mailbox passwords at rest
APP_URL=http://localhost:3000
AUTH_SECRET=<random string>
ENABLE_DEV_LOGIN=1                        # dev-only credentials login; never set in production
```

Platform OAuth client ids/secrets, `ANTHROPIC_API_KEY`, PostHog and email-provider credentials are
each optional until you actually exercise that integration - see the per-package `.env.example`
files and `docs/deploy.md (Railway, always-on) or docs/deploy-vercel.md (Vercel + Neon + GitHub Actions worker, zero servers)` for the full list.

## Onboarding flow

```
create business  →  strategy (brand kit + channel plan)  →  setup (wizard / OAuth per platform)
                                                                       │
        autopilot (schedule, publish, analyse, recommend)  ◄──  approve content
```

1. **Create a business** - name, description, category, languages, optional website/image.
2. **Strategy** - review the generated brand kit and channel plan; edit handles/bios inline
   (saved as a new brand-kit version) and generate downloadable avatar/banner assets from the
   palette; approve to unlock scheduling.
3. **Setup** - connect each planned platform. OAuth platforms redirect through the provider; assisted
   platforms (no public API) walk you through manual account creation with prefilled fields and
   your brand assets, then you paste back a profile URL/token.
4. **Content & approvals** - generated posts land in the approval queue; bulk approve/reject, then
   the worker publishes on schedule. Posts to communities you don't own are always held for approval.
5. **Autopilot** - once approved, the loop repeats: publish → ingest social + product analytics →
   recommend content and product changes → (optionally) open a PR for a product change.

## Platform review caveats

Some platforms require an app review or partner approval before a *third party* can connect their
own account (as opposed to accounts on our own developer account, which work in development mode
today). See [`docs/app-reviews.md`](docs/app-reviews.md) for the current per-platform status, lead
times, and source confidence notes.

## Model policy

Runtime agents each run on the Claude model that fits the job - Opus 5 for the supervisor,
strategist, analyst and product-advisor (high-stakes, low-frequency reasoning), Sonnet 5 for
community-scout, copywriter, visual-director and compliance-guard (high-volume, well-scoped work),
and Haiku 4.5 for the classifier (cheap tagging/sentiment). No model id is ever hardcoded outside
`packages/agents/src/model-policy.ts` - see `.claude/skills/model-policy/SKILL.md` for the full
table, cost targets, and the rules for development-agent model choice.

## Security notes

OAuth tokens and mailbox passwords are encrypted at rest and never logged; agent tool access is
scoped and SSRF-guarded; every post to a community the business doesn't own requires human approval;
budgets are reserved before an agent run starts, not after. A full audit with findings and fix status
lives in [`docs/security-review.md`](docs/security-review.md).

## Deployment

Each app ships a `railway.json` pointing at its own Dockerfile and `/health` endpoint; `apps/web` and
`apps/worker` are deployed as two Railway services sharing one Postgres instance. Step-by-step
instructions, required environment variables per service, and the DNS/email provisioning setup are
in [`docs/deploy.md`](docs/deploy.md).

## Commands

```bash
pnpm install          # install workspace dependencies
docker compose up -d postgres
pnpm db:migrate        # apply Drizzle migrations
pnpm db:generate       # generate a new migration from schema changes
pnpm db:seed           # seed fixture data
pnpm dev               # apps/web + apps/worker, watch mode
pnpm lint              # Biome check
pnpm typecheck         # tsc --noEmit across the workspace
pnpm test              # Vitest (msw-mocked) across the workspace
pnpm eval              # packages/agents evals (prompt/behaviour regression suite)
```

## Repo map

```
apps/web        Next.js dashboard (wizard, calendar/approvals, analytics, insights, mail, settings)
apps/worker     pg-boss scheduler + Agent SDK runtime + deterministic jobs (publish, ingest, DNS)
packages/shared Zod schemas, platform metadata (PLATFORMS), crypto, logger
packages/db     Drizzle schema + migrations (pnpm db:generate, pnpm db:migrate, pnpm db:seed)
packages/connectors  Connector interface + per-platform adapters + http/oauth helpers + registry
packages/agents runtime agents (supervisor, strategist, community-scout, copywriter, visual-director,
                compliance-guard, analyst, product-advisor, classifier), MCP tools, model policy, evals
packages/knowledge   playbooks: platforms/, categories/, rules/anti-spam.md
packages/email  Cloudflare DNS + Migadu / Cloudflare Email Routing provisioning
packages/media  brand-kit-driven image templates (satori + resvg) + R2/S3 upload, local-disk fallback
packages/analytics   PostHog client (projects, HogQL, heatmaps) + normalisers
docs/           decisions.md (append-only), deploy.md, app-reviews.md, security-review.md
```

---

## תיאור בעברית

**Advertising** היא מערכת קידום שיווקי מרובת-פלטפורמות מבוססת בינה מלאכותית. מזינים תיאור קצר של
עסק, אפליקציה או משחק (וניתן לצרף תמונה וקישור), והמערכת מייצרת עבורו ערכת מותג (מיצוב, קהלי יעד,
טון דיבור, פלטת צבעים, סלוגן), תוכנית ערוצים, חיבור מודרך לכל פלטפורמה (OAuth או אשף ידני לפלטפורמות
ללא API), פוסטים מתוזמנים הממתינים לאישור אנושי, תיבת דואר עסקית, ואנליטיקה - הן ברמת הפלטפורמות
החברתיות והן בתוך המוצר עצמו (PostHog) - שמזינה לולאת למידה הממליצה על שיפורים בתוכן ובמוצר.

**עקרונות יסוד**: המערכת לעולם לא נרשמת אוטומטית לחשבון בשום פלטפורמה - את/ה יוצר/ת את החשבון דרך
האשף, והמערכת מתחברת רק דרך OAuth/טוקנים. פרסום לקהילות שאינן בבעלותנו דורש תמיד אישור אנושי מפורש.
מפתחות OAuth וסיסמאות תיבת הדואר מוצפנים במנוחה ולעולם אינם נרשמים ביומן. סוכן שיפור המוצר פותח
בקשות משיכה (Pull Requests) בלבד ולעולם אינו דוחף שינויים ישירות למאגר של המשתמש/ת.

להתחלה מהירה: `pnpm install`, הפעלת Postgres מקומי, `pnpm db:migrate`, ולבסוף `pnpm dev`. פרטים
מלאים - כולל משתני סביבה, פריסה ל-Railway והערות אבטחה - מופיעים בגרסה האנגלית למעלה.
