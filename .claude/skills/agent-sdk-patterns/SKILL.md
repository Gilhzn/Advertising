---
name: agent-sdk-patterns
description: How this repo uses @anthropic-ai/claude-agent-sdk for the runtime supervisor and subagents - query(), agents option, custom MCP tools, hooks, budgets, session resume, structured outputs. Load before writing runtime agent code.
---
# Agent SDK patterns used here

```ts
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";

const engine = createSdkMcpServer({ name: "engine", tools: [getBusiness, saveBrandKit, createPostDraft, schedulePost, ...] });

for await (const msg of query({
  prompt: jobPrompt,
  options: {
    systemPrompt: SUPERVISOR_SYSTEM_PROMPT,        // stable text first (cacheable)
    model: policy.supervisor.model,
    agents: {
      strategist: { description, prompt, model: policy.strategist.model, effort: "xhigh", tools: ["mcp__engine__*", "WebFetch", "WebSearch"] },
      copywriter: { ... , model: policy.copywriter.model },
    },
    mcpServers: { engine },
    allowedTools: ["Agent", "mcp__engine__*", "WebSearch", "WebFetch"],
    disallowedTools: ["Bash", "Write", "Edit"],   // runtime agents never touch the filesystem
    permissionMode: "bypassPermissions",
    maxBudgetUsd: policy.jobs.discover_business.maxBudgetUsd,
    maxTurns: 60,
    hooks: { PreToolUse: [{ matcher: "mcp__engine__schedule_post", hooks: [requireApprovalForCommunities] }], PostToolUse: [{ hooks: [auditLog] }] },
  },
})) { collect usage/result from `msg` }
```

Rules:
- Tools are `tool(name, description, zodShape, handler)`; validate outputs with `packages/shared` schemas before persisting; return `{ content: [{ type: "text", text: JSON.stringify(result) }] }`.
- Job = one `query()`; persist `session_id` from the `system/init` message in `agent_runs.result` to allow `resume`.
- Read `usage` and `total_cost_usd` from the final `result` message and write them to `agent_runs`.
- The supervisor delegates via the built-in `Agent` tool; subagents are declared in `options.agents`, not spawned manually.
- Runtime agents get `disallowedTools` for Bash/Read/Write/Edit/Glob/Grep/WebFetch (`RUNTIME_DISALLOWED_TOOLS`); the only fetch path is `mcp__engine__fetch_url`, which is SSRF-guarded and DNS-pinned (`safe-fetch.ts`). Every direct Messages API call passes `accounting.businessId` so the monthly budget gate applies.
- Deterministic work (publishing, ingestion, DNS) is plain code in `apps/worker/src/jobs`, not an LLM.
- The optional app-improvement coding agent (Phase 6b) runs in a separate `query()` with `Bash/Read/Edit/Write` enabled inside a temporary clone directory with `cwd` set, and can only open a PR.
- Docs: https://code.claude.com/docs/en/agent-sdk (verify option names against the installed version's `.d.ts` when in doubt).
