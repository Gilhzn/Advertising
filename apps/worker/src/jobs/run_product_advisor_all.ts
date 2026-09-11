import { businesses, getDb, sql } from "@adv/db";
import { enqueue, type JobPayload } from "@adv/jobs";
import { logger } from "@adv/shared";
import type { Job } from "pg-boss";

/**
 * Weekly fan-out (cron: Monday 05:30 UTC, see `SCHEDULES.run_product_advisor_all`): enqueues one
 * `run_product_advisor` job per business with a linked PostHog project (`businesses.posthog_project_id`)
 * - the product advisor has nothing to read otherwise.
 */
export async function handleRunProductAdvisorAll(
  jobs: Job<JobPayload<"run_product_advisor_all">>[],
): Promise<void> {
  for (const job of jobs) {
    const log = logger.child({ jobId: job.id, jobName: "run_product_advisor_all" });
    const db = getDb();

    const rows = await db
      .select({ id: businesses.id })
      .from(businesses)
      .where(sql`${businesses.posthogProjectId} is not null`);

    log.info({ businesses: rows.length }, "run_product_advisor_all: fanning out");

    for (const row of rows) {
      await enqueue("run_product_advisor", { businessId: row.id }, { singletonKey: row.id });
    }
  }
}
