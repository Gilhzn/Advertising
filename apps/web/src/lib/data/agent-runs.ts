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
