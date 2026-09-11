import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { analystAgent } from "./analyst.js";
import { communityScoutAgent } from "./community-scout.js";
import { complianceGuardAgent } from "./compliance-guard.js";
import { copywriterAgent } from "./copywriter.js";
import { productAdvisorAgent } from "./product-advisor.js";
import { strategistAgent } from "./strategist.js";
import { visualDirectorAgent } from "./visual-director.js";

export * from "./analyst.js";
export * from "./community-scout.js";
export * from "./compliance-guard.js";
export * from "./copywriter.js";
export * from "./product-advisor.js";
export * from "./shared.js";
export * from "./strategist.js";
export * from "./supervisor.js";
export * from "./visual-director.js";

/** Subagent names as they are addressed through the built-in Agent tool. */
export const SUBAGENT_NAMES = [
  "strategist",
  "community-scout",
  "copywriter",
  "visual-director",
  "compliance-guard",
  "analyst",
  "product-advisor",
] as const;
export type SubagentName = (typeof SUBAGENT_NAMES)[number];

const FACTORIES: Record<SubagentName, () => AgentDefinition> = {
  strategist: strategistAgent,
  "community-scout": communityScoutAgent,
  copywriter: copywriterAgent,
  "visual-director": visualDirectorAgent,
  "compliance-guard": complianceGuardAgent,
  analyst: analystAgent,
  "product-advisor": productAdvisorAgent,
};

/** Builds the `options.agents` map for a job - only the agents that job actually needs. */
export function buildAgents(names: readonly SubagentName[]): Record<string, AgentDefinition> {
  const out: Record<string, AgentDefinition> = {};
  for (const n of names) out[n] = FACTORIES[n]();
  return out;
}
