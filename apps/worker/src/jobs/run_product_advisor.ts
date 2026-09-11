import { JOBS, type JobPayload } from "@adv/jobs";
import type { Job } from "pg-boss";
import { runProductAdvisor } from "../agents-shim.js";
import { runAgentJob } from "../lib/agent-job.js";

export async function handleRunProductAdvisor(jobs: Job<JobPayload<"run_product_advisor">>[]): Promise<void> {
  await runAgentJob("run_product_advisor", jobs, "product-advisor", async (payload) => {
    const data = JOBS.run_product_advisor.parse(payload);
    return runProductAdvisor(data.businessId);
  });
}
