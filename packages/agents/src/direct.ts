import { agentRuns, type Db, getDb } from "@adv/db";
import { loadRules } from "@adv/knowledge";
import { type ComplianceResult, ComplianceResultSchema, type PlatformId } from "@adv/shared";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { screenHardRules, verdictFor } from "./compliance-rules.js";
import { type AgentModelSpec, estimateCostUsd, MODEL_POLICY } from "./model-policy.js";

/**
 * Thin helpers for the non-agentic Claude calls: short classification and the compliance guard.
 * Everything agentic goes through `runAgentJob` / the Agent SDK instead.
 */

/** Server-side refusal fallbacks are only wired for the Opus/Fable tier (model-policy skill). */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
function needsFallbacks(model: string): boolean {
  return model.startsWith("claude-opus") || model.startsWith("claude-fable");
}

let cachedClient: Anthropic | undefined;
export function getAnthropic(): Anthropic {
  if (!cachedClient) cachedClient = new Anthropic();
  return cachedClient;
}

export interface DirectAccounting {
  businessId: string | null;
  jobName: string;
  agent: string;
  db?: Db;
  /** skip writing an `agent_runs` row (used by tests/evals) */
  skipAccounting?: boolean;
}

interface DirectUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

async function recordDirectRun(
  acc: DirectAccounting | undefined,
  model: string,
  usage: DirectUsage | undefined,
  error?: string,
): Promise<{ runId: string | null; costUsd: number }> {
  const input = usage?.input_tokens ?? 0;
  const output = usage?.output_tokens ?? 0;
  const cacheRead = usage?.cache_read_input_tokens ?? 0;
  const costUsd = estimateCostUsd(model, { input, output, cacheRead });
  if (!acc || acc.skipAccounting) return { runId: null, costUsd };
  const db = acc.db ?? getDb();
  const [row] = await db
    .insert(agentRuns)
    .values({
      businessId: acc.businessId,
      jobName: acc.jobName,
      agent: acc.agent,
      model,
      status: error ? "failed" : "succeeded",
      inputTokens: input,
      outputTokens: output,
      cacheReadTokens: cacheRead,
      costUsd: costUsd.toFixed(4),
      error: error ? error.slice(0, 4000) : null,
      finishedAt: new Date(),
    })
    .returning({ id: agentRuns.id });
  return { runId: row?.id ?? null, costUsd };
}

function thinkingFor(spec: AgentModelSpec, budgetTokens: number) {
  // Haiku 4.5 still takes budget_tokens; Opus 5 / Sonnet 5 reject it with a 400.
  return spec.thinking === "budget"
    ? ({ type: "enabled", budget_tokens: budgetTokens } as const)
    : ({ type: "adaptive" } as const);
}

function textFrom(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();
}

export interface ClassifyInput {
  /** stable instruction block: put the taxonomy and rules here (cached) */
  instructions: string;
  /** per-call content: classified last so the cached prefix stays stable */
  content: string;
  labels: readonly string[];
  /** set to 0 to disable thinking entirely for trivial tagging */
  thinkingBudgetTokens?: number;
  maxTokens?: number;
  accounting?: DirectAccounting;
}

export interface ClassifyResult {
  label: string;
  raw: string;
  costUsd: number;
  runId: string | null;
}

/**
 * Haiku 4.5 single-label classification (category tagging, sentiment, short summaries).
 * Returns the first label that appears in the answer, falling back to the raw text.
 */
export async function classify(input: ClassifyInput): Promise<ClassifyResult> {
  const spec = MODEL_POLICY.classifier;
  const budget = input.thinkingBudgetTokens ?? 1024;
  const client = getAnthropic();
  const maxTokens = input.maxTokens ?? Math.max(budget + 512, 1536);

  try {
    const msg = await client.messages.create({
      model: spec.model,
      max_tokens: maxTokens,
      ...(budget > 0 ? { thinking: thinkingFor(spec, budget) } : {}),
      system: [
        {
          type: "text",
          text: `${input.instructions}\n\nAnswer with exactly one of: ${input.labels.join(", ")}. No other words.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: input.content }],
    });
    const raw = textFrom(msg.content as Array<{ type: string; text?: string }>);
    const lower = raw.toLowerCase();
    const label = input.labels.find((l) => lower.includes(l.toLowerCase())) ?? raw;
    const { runId, costUsd } = await recordDirectRun(input.accounting, spec.model, msg.usage);
    return { label, raw, costUsd, runId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordDirectRun(input.accounting, spec.model, undefined, message);
    throw err;
  }
}

export interface ComplianceCheckInput {
  platform: PlatformId;
  title?: string | null;
  body: string;
  hashtags?: string[];
  language: string;
  /** business description + website copy - the only claims we may make */
  evidenceText?: string;
  isCommunityTarget?: boolean;
  /** community rules summary, when the target is a community */
  communityRules?: string;
  accounting?: DirectAccounting;
}

export interface ComplianceCheckResult extends ComplianceResult {
  costUsd: number;
  runId: string | null;
  /** true when the deterministic screen blocked without calling the model */
  screenedLocally: boolean;
}

const COMPLIANCE_SYSTEM_PREFIX = [
  "You are the compliance-guard for a multi-platform promotion engine.",
  "You check one draft post against the hard anti-spam rules below and the platform's own rules.",
  "You never rewrite strategy, never invent facts, and never approve a post that claims something absent from the evidence.",
  "",
  "HARD RULES (verbatim, source of truth):",
].join("\n");

const COMPLIANCE_SYSTEM_SUFFIX = [
  "",
  "Verdicts:",
  '- "block": breaks a hard rule (vote solicitation, mass DM, engagement pods, unsupported claims/awards,',
  "  hashtags on Hacker News, marketing tone in a Show HN title, posting to a community without approval).",
  '- "fix": salvageable problems (tone, length, missing CTA, wrong format). Provide `suggestedBody`.',
  '- "pass": ready to schedule.',
  "List every issue you find with its rule id and severity. Be terse.",
].join("\n");

/**
 * Wire schema for structured output: `suggestedBody` is nullable rather than optional so every
 * property stays in the JSON schema's `required` list, which structured outputs demand.
 */
const ComplianceWireSchema = z.object({
  verdict: z.enum(["pass", "fix", "block"]),
  issues: z.array(
    z.object({
      rule: z.string(),
      severity: z.enum(["low", "medium", "high"]),
      detail: z.string(),
    }),
  ),
  suggestedBody: z.string().nullable(),
});

function complianceSystemBlocks() {
  return [
    {
      type: "text" as const,
      text: `${COMPLIANCE_SYSTEM_PREFIX}\n${loadRules()}\n${COMPLIANCE_SYSTEM_SUFFIX}`,
      cache_control: { type: "ephemeral" as const },
    },
  ];
}

/**
 * Sonnet 5 compliance check with structured output.
 *
 * The deterministic hard-rule screen runs first: if it finds a high-severity violation the post is
 * blocked without an API call, so a banned pattern is never waved through by a lenient model.
 */
export async function complianceCheck(input: ComplianceCheckInput): Promise<ComplianceCheckResult> {
  const screened = screenHardRules({
    platform: input.platform,
    title: input.title ?? null,
    body: input.body,
    hashtags: input.hashtags ?? [],
    evidenceText: input.evidenceText ?? "",
    isCommunityTarget: input.isCommunityTarget ?? false,
  });
  if (verdictFor(screened) === "block") {
    return { verdict: "block", issues: screened, costUsd: 0, runId: null, screenedLocally: true };
  }

  const spec = MODEL_POLICY.complianceGuard;
  const client = getAnthropic();
  const userPayload = JSON.stringify(
    {
      platform: input.platform,
      language: input.language,
      isCommunityTarget: input.isCommunityTarget ?? false,
      communityRules: input.communityRules ?? null,
      evidence: (input.evidenceText ?? "").slice(0, 8000),
      draft: { title: input.title ?? null, body: input.body, hashtags: input.hashtags ?? [] },
    },
    null,
    2,
  );

  const params = {
    model: spec.model,
    max_tokens: 4096,
    thinking: thinkingFor(spec, 1024),
    output_config: {
      effort: spec.effort ?? ("low" as const),
      format: zodOutputFormat(ComplianceWireSchema),
    },
    system: complianceSystemBlocks(),
    messages: [{ role: "user" as const, content: userPayload }],
  };

  try {
    // Opus/Fable get server-side refusal fallbacks (model-policy skill); Sonnet/Haiku do not need them.
    const msg = needsFallbacks(spec.model)
      ? await client.beta.messages.parse({
          ...params,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
        })
      : await client.messages.parse(params);

    const wire =
      msg.parsed_output ??
      ComplianceWireSchema.parse(JSON.parse(textFrom(msg.content as Array<{ type: string; text?: string }>)));
    const parsed = ComplianceResultSchema.parse({
      verdict: wire.verdict,
      issues: wire.issues,
      ...(wire.suggestedBody ? { suggestedBody: wire.suggestedBody } : {}),
    });
    const merged: ComplianceResult = {
      verdict: screened.length > 0 && parsed.verdict === "pass" ? "fix" : parsed.verdict,
      issues: [...screened, ...parsed.issues],
      ...(parsed.suggestedBody ? { suggestedBody: parsed.suggestedBody } : {}),
    };
    const { runId, costUsd } = await recordDirectRun(input.accounting, spec.model, msg.usage);
    return { ...merged, costUsd, runId, screenedLocally: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordDirectRun(input.accounting, spec.model, undefined, message);
    throw err;
  }
}

/** Signature the engine's `check_compliance` tool uses, so evals can inject a stub. */
export type ComplianceFn = (input: ComplianceCheckInput) => Promise<ComplianceCheckResult>;
