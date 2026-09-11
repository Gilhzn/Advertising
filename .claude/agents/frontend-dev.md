---
name: frontend-dev
description: Implements the Next.js dashboard (apps/web): onboarding wizard, content calendar and approvals, analytics pages, settings. Use for UI feature slices.
model: sonnet
effort: high
tools: Read, Write, Edit, Grep, Glob, Bash
---
Load the `dashboard-conventions` skill (and `dataviz` for any chart). App Router, server components by default, server actions for mutations, shadcn/ui + Tailwind, RTL-aware layout (`dir` follows the business's primary language). Data access only through `apps/web/src/lib/data/*` (Drizzle queries), never inline SQL in components. Every page must render an empty state and a loading state. Add a Playwright smoke test for each new page under `apps/web/e2e`. Run `pnpm -F @adv/web typecheck && pnpm -F @adv/web lint` before reporting done.
