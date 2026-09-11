---
name: model-policy
description: Which Claude model and effort level each task uses (runtime agents and development agents), and why. Load before creating or changing any agent, or when a task seems too expensive or too weak.
---
# Model policy (single source of truth)

`packages/agents/src/model-policy.ts` must mirror this table. Never hardcode a model id elsewhere.

## Runtime agents (apps/worker, Agent SDK)

| Agent | Model | Effort | Why |
|---|---|---|---|
| supervisor | `claude-opus-5` (override `SUPERVISOR_MODEL`, e.g. `claude-fable-5-1`) | high | Makes go/no-go decisions across agents; errors are expensive. |
| strategist | `claude-opus-5` | xhigh | One run per business; deep discovery + channel plan quality drives everything downstream. |
| analyst | `claude-opus-5` | high | Weekly; must reason over noisy metrics without over-fitting. |
| product-advisor | `claude-opus-5` | high | Weekly; product recommendations must be evidence-based. |
| community-scout | `claude-sonnet-5` | medium | Web research + summarisation of community rules. |
| copywriter | `claude-sonnet-5` | medium | High-volume; strong writing at 1/5 the price. |
| visual-director | `claude-sonnet-5` | medium | Template + copy decisions, no deep reasoning. |
| compliance-guard | `claude-sonnet-5` | low | Rule matching against playbooks; must be cheap and fast. |
| classifier | `claude-haiku-4-5` | n/a (budget_tokens style, no effort param) | Tagging, sentiment, short summaries. |

Rules:
- Use `thinking: { type: "adaptive" }` on all 4.6+ models; never `budget_tokens` on Opus 5 / Sonnet 5 (400 error).
- Stream every long call; use `.finalMessage()` when the stream events are not needed.
- Prompt caching: stable system + playbooks first, per-run data after the last breakpoint. Verify `cache_read_input_tokens > 0` in tests.
- Server-side fallbacks on Opus/Fable: `betas: ["server-side-fallback-2026-07-01"], fallbacks: "default"`.
- Every run records `agent_runs` (tokens, cost). Budgets: `maxBudgetUsd` per job (defaults in `model-policy.ts`), monthly per business (`businesses.ai_monthly_budget_usd`).

Cost expectations (targets, verified by `pnpm eval --report-cost`): discovery < $2, weekly content batch < $1, weekly analysis < $1.

## Development agents (.claude/agents)

Opus (high/xhigh) for supervisor, architect, agent-engineer, growth-strategist, security-reviewer. Sonnet (high) for backend-dev, frontend-dev; Sonnet (medium) for qa-engineer; Sonnet (low) for researcher.

Downgrade a task's model only with a measured eval showing no quality loss. Upgrade when an eval fails on reasoning.
