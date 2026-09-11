import { eq, getDb, posts } from "@adv/db";
import { enqueue, type JobPayload } from "@adv/jobs";
import { logger } from "@adv/shared";
import type { Job } from "pg-boss";

/**
 * Weekly fan-out (cron: Monday 05:00 UTC, see `SCHEDULES.run_analyst_all`): enqueues one
 * `run_analyst` job per business that has at least one published post. A business with nothing
 * published yet has no metrics for the analyst to learn from, so it is skipped rather than
 * spending a run on it.
 */
export async function handleRunAnalystAll(jobs: Job<JobPayload<"run_analyst_all">>[]): Promise<void> {
  for (const job of jobs) {
    const log = logger.child({ jobId: job.id, jobName: "run_analyst_all" });
    const db = getDb();

    const rows = await db
      .selectDistinct({ businessId: posts.businessId })
      .from(posts)
      .where(eq(posts.status, "published"));

    log.info({ businesses: rows.length }, "run_analyst_all: fanning out");

    for (const row of rows) {
      await enqueue("run_analyst", { businessId: row.businessId }, { singletonKey: row.businessId });
    }
  }
}
