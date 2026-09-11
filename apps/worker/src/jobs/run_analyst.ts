import { JOBS, type JobPayload } from "@adv/jobs";
import type { Job } from "pg-boss";
import { runAnalyst } from "../agents-shim.js";
import { runAgentJob } from "../lib/agent-job.js";

export async function handleRunAnalyst(jobs: Job<JobPayload<"run_analyst">>[]): Promise<void> {
  await runAgentJob("run_analyst", jobs, "analyst", async (payload) => {
    const data = JOBS.run_analyst.parse(payload);
    return runAnalyst(data.businessId);
  });
}
