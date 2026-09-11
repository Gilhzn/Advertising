import { businesses, eq, getDb } from "@adv/db";
import { enqueue, JOBS, type JobPayload } from "@adv/jobs";
import { logger } from "@adv/shared";
import type { Job } from "pg-boss";
import { runAnalyst } from "../agents-shim.js";
import { runAgentJob } from "../lib/agent-job.js";

/** Reads `businesses.weights` as a stable JSON string for before/after comparison. */
async function weightsSnapshot(businessId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ weights: businesses.weights })
    .from(businesses)
    .where(eq(businesses.id, businessId));
  return JSON.stringify(row?.weights ?? null);
}

export async function handleRunAnalyst(jobs: Job<JobPayload<"run_analyst">>[]): Promise<void> {
  await runAgentJob("run_analyst", jobs, "analyst", async (payload) => {
    const data = JOBS.run_analyst.parse(payload);
    const log = logger.child({ jobName: "run_analyst", businessId: data.businessId });

    const before = await weightsSnapshot(data.businessId);
    const result = await runAnalyst(data.businessId);
    const after = await weightsSnapshot(data.businessId);

    if (before !== after) {
      log.info("run_analyst: weights changed, enqueueing discover_business (reason: replan)");
      await enqueue("discover_business", { businessId: data.businessId, reason: "replan" });
    }

    return result;
  });
}
