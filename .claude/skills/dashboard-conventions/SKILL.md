---
name: dashboard-conventions
description: Conventions for the Next.js dashboard in apps/web - routing, data access, server actions, UI kit, RTL, charts, approvals state. Load before any dashboard work.
---
# Dashboard conventions (apps/web)

- Next.js App Router. Routes: `/` overview, `/businesses/new`, `/b/[slug]` (overview), `/b/[slug]/setup` (wizard), `/b/[slug]/strategy`, `/b/[slug]/content` (calendar + approvals), `/b/[slug]/platforms`, `/b/[slug]/analytics` (social), `/b/[slug]/product` (PostHog: hot screens, heatmaps, funnels), `/b/[slug]/insights` (AI), `/b/[slug]/mail`, `/b/[slug]/settings`, `/settings` (keys, budgets).
- Server components fetch through `src/lib/data/*.ts` (Drizzle). Mutations are server actions in `src/lib/actions/*.ts`, each verifying `business.userId === session.user.id`.
- UI: shadcn/ui + Tailwind, lucide icons. Layout component sets `dir="rtl"` when the UI language is Hebrew (user setting), independent of content language.
- Status badges share one map in `src/components/status-badge.tsx` (post statuses, account statuses).
- Charts: load the `dataviz` skill; use Recharts with the palette in `src/lib/chart-palette.ts`; every chart has a title, unit, and an empty state.
- Long-running agent jobs: enqueue via server action, show progress from `agent_runs` (polling every 5s with `router.refresh()`), never block the request.
- Approvals: bulk approve/reject with optimistic UI; the "awaiting_approval" queue is the home page's primary widget.
- Secrets never reach the client; tokens are shown once (mailbox password) and then only masked.
- E2E: Playwright smoke per page under `apps/web/e2e`, run with `pnpm -F @adv/web e2e`.
