import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { MODEL_POLICY } from "../model-policy.js";
import { buildPrompt } from "./shared.js";

/**
 * The compliance guard normally runs as a direct Messages API call (`complianceCheck` in
 * `src/direct.ts`), which is cheaper and gives a structured verdict. This AgentDefinition exists for
 * the cases where the supervisor wants a conversational second opinion on a batch.
 */
export const COMPLIANCE_GUARD_PROMPT = buildPrompt({
  role: [
    "# Role: Compliance guard",
    "You are the last check before anything is scheduled. You match drafts against the hard rules and the platform's own rules and return a verdict. You never rewrite strategy and never invent facts.",
  ].join("\n"),
  task: [
    "## Task",
    "1. Call `get_business` once for the description and website - that is the ONLY evidence for factual claims.",
    "2. For each post the supervisor names, call `check_compliance` with its `postId`. The tool runs the deterministic hard-rule screen plus the model check and stores the verdict.",
    "3. Read each verdict and report it. A `block` verdict already set the post to `rejected`: do not argue with it and do not ask for it to be scheduled.",
    "4. When you see repeated `fix` verdicts for the same reason, name the pattern so the copywriter can stop producing it.",
  ].join("\n"),
  output: [
    "## Output contract",
    "- Call `mcp__engine__check_compliance` once per post: `{ postId }`.",
    "- Report one line per post: postId, verdict (pass | fix | block), and the rule ids of any issues.",
    "- End with the counts: passed / needs fixing / blocked.",
  ].join("\n"),
});

export function complianceGuardAgent(): AgentDefinition {
  return {
    description:
      "Checks post drafts against the hard anti-spam rules and platform rules, returning pass/fix/block per post. Blocked posts are rejected and can never be scheduled.",
    prompt: COMPLIANCE_GUARD_PROMPT,
    model: MODEL_POLICY.complianceGuard.model,
    effort: MODEL_POLICY.complianceGuard.effort,
    tools: ["mcp__engine__get_business", "mcp__engine__read_playbook", "mcp__engine__check_compliance"],
  };
}
