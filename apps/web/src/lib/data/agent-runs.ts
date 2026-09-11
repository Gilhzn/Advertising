import { agentRuns, and, desc, eq, getDb, gte, inArray } from "@adv/db";

export type AgentRun = typeof agentRuns.$inferSelect;

export async function getRunningRun(businessId: string, jobName?: string): Promise<AgentRun | null> {
  const db = getDb();
  const conditions = [eq(agentRuns.businessId, businessId), eq(agentRuns.status, "running")];
  if (jobName) conditions.push(eq(agentRuns.jobName, jobName));
  const [row] = await db
    .select()
    .from(agentRuns)
    .where(and(...conditions))
    .orderBy(desc(agentRuns.startedAt))
    .limit(1);
  return row ?? null;
}

export async function listRecentRuns(businessId: string, limit = 10): Promise<AgentRun[]> {
  const db = getDb();
  return db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.businessId, businessId))
    .orderBy(desc(agentRuns.startedAt))
    .limit(limit);
}

export async function listRecentRunsForBusinesses(businessIds: string[], limit = 10): Promise<AgentRun[]> {
  if (businessIds.length === 0) return [];
  const db = getDb();
  return db
    .select()
    .from(agentRuns)
    .where(inArray(agentRuns.businessId, businessIds))
    .orderBy(desc(agentRuns.startedAt))
    .limit(limit);
}

/** Sum of agent_runs.cost_usd for a business within [start, end). */
export async function monthlyAiSpend(businessId: string, monthStart: Date): Promise<number> {
  const db = getDb();
  const rows = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.businessId, businessId), gte(agentRuns.startedAt, monthStart)));
  return rows.reduce((sum, r) => sum + Number.parseFloat(r.costUsd), 0);
}

export interface JobAgentSpend {
  jobName: string;
  agent: string;
  costUsd: number;
  runs: number;
}

/** Month-to-date spend grouped by job/agent, for one business. */
export async function spendByJobAgent(businessId: string, monthStart: Date): Promise<JobAgentSpend[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.businessId, businessId), gte(agentRuns.startedAt, monthStart)));
  return summarizeByJobAgent(rows);
}

/** Month-to-date spend grouped by job/agent, across every business owned by a user. */
export async function spendByJobAgentForBusinesses(
  businessIds: string[],
  monthStart: Date,
): Promise<JobAgentSpend[]> {
  if (businessIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select()
    .from(agentRuns)
    .where(and(inArray(agentRuns.businessId, businessIds), gte(agentRuns.startedAt, monthStart)));
  return summarizeByJobAgent(rows);
}

function summarizeByJobAgent(rows: AgentRun[]): JobAgentSpend[] {
  const byKey = new Map<string, JobAgentSpend>();
  for (const r of rows) {
    const key = `${r.jobName}:${r.agent}`;
    const slot = byKey.get(key) ?? { jobName: r.jobName, agent: r.agent, costUsd: 0, runs: 0 };
    slot.costUsd += Number.parseFloat(r.costUsd);
    slot.runs += 1;
    byKey.set(key, slot);
  }
  return [...byKey.values()].sort((a, b) => b.costUsd - a.costUsd);
}
