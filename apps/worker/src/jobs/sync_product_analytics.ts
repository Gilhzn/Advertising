import { syncProductAnalytics } from "@adv/analytics";
import { businesses, getDb, sql } from "@adv/db";
import { JOBS, type JobPayload } from "@adv/jobs";
import { logger } from "@adv/shared";
import type { Job } from "pg-boss";
import { writeAudit } from "../lib/audit.js";

/**
 * Pulls fresh PostHog snapshots via `@adv/analytics`'s `syncProductAnalytics`, either for one
 * business (`payload.businessId`) or - on the daily cron - for every business with a linked PostHog
 * project. Each business runs in its own try/catch so one bad project (auth failure, HogQL error)
 * never stops the rest of the batch.
 */
export async function handleSyncProductAnalytics(
  jobs: Job<JobPayload<"sync_product_analytics">>[],
): Promise<void> {
  for (const job of jobs) {
    const data = JOBS.sync_product_analytics.parse(job.data);
    const log = logger.child({ jobId: job.id, jobName: "sync_product_analytics" });
    const db = getDb();

    const businessIds = data.businessId
      ? [data.businessId]
      : (
          await db
            .select({ id: businesses.id })
            .from(businesses)
            .where(sql`${businesses.posthogProjectId} is not null`)
        ).map((r) => r.id);

    log.info({ businesses: businessIds.length }, "sync_product_analytics: syncing");

    for (const businessId of businessIds) {
      try {
        const result = await syncProductAnalytics(businessId);
        if (result.skipped) {
          await writeAudit(businessId, "system", "sync_product_analytics.skipped", {
            jobId: job.id,
            reason: result.reason,
          });
        } else {
          await writeAudit(businessId, "system", "sync_product_analytics.synced", {
            jobId: job.id,
            kinds: result.kinds,
            clickMetricsWritten: result.clickMetricsWritten,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error({ err: message, businessId }, "sync_product_analytics: business failed");
        await writeAudit(businessId, "system", "sync_product_analytics.failed", {
          jobId: job.id,
          error: message,
        });
      }
    }
  }
}
