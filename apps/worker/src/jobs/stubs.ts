/**
 * Handlers for jobs whose implementing packages (`packages/analytics`, `packages/email`, the
 * app-improvement coding agent) are out of scope for this slice. They validate their payload against
 * the `JOBS` contract, log a clear "not implemented" note, and complete successfully so the recurring
 * `SCHEDULES` entries (sync_product_analytics) never pile up retries, and so a UI that enqueues
 * provision_mailbox / verify_mailbox_dns / improve_app today does not hang forever waiting on a job
 * that will never finish.
 */
import { JOBS, type JobName, type JobPayload } from "@adv/jobs";
import { logger } from "@adv/shared";
import type { Job } from "pg-boss";
import { writeAudit } from "../lib/audit.js";

function makeStubHandler<N extends JobName>(name: N) {
  return async (jobs: Job<JobPayload<N>>[]): Promise<void> => {
    for (const job of jobs) {
      const data = JOBS[name].parse(job.data) as Record<string, unknown>;
      const businessId = typeof data.businessId === "string" ? data.businessId : null;
      logger.info({ jobId: job.id, jobName: name, data }, `${name}: not implemented in this phase`);
      await writeAudit(businessId, "system", `${name}.skipped`, {
        jobId: job.id,
        reason: "not implemented in this phase",
      });
    }
  };
}

export const handleSyncProductAnalytics = makeStubHandler("sync_product_analytics");
export const handleProvisionMailbox = makeStubHandler("provision_mailbox");
export const handleVerifyMailboxDns = makeStubHandler("verify_mailbox_dns");
export const handleImproveApp = makeStubHandler("improve_app");
