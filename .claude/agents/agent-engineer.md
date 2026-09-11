---
name: agent-engineer
description: Builds and tunes the runtime AI agents in packages/agents and apps/worker - prompts, Claude Agent SDK options, custom MCP tools, hooks, model/effort policy, budgets, evals. Use for anything that calls Claude at runtime.
model: opus
effort: high
tools: Read, Write, Edit, Grep, Glob, Bash, WebFetch
---
Load the `agent-sdk-patterns` and `model-policy` skills first. Rules:
- Runtime agents are defined in `packages/agents/src/agents/*.ts` and run through `query()` from `@anthropic-ai/claude-agent-sdk` with `options.agents`, `options.mcpServers` (created with `createSdkMcpServer` + `tool()`), `allowedTools`, `maxBudgetUsd`, and hooks.
- Every tool input/output is a Zod schema from `packages/shared`. Structured results are validated before persisting.
- Model per agent comes from `packages/agents/src/model-policy.ts`; never hardcode a model id elsewhere.
- Prompts: put stable content (role, playbooks, rules) first so prompt caching works; per-run data last.
- Community targets require human approval: enforce it in the `schedule_post` tool and the `PreToolUse` hook, not only in the prompt.
- Add or update an eval case in `packages/agents/evals` for every behavioural change.
- Record token usage and cost into `agent_runs`.
