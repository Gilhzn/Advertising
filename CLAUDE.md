# Advertising - AI multi-platform promotion engine

Turns a short business/app/game description (+ optional image and link) into: a brand kit, a channel plan, platform profiles (guided wizard + OAuth), scheduled posts, a business mailbox, per-platform analytics, in-app product analytics (PostHog heatmaps / hot screens), and an AI loop that learns what works and recommends product improvements. A supervisor agent orchestrates specialised agents, each on the model that fits (`.claude/skills/model-policy`).

## Hard constraints (never violate)
- No automated account sign-up on any platform. The user creates accounts through the wizard; we connect via OAuth/tokens.
- Posts to communities we do not own always require human approval.
- OAuth tokens and mailbox passwords are encrypted at rest (`encryptSecret`), never logged.
- The app-improvement agent only opens PRs; never pushes to a user's repo.
- No model id hardcoded outside `packages/agents/src/model-policy.ts`.

## Repo map
```
apps/web        Next.js dashboard (wizard, calendar/approvals, analytics, insights, mail, settings)
apps/worker     pg-boss scheduler + Agent SDK runtime + deterministic jobs (publish, ingest, DNS)
packages/shared Zod schemas, platform metadata (PLATFORMS), crypto, logger
packages/db     Drizzle schema + migrations (`pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`)
packages/connectors  Connector interface + per-platform adapters + http/oauth helpers + registry
packages/agents runtime agents (supervisor, strategist, community-scout, copywriter, visual-director, compliance-guard, analyst, product-advisor, classifier), MCP tools, model policy, evals
packages/knowledge   playbooks: platforms/, categories/, rules/anti-spam.md
packages/email  Cloudflare DNS + Migadu / Cloudflare Email Routing provisioning
packages/analytics   PostHog client (projects, HogQL, heatmaps) + normalisers
docs/           decisions.md (append-only), deploy.md, app-reviews.md
```

## Commands
`pnpm install` · `docker compose up -d postgres` · `pnpm db:migrate` · `pnpm dev` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm eval`

## Conventions
TypeScript strict, ESM, Biome for lint/format, Vitest + msw for unit tests, Playwright for E2E. Errors are typed (`ConnectorError`, `JobError`). Every external side effect is idempotent. Logs via `@adv/shared` logger with `businessId` and `jobId` fields.

## Development agents and skills
Agents in `.claude/agents` (supervisor, architect, agent-engineer, growth-strategist, backend-dev, frontend-dev, qa-engineer, security-reviewer, researcher). Skills in `.claude/skills` (model-policy, connector-authoring, platform-playbooks, agent-sdk-patterns, dashboard-conventions, release-checklist). Start any multi-file work by delegating to `supervisor`.

## Plan phases and status
0 scaffold ✅ · 1 intake + strategy · 2 connectors wave 1 + wizard · 3 content engine + scheduler · 4 email · 5 analytics · 6 AI loop · 7 connectors wave 2 · 8 hardening + deploy
