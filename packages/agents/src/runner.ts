import { agentRuns, and, businesses, type Db, eq, getDb, gte, sql } from "@adv/db";
import { logger } from "@adv/shared";
import type {
  AgentDefinition,
  HookCallbackMatcher,
  HookEvent,
  McpServerConfig,
  Options,
  Query,
  SDKMessage,
  SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import { BudgetExceededError } from "./errors.js";
import { estimateCostUsd, MODEL_POLICY } from "./model-policy.js";

/** Filesystem/shell tools are never available to runtime agents. */
export const RUNTIME_DISALLOWED_TOOLS = ["Bash", "Write", "Edit", "MultiEdit", "NotebookEdit"] as const;

export type QueryFn = (params: { prompt: string; options?: Options }) => Query;

export interface AgentRunUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export type AgentRunStatus = "succeeded" | "failed" | "budget_exceeded";

export interface AgentRunSummary {
  runId: string;
  businessId: string | null;
  jobName: string;
  agent: string;
  model: string;
  status: AgentRunStatus;
  costUsd: number;
  usage: AgentRunUsage;
  sessionId: string | null;
  /** final assistant text of the run (`result` on a successful SDKResultMessage) */
  resultText: string;
  numTurns: number;
  error: string | null;
}

export interface RunAgentJobInput {
  /** null only for system-level runs that belong to no business (no monthly cap applies) */
  businessId: string | null;
  jobName: string;
  /** top-level agent name recorded on `agent_runs.agent`, e.g. "supervisor" */
  agentName: string;
  /** per-run data; keep it AFTER the stable systemPrompt so prompt caching works */
  prompt: string;
  systemPrompt?: string | string[];
  /** subagents reachable through the built-in Agent tool */
  agents?: Record<string, AgentDefinition>;
  /** allowedTools for the top-level agent (e.g. ["Agent", "mcp__engine__*"]) */
  tools?: string[];
  mcpServers?: Record<string, McpServerConfig>;
  maxBudgetUsd?: number;
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
  model?: string;
  maxTurns?: number;
  /** resume a previous session id stored in agent_runs.result.sessionId */
  resume?: string;
  /** pre-generated agent_runs id, so tool contexts can reference the run before it starts */
  runId?: string;
  deps?: RunnerDeps;
}

export interface RunnerDeps {
  /** injectable so evals/tests can run the whole pipeline without API calls */
  query?: QueryFn;
  db?: Db;
  now?: () => Date;
}

interface DecisionLogEntry extends Record<string, unknown> {
  at: string;
  kind: "tool_use" | "subagent" | "note";
  name: string;
  detail?: string;
}

const MAX_DECISION_LOG = 200;

function startOfMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** Sum of agent_runs.cost_usd for a business in the current calendar month. */
export async function monthToDateSpendUsd(businessId: string, db: Db, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${agentRuns.costUsd}), 0)` })
    .from(agentRuns)
    .where(and(eq(agentRuns.businessId, businessId), gte(agentRuns.startedAt, startOfMonth(now))));
  return Number(row?.total ?? 0);
}

export interface BudgetState {
  spentUsd: number;
  capUsd: number;
  remainingUsd: number;
}

/** Reads the monthly cap and month-to-date spend. Throws when the cap is already reached. */
export async function assertMonthlyBudget(
  businessId: string,
  db: Db,
  now = new Date(),
): Promise<BudgetState> {
  const [biz] = await db
    .select({ cap: businesses.aiMonthlyBudgetUsd })
    .from(businesses)
    .where(eq(businesses.id, businessId));
  if (!biz) throw new Error(`business ${businessId} not found`);
  const capUsd = Number(biz.cap ?? 0);
  const spentUsd = await monthToDateSpendUsd(businessId, db, now);
  const remainingUsd = Math.max(0, capUsd - spentUsd);
  if (spentUsd >= capUsd) {
    throw new BudgetExceededError(
      `monthly AI budget exhausted for business ${businessId}: $${spentUsd.toFixed(4)} of $${capUsd.toFixed(2)}`,
      businessId,
      spentUsd,
      capUsd,
    );
  }
  return { spentUsd, capUsd, remainingUsd };
}

function usageFromResult(msg: SDKResultMessage): AgentRunUsage {
  const models = Object.values(msg.modelUsage ?? {});
  if (models.length > 0) {
    return models.reduce<AgentRunUsage>(
      (acc, m) => ({
        inputTokens: acc.inputTokens + (m.inputTokens ?? 0),
        outputTokens: acc.outputTokens + (m.outputTokens ?? 0),
        cacheReadTokens: acc.cacheReadTokens + (m.cacheReadInputTokens ?? 0),
      }),
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
    );
  }
  const u = msg.usage as
    | { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number }
    | undefined;
  return {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cacheReadTokens: u?.cache_read_input_tokens ?? 0,
  };
}

function textOf(msg: SDKMessage): string | undefined {
  if (msg.type !== "assistant") return undefined;
  const blocks = msg.message?.content as Array<{ type: string; text?: string }> | undefined;
  if (!Array.isArray(blocks)) return undefined;
  return blocks
    .filter((b) => b?.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
}

/**
 * Runs one Agent SDK `query()` as a tracked job.
 *
 * - inserts `agent_runs` (status running) before the first token is spent
 * - enforces the per-business monthly cap (`businesses.ai_monthly_budget_usd`) up front
 * - streams messages, recording tool/subagent decisions
 * - persists usage, cost, session id and final status
 */
export async function runAgentJob(input: RunAgentJobInput): Promise<AgentRunSummary> {
  const db = input.deps?.db ?? getDb();
  const queryFn: QueryFn = input.deps?.query ?? (sdkQuery as unknown as QueryFn);
  const now = input.deps?.now ?? (() => new Date());
  const model = input.model ?? MODEL_POLICY.supervisor.model;
  const log = logger.child({ businessId: input.businessId ?? undefined, jobId: input.jobName });

  let maxBudgetUsd = input.maxBudgetUsd;
  if (input.businessId) {
    const budget = await assertMonthlyBudget(input.businessId, db, now());
    maxBudgetUsd =
      maxBudgetUsd === undefined ? budget.remainingUsd : Math.min(maxBudgetUsd, budget.remainingUsd);
  }

  const [run] = await db
    .insert(agentRuns)
    .values({
      ...(input.runId ? { id: input.runId } : {}),
      businessId: input.businessId,
      jobName: input.jobName,
      agent: input.agentName,
      model,
      status: "running",
      startedAt: now(),
    })
    .returning({ id: agentRuns.id });
  if (!run) throw new Error("failed to create agent_runs row");
  const runId = run.id;

  const decisionLog: DecisionLogEntry[] = [];
  const pushDecision = (entry: DecisionLogEntry) => {
    if (decisionLog.length < MAX_DECISION_LOG) decisionLog.push(entry);
  };

  let sessionId: string | null = null;
  let resultMessage: SDKResultMessage | undefined;
  let finalText = "";

  const disallowedTools = [...new Set([...RUNTIME_DISALLOWED_TOOLS])];

  const options: Options = {
    model,
    ...(input.systemPrompt !== undefined ? { systemPrompt: input.systemPrompt } : {}),
    ...(input.agents ? { agents: input.agents } : {}),
    ...(input.mcpServers ? { mcpServers: input.mcpServers } : {}),
    ...(input.tools ? { allowedTools: input.tools } : {}),
    disallowedTools,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    ...(maxBudgetUsd !== undefined ? { maxBudgetUsd } : {}),
    maxTurns: input.maxTurns ?? 60,
    ...(input.hooks ? { hooks: input.hooks } : {}),
    ...(input.resume ? { resume: input.resume } : {}),
    // runtime agents are not code agents: never inherit repo settings or CLAUDE.md
    settingSources: [],
  };

  try {
    for await (const msg of queryFn({ prompt: input.prompt, options })) {
      if (msg.type === "system" && msg.subtype === "init") {
        sessionId = msg.session_id;
        continue;
      }
      if (msg.type === "assistant") {
        const text = textOf(msg);
        if (text) finalText = text;
        const blocks = msg.message?.content as
          | Array<{ type: string; name?: string; input?: unknown }>
          | undefined;
        if (Array.isArray(blocks)) {
          for (const b of blocks) {
            if (b?.type === "tool_use") {
              const name = String(b.name ?? "unknown");
              pushDecision({
                at: new Date().toISOString(),
                kind: name === "Agent" || name === "Task" ? "subagent" : "tool_use",
                name,
                detail:
                  name === "Agent" || name === "Task"
                    ? String((b.input as { subagent_type?: string } | undefined)?.subagent_type ?? "")
                    : undefined,
              });
            }
          }
        }
        continue;
      }
      if (msg.type === "result") {
        resultMessage = msg;
        if (msg.subtype === "success") finalText = msg.result ?? finalText;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ runId, error: message }, "agent run failed");
    await db
      .update(agentRuns)
      .set({
        status: "failed",
        error: message.slice(0, 4000),
        finishedAt: now(),
        decisionLog,
        result: { sessionId },
      })
      .where(eq(agentRuns.id, runId));
    return {
      runId,
      businessId: input.businessId,
      jobName: input.jobName,
      agent: input.agentName,
      model,
      status: "failed",
      costUsd: 0,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
      sessionId,
      resultText: "",
      numTurns: 0,
      error: message,
    };
  }

  if (!resultMessage) {
    const message = "query() ended without a result message";
    await db
      .update(agentRuns)
      .set({ status: "failed", error: message, finishedAt: now(), decisionLog, result: { sessionId } })
      .where(eq(agentRuns.id, runId));
    return {
      runId,
      businessId: input.businessId,
      jobName: input.jobName,
      agent: input.agentName,
      model,
      status: "failed",
      costUsd: 0,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
      sessionId,
      resultText: "",
      numTurns: 0,
      error: message,
    };
  }

  sessionId = resultMessage.session_id ?? sessionId;
  const usage = usageFromResult(resultMessage);
  const reported = Number(resultMessage.total_cost_usd ?? 0);
  const costUsd =
    Number.isFinite(reported) && reported > 0
      ? reported
      : estimateCostUsd(model, {
          input: usage.inputTokens,
          output: usage.outputTokens,
          cacheRead: usage.cacheReadTokens,
        });

  const status: AgentRunStatus =
    resultMessage.subtype === "success" && !resultMessage.is_error
      ? "succeeded"
      : resultMessage.subtype === "error_max_budget_usd"
        ? "budget_exceeded"
        : "failed";

  const error =
    status === "succeeded"
      ? null
      : resultMessage.subtype === "success"
        ? (resultMessage.result ?? "run ended with is_error")
        : `${resultMessage.subtype}: ${(resultMessage as { errors?: string[] }).errors?.join("; ") ?? ""}`;

  await db
    .update(agentRuns)
    .set({
      status,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      costUsd: costUsd.toFixed(4),
      decisionLog,
      result: {
        sessionId,
        numTurns: resultMessage.num_turns,
        text: finalText.slice(0, 20_000),
        subtype: resultMessage.subtype,
      },
      error: error ? error.slice(0, 4000) : null,
      finishedAt: now(),
    })
    .where(eq(agentRuns.id, runId));

  log.info({ runId, status, costUsd }, "agent run finished");

  return {
    runId,
    businessId: input.businessId,
    jobName: input.jobName,
    agent: input.agentName,
    model,
    status,
    costUsd,
    usage,
    sessionId,
    resultText: finalText,
    numTurns: resultMessage.num_turns ?? 0,
    error,
  };
}
