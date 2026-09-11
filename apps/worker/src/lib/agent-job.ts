import { BudgetExceededError } from "@adv/agents";
import { logger } from "@adv/shared";
import type { Job } from "pg-boss";
import { writeAudit } from "./audit.js";

/**
 * Shared wrapper for the LLM-driven jobs (discover_business, generate_content_batch, run_analyst,
 * run_product_advisor): structured logging + an `audit_log` row on completion/failure.
 *
 * - On success: writes `${jobName}.completed` and returns.
 * - On `BudgetExceededError` (the business has exhausted its monthly AI cap): writes
 *   `${jobName}.budget_exceeded` and returns WITHOUT throwing - this is a terminal, expected
 *   business condition, not a transient failure, so pg-boss must not retry it (retrying would just
 *   throw the same error every time until the next calendar month).
 * - On any other error: writes `${jobName}.failed` and re-throws so pg-boss retries per the queue's
 *   `retryLimit`.
 */
export async function runAgentJob<T extends { businessId: string }>(
  jobName: string,
  jobs: Job<T>[],
  agent: string,
  run: (payload: T) => Promise<unknown>,
): Promise<void> {
  for (const job of jobs) {
    const payload = job.data;
    const log = logger.child({ jobId: job.id, jobName, businessId: payload.businessId });
    log.info("job started");
    try {
      await run(payload);
      await writeAudit(payload.businessId, `agent:${agent}`, `${jobName}.completed`, { jobId: job.id });
      log.info("job completed");
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        log.warn({ spentUsd: err.spentUsd, capUsd: err.capUsd }, "job skipped: monthly AI budget exhausted");
        await writeAudit(payload.businessId, "system", `${jobName}.budget_exceeded`, {
          jobId: job.id,
          spentUsd: err.spentUsd,
          capUsd: err.capUsd,
        });
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      log.error({ err: message }, "job failed");
      await writeAudit(payload.businessId, "system", `${jobName}.failed`, { jobId: job.id, error: message });
      throw err;
    }
  }
}
