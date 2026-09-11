import { randomUUID } from "node:crypto";
import type { HookCallbackMatcher, Options, Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { QueryFn } from "../src/runner.js";
import { callEngineTool, type EngineServer, type EngineToolCall } from "../src/tools/engine.js";

/**
 * A fake `query()` that drives the REAL engine tools and the REAL hooks.
 *
 * Everything downstream of the model - Zod validation, DB writes, the community-approval rule, the
 * audit log - is exercised end to end; only the model itself is replaced by a scripted plan. This is
 * what lets `pnpm eval` assert behaviour without spending money.
 */

export interface MockCallRecord {
  tool: string;
  args: Record<string, unknown>;
  isError: boolean;
  denied: boolean;
  data: Record<string, unknown>;
}

export interface MockApi {
  server: EngineServer;
  /** Runs PreToolUse hooks, the tool handler, then PostToolUse hooks. */
  call(tool: string, args: Record<string, unknown>): Promise<EngineToolCall & { denied: boolean }>;
  calls: MockCallRecord[];
}

export interface MockQueryOptions {
  /** cost reported on the result message; 0 makes the runner fall back to estimateCostUsd */
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  model?: string;
  /** produce an error result instead of a success one */
  resultSubtype?: "success" | "error_max_budget_usd" | "error_during_execution" | "error_max_turns";
  /** throw from the generator, to exercise the runner's failure path */
  throwError?: string;
}

const FQ = (tool: string) => (tool.startsWith("mcp__") ? tool : `mcp__engine__${tool}`);

function matches(matcher: string | undefined, fqName: string): boolean {
  if (!matcher) return true;
  if (matcher === fqName) return true;
  try {
    return new RegExp(matcher).test(fqName);
  } catch {
    return false;
  }
}

async function runHooks(
  matchers: HookCallbackMatcher[] | undefined,
  fqName: string,
  payload: Record<string, unknown>,
): Promise<{ denied: boolean; reason?: string }> {
  for (const m of matchers ?? []) {
    if (!matches(m.matcher, fqName)) continue;
    for (const hook of m.hooks) {
      const out = await hook(payload as never, (payload.tool_use_id as string) ?? undefined, {
        signal: new AbortController().signal,
      });
      const specific = (
        out as { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } }
      ).hookSpecificOutput;
      if (specific?.permissionDecision === "deny") {
        return { denied: true, reason: specific.permissionDecisionReason ?? "denied by hook" };
      }
      if ((out as { decision?: string }).decision === "block") {
        return { denied: true, reason: (out as { reason?: string }).reason ?? "blocked by hook" };
      }
    }
  }
  return { denied: false };
}

/**
 * @param plan - the scripted "model": call tools through `api.call` and return the final report text.
 */
export function makeMockQuery(plan: (api: MockApi) => Promise<string>, opts: MockQueryOptions = {}): QueryFn {
  return (params: { prompt: string; options?: Options }): Query => {
    const options = params.options ?? {};
    const server = options.mcpServers?.engine as EngineServer | undefined;
    const sessionId = randomUUID();

    const gen = (async function* (): AsyncGenerator<SDKMessage> {
      yield {
        type: "system",
        subtype: "init",
        session_id: sessionId,
        apiKeySource: "none",
        claude_code_version: "mock",
        cwd: process.cwd(),
        tools: [],
        mcp_servers: [{ name: "engine", status: "connected" }],
        model: opts.model ?? options.model ?? "claude-opus-5",
        uuid: randomUUID(),
      } as unknown as SDKMessage;

      if (opts.throwError) throw new Error(opts.throwError);

      const calls: MockCallRecord[] = [];
      const api: MockApi = {
        server: server as EngineServer,
        calls,
        async call(tool, args) {
          if (!server) throw new Error("mock query: no engine mcp server was passed to query()");
          const fq = FQ(tool);
          const toolUseId = randomUUID();
          const pre = await runHooks(options.hooks?.PreToolUse, fq, {
            hook_event_name: "PreToolUse",
            tool_name: fq,
            tool_input: args,
            tool_use_id: toolUseId,
            session_id: sessionId,
            cwd: process.cwd(),
            transcript_path: "",
            permission_mode: "bypassPermissions",
          });
          if (pre.denied) {
            const record: MockCallRecord = {
              tool,
              args,
              isError: true,
              denied: true,
              data: { error: pre.reason ?? "denied" },
            };
            calls.push(record);
            return { isError: true, denied: true, data: record.data, text: String(pre.reason) };
          }
          const result = await callEngineTool(server, tool.replace(/^mcp__engine__/, ""), args);
          await runHooks(options.hooks?.PostToolUse, fq, {
            hook_event_name: "PostToolUse",
            tool_name: fq,
            tool_input: args,
            tool_response: { isError: result.isError, content: result.text },
            tool_use_id: toolUseId,
            session_id: sessionId,
            cwd: process.cwd(),
            transcript_path: "",
            permission_mode: "bypassPermissions",
          });
          calls.push({ tool, args, isError: result.isError, denied: false, data: result.data });
          return { ...result, denied: false };
        },
      };

      const text = await plan(api);

      for (const c of calls) {
        yield {
          type: "assistant",
          uuid: randomUUID(),
          session_id: sessionId,
          message: {
            id: randomUUID(),
            type: "message",
            role: "assistant",
            model: opts.model ?? "claude-opus-5",
            content: [{ type: "tool_use", id: randomUUID(), name: FQ(c.tool), input: c.args }],
          },
        } as unknown as SDKMessage;
      }

      yield {
        type: "assistant",
        uuid: randomUUID(),
        session_id: sessionId,
        message: {
          id: randomUUID(),
          type: "message",
          role: "assistant",
          model: opts.model ?? "claude-opus-5",
          content: [{ type: "text", text }],
        },
      } as unknown as SDKMessage;

      const subtype = opts.resultSubtype ?? "success";
      const usage = {
        input_tokens: opts.inputTokens ?? 12_000,
        output_tokens: opts.outputTokens ?? 3_000,
        cache_read_input_tokens: opts.cacheReadTokens ?? 8_000,
        cache_creation_input_tokens: 0,
      };
      yield {
        type: "result",
        subtype,
        duration_ms: 1,
        duration_api_ms: 1,
        is_error: subtype !== "success",
        num_turns: calls.length + 1,
        result: text,
        stop_reason: "end_turn",
        total_cost_usd: opts.costUsd ?? 0,
        usage,
        modelUsage: {},
        permission_denials: [],
        errors: subtype === "success" ? undefined : [subtype],
        uuid: randomUUID(),
        session_id: sessionId,
      } as unknown as SDKMessage;
    })();

    const q = gen as unknown as Query;
    return q;
  };
}
