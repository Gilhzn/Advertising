import { JOBS, type JobPayload } from "@adv/jobs";
import type { Job } from "pg-boss";
import { runDiscovery } from "../agents-shim.js";
import { runAgentJob } from "../lib/agent-job.js";

export async function handleDiscoverBusiness(jobs: Job<JobPayload<"discover_business">>[]): Promise<void> {
  await runAgentJob("discover_business", jobs, "strategist", async (payload) => {
    const data = JOBS.discover_business.parse(payload);
    return runDiscovery(data.businessId, data.reason);
  });
}
