import { businesses, type Db, eq, getDb } from "@adv/db";
import type { PlatformId } from "@adv/shared";
import { buildAgents, SUPERVISOR_SYSTEM_PROMPT, type SubagentName, supervisorModel } from "./agents/index.js";
import { jobHooks, newRunId } from "./hooks.js";
import { JOB_BUDGETS_USD } from "./model-policy.js";
import { type AgentRunSummary, type RunnerDeps, runAgentJob } from "./runner.js";
import { type CreatedIds, createEngineServer, type EngineContext, emptyCreatedIds } from "./tools/engine.js";

/**
 * The four supervisor jobs the worker schedules. Each one builds its own prompt, subagent map,
 * engine server, hooks and budget, and returns a typed summary of what it created.
 */

export interface JobDeps extends RunnerDeps {
  /** injectable engine pieces (compliance stub, media stub, fetch options) - used by evals */
  engine?: Pick<EngineContext, "complianceFn" | "media" | "fetchOptions">;
}

export interface JobSummaryBase {
  runId: string;
  businessId: string;
  jobName: string;
  status: AgentRunSummary["status"];
  costUsd: number;
  sessionId: string | null;
  error: string | null;
  report: string;
}

export interface DiscoverySummary extends JobSummaryBase {
  brandKitIds: string[];
  channelPlanIds: string[];
  communityIds: string[];
}

export interface ContentBatchSummary extends JobSummaryBase {
  postIds: string[];
  scheduledPostIds: string[];
  awaitingApprovalPostIds: string[];
  rejectedPostIds: string[];
  mediaUrls: string[];
  days: number;
  platforms: PlatformId[] | null;
}

export interface AnalystSummary extends JobSummaryBase {
  insightIds: string[];
  recommendationIds: string[];
}

export interface ProductAdvisorSummary extends JobSummaryBase {
  recommendationIds: string[];
}

interface JobSetup {
  runId: string;
  db: Db;
  created: CreatedIds;
  engine: ReturnType<typeof createEngineServer>;
  hooks: ReturnType<typeof jobHooks>;
}

function setup(businessId: string, deps: JobDeps | undefined, agentName: string): JobSetup {
  const db = deps?.db ?? getDb();
  const runId = newRunId();
  const created = emptyCreatedIds();
  const engine = createEngineServer({
    businessId,
    runId,
    db,
    created,
    ...(deps?.engine?.complianceFn ? { complianceFn: deps.engine.complianceFn } : {}),
    ...(deps?.engine?.media ? { media: deps.engine.media } : {}),
    ...(deps?.engine?.fetchOptions ? { fetchOptions: deps.engine.fetchOptions } : {}),
  });
  const hooks = jobHooks({ businessId, runId, db, agentName });
  return { runId, db, created, engine, hooks };
}

async function businessBrief(db: Db, businessId: string): Promise<string> {
  const [b] = await db.select().from(businesses).where(eq(businesses.id, businessId));
  if (!b) throw new Error(`business ${businessId} not found`);
  return [
    `businessId: ${b.id}`,
    `name: ${b.name}`,
    `category: ${b.category}`,
    `primaryLanguage: ${b.primaryLanguage}`,
    `languages: ${JSON.stringify(b.languages)}`,
    `timezone: ${b.timezone}`,
    `websiteUrl: ${b.websiteUrl ?? "(none)"}`,
    `targetRegion: ${b.targetRegion ?? "(none)"}`,
    `learnedWeights: ${b.weights ? JSON.stringify(b.weights) : "(none yet)"}`,
  ].join("\n");
}

function base(businessId: string, jobName: string, run: AgentRunSummary): JobSummaryBase {
  return {
    runId: run.runId,
    businessId,
    jobName,
    status: run.status,
    costUsd: run.costUsd,
    sessionId: run.sessionId,
    error: run.error,
    report: run.resultText,
  };
}

const DISCOVERY_AGENTS: SubagentName[] = ["strategist", "community-scout", "compliance-guard"];
const CONTENT_AGENTS: SubagentName[] = ["copywriter", "visual-director", "compliance-guard"];
const ANALYST_AGENTS: SubagentName[] = ["analyst"];
const PRODUCT_AGENTS: SubagentName[] = ["product-advisor"];

/** Deep discovery: brand kit, channel plan, communities. Runs once per business (or on replan). */
export async function runDiscovery(
  businessId: string,
  reason: "initial" | "replan" | "manual" = "initial",
  deps?: JobDeps,
): Promise<DiscoverySummary> {
  const s = setup(businessId, deps, "supervisor");
  const brief = await businessBrief(s.db, businessId);
  const prompt = [
    `# Job: discover_business (reason: ${reason})`,
    "",
    brief,
    "",
    "Steps:",
    "1. Call `get_business` yourself to see the full record.",
    "2. Delegate to `strategist`: classify the category if it is `other`, choose platforms (wave 1 and worksWithoutReview first, connected accounts first), write the brand kit and the 30-day channel plan, and save both. Give it the business facts above in the brief.",
    "3. Delegate to `community-scout` for verified communities. Hand its JSON back to the `strategist` so it lands in `save_channel_plan` - communities only exist once the plan is saved.",
    reason === "replan"
      ? "4. This is a REPLAN: read the existing plan first and say explicitly what you are changing and why. Do not discard a working platform without evidence."
      : "4. This is the first run for this business: there is no history to preserve.",
    "5. Verify: re-read `get_business` and confirm the brand kit and channel plan are stored and that every planned platform is one this business can actually publish to.",
    "",
    "Do not create posts in this job. Do not schedule anything.",
  ].join("\n");

  const run = await runAgentJob({
    businessId,
    jobName: "discover_business",
    agentName: "supervisor",
    runId: s.runId,
    prompt,
    systemPrompt: SUPERVISOR_SYSTEM_PROMPT,
    model: supervisorModel(),
    agents: buildAgents(DISCOVERY_AGENTS),
    mcpServers: { engine: s.engine },
    tools: ["Agent", "mcp__engine__*", "WebSearch"],
    maxBudgetUsd: JOB_BUDGETS_USD.discover_business,
    hooks: s.hooks,
    maxTurns: 60,
    ...(deps ? { deps } : {}),
  });

  return {
    ...base(businessId, "discover_business", run),
    brandKitIds: s.created.brandKitIds,
    channelPlanIds: s.created.channelPlanIds,
    communityIds: s.created.communityIds,
  };
}

export interface ContentBatchOptions {
  days?: number;
  platforms?: PlatformId[];
}

/** Weekly content batch: drafts, images, compliance, scheduling. */
export async function runContentBatch(
  businessId: string,
  opts: ContentBatchOptions = {},
  deps?: JobDeps,
): Promise<ContentBatchSummary> {
  const days = opts.days ?? 7;
  const platforms = opts.platforms ?? null;
  const s = setup(businessId, deps, "supervisor");
  const brief = await businessBrief(s.db, businessId);
  const prompt = [
    "# Job: generate_content_batch",
    "",
    brief,
    `window: the next ${days} days, starting now (UTC)`,
    platforms
      ? `platforms: restrict this batch to ${platforms.join(", ")}`
      : "platforms: use the channel plan",
    "",
    "Steps:",
    "1. Call `get_business`. If there is no channel plan, stop and report that discovery has to run first.",
    "2. Delegate to `copywriter`: one batch covering EVERY platform in scope, drafts distributed across pillars by `share` and adjusted by `weights`, A/B variants on `core` platforms, one draft per language when the business has more than one. The copywriter runs `check_compliance` on each draft.",
    "3. Delegate to `visual-director` with the list of postIds the copywriter created. It renders images only for platforms whose `supports.image` is true.",
    "4. Review the compliance verdicts. Anything `block` is already `rejected` - leave it. Anything `fix` must be redrafted by the copywriter before it can be scheduled.",
    `5. Schedule: call \`schedule_post\` for each remaining draft with a time inside the next ${days} days at that platform's best local times, no two posts on one platform within the same hour. Community targets will be held for human approval - that is expected, not a failure.`,
    "",
    "Budget discipline: this job runs weekly and must stay cheap. Do not re-read the same data twice.",
  ].join("\n");

  const run = await runAgentJob({
    businessId,
    jobName: "generate_content_batch",
    agentName: "supervisor",
    runId: s.runId,
    prompt,
    systemPrompt: SUPERVISOR_SYSTEM_PROMPT,
    model: supervisorModel(),
    agents: buildAgents(CONTENT_AGENTS),
    mcpServers: { engine: s.engine },
    tools: ["Agent", "mcp__engine__*"],
    maxBudgetUsd: JOB_BUDGETS_USD.generate_content_batch,
    hooks: s.hooks,
    maxTurns: 80,
    ...(deps ? { deps } : {}),
  });

  return {
    ...base(businessId, "generate_content_batch", run),
    postIds: s.created.postIds,
    scheduledPostIds: s.created.scheduledPostIds,
    awaitingApprovalPostIds: s.created.awaitingApprovalPostIds,
    rejectedPostIds: s.created.rejectedPostIds,
    mediaUrls: s.created.mediaUrls,
    days,
    platforms,
  };
}

/** Weekly analysis: metrics in, weights out. */
export async function runAnalyst(businessId: string, deps?: JobDeps): Promise<AnalystSummary> {
  const s = setup(businessId, deps, "supervisor");
  const brief = await businessBrief(s.db, businessId);
  const prompt = [
    "# Job: run_analyst",
    "",
    brief,
    "",
    "Steps:",
    "1. Delegate to `analyst`: read the last 30 days of metrics, write 3-8 evidence-backed findings and the 0-2 weight multipliers, and save them with `save_insight`.",
    "2. Verify the weights landed on the business record (`get_business` shows `weights`).",
    "3. If the analyst found an action that is not expressible as a weight, make sure it was saved as a `marketing` recommendation.",
    "",
    "Do not create or schedule posts in this job.",
  ].join("\n");

  const run = await runAgentJob({
    businessId,
    jobName: "run_analyst",
    agentName: "supervisor",
    runId: s.runId,
    prompt,
    systemPrompt: SUPERVISOR_SYSTEM_PROMPT,
    model: supervisorModel(),
    agents: buildAgents(ANALYST_AGENTS),
    mcpServers: { engine: s.engine },
    tools: ["Agent", "mcp__engine__*"],
    maxBudgetUsd: JOB_BUDGETS_USD.run_analyst,
    hooks: s.hooks,
    maxTurns: 40,
    ...(deps ? { deps } : {}),
  });

  return {
    ...base(businessId, "run_analyst", run),
    insightIds: s.created.insightIds,
    recommendationIds: s.created.recommendationIds,
  };
}

/** Weekly product review: in-app analytics to prioritised recommendations. */
export async function runProductAdvisor(businessId: string, deps?: JobDeps): Promise<ProductAdvisorSummary> {
  const s = setup(businessId, deps, "supervisor");
  const brief = await businessBrief(s.db, businessId);
  const prompt = [
    "# Job: run_product_advisor",
    "",
    brief,
    "",
    "Steps:",
    "1. Delegate to `product-advisor`: read the latest product analytics snapshots, write 3-5 prioritised `product` recommendations and 1-2 `marketing` ones, each saved with `save_recommendation`.",
    "2. If the business has no product analytics connected, report that and stop - do not invent recommendations.",
    "",
    "The app-improvement agent (which opens PRs) is a separate job; do not attempt any code change here.",
  ].join("\n");

  const run = await runAgentJob({
    businessId,
    jobName: "run_product_advisor",
    agentName: "supervisor",
    runId: s.runId,
    prompt,
    systemPrompt: SUPERVISOR_SYSTEM_PROMPT,
    model: supervisorModel(),
    agents: buildAgents(PRODUCT_AGENTS),
    mcpServers: { engine: s.engine },
    tools: ["Agent", "mcp__engine__*"],
    maxBudgetUsd: JOB_BUDGETS_USD.run_product_advisor,
    hooks: s.hooks,
    maxTurns: 40,
    ...(deps ? { deps } : {}),
  });

  return {
    ...base(businessId, "run_product_advisor", run),
    recommendationIds: s.created.recommendationIds,
  };
}
