/**
 * Single source of truth for which model/effort each runtime agent and job uses.
 * Mirrors .claude/skills/model-policy/SKILL.md - keep both in sync.
 */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AgentModelSpec {
  model: string;
  effort?: Effort;
  /** Haiku 4.5 uses budget_tokens-style thinking; adaptive for everything else */
  thinking: "adaptive" | "budget";
}

const OPUS = "claude-opus-5";
const SONNET = "claude-sonnet-5";
const HAIKU = "claude-haiku-4-5";

export const MODEL_POLICY = {
  supervisor: { model: process.env.SUPERVISOR_MODEL || OPUS, effort: "high", thinking: "adaptive" },
  strategist: { model: OPUS, effort: "xhigh", thinking: "adaptive" },
  analyst: { model: OPUS, effort: "high", thinking: "adaptive" },
  productAdvisor: { model: OPUS, effort: "high", thinking: "adaptive" },
  appImprover: { model: OPUS, effort: "xhigh", thinking: "adaptive" },
  communityScout: { model: SONNET, effort: "medium", thinking: "adaptive" },
  copywriter: { model: SONNET, effort: "medium", thinking: "adaptive" },
  visualDirector: { model: SONNET, effort: "medium", thinking: "adaptive" },
  complianceGuard: { model: SONNET, effort: "low", thinking: "adaptive" },
  classifier: { model: HAIKU, thinking: "budget" },
} as const satisfies Record<string, AgentModelSpec>;

export type RuntimeAgentName = keyof typeof MODEL_POLICY;

/** Per-job spend caps in USD (enforced through Agent SDK maxBudgetUsd and direct-API accounting). */
export const JOB_BUDGETS_USD = {
  discover_business: 3,
  generate_content_batch: 1.5,
  run_analyst: 1.5,
  run_product_advisor: 1.5,
  improve_app: 5,
} as const;

/** USD per million tokens, used for cost accounting when the SDK does not report cost. */
export const PRICING_PER_MTOK: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
};

export function estimateCostUsd(
  model: string,
  usage: { input: number; output: number; cacheRead?: number },
): number {
  const p = PRICING_PER_MTOK[model] ?? PRICING_PER_MTOK["claude-opus-5"]!;
  return (usage.input * p.input + usage.output * p.output + (usage.cacheRead ?? 0) * p.cacheRead) / 1_000_000;
}
