import { JOBS, type JobPayload } from "@adv/jobs";
import type { Job } from "pg-boss";
import { runContentBatch } from "../agents-shim.js";
import { runAgentJob } from "../lib/agent-job.js";

export async function handleGenerateContentBatch(
  jobs: Job<JobPayload<"generate_content_batch">>[],
): Promise<void> {
  await runAgentJob("generate_content_batch", jobs, "copywriter", async (payload) => {
    const data = JOBS.generate_content_batch.parse(payload);
    return runContentBatch(data.businessId, { days: data.days, platforms: data.platforms });
  });
}
