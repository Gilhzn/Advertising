import type { JobName } from "@adv/jobs";
import type { WorkOptions } from "pg-boss";
import { handleContentAutopilot } from "./jobs/content_autopilot.js";
import { handleDiscoverBusiness } from "./jobs/discover_business.js";
import { handleFetchInsights } from "./jobs/fetch_insights.js";
import { handleGenerateContentBatch } from "./jobs/generate_content_batch.js";
import { handleImproveApp } from "./jobs/improve_app.js";
import { handleProvisionMailbox } from "./jobs/provision_mailbox.js";
import { handlePublishDuePosts } from "./jobs/publish_due_posts.js";
import { handlePublishPost } from "./jobs/publish_post.js";
import { handleRefreshTokens } from "./jobs/refresh_tokens.js";
import { handleRunAnalyst } from "./jobs/run_analyst.js";
import { handleRunAnalystAll } from "./jobs/run_analyst_all.js";
import { handleRunProductAdvisor } from "./jobs/run_product_advisor.js";
import { handleRunProductAdvisorAll } from "./jobs/run_product_advisor_all.js";
import { handleSyncProductAnalytics } from "./jobs/sync_product_analytics.js";
import { handleVerifyMailboxDns } from "./jobs/verify_mailbox_dns.js";

/** Registered handler + `work()` options for every job in the `JOBS` contract. */
// biome-ignore lint/suspicious/noExplicitAny: handlers are individually typed at their own call sites; this map only threads them through boss.work.
export type Registration = { name: JobName; options: WorkOptions; handler: (jobs: any[]) => Promise<void> };

/**
 * The single registration table, shared by both worker entry points: `main.ts` (always-on process, see
 * docs/deploy.md "Deploying to Railway") and `tick.ts` (short-lived run inside a GitHub Actions job, see
 * docs/deploy.md "Worker as a GitHub Actions tick"). Both register exactly these handlers with
 * `boss.work(name, options, handler)`, so a job added here is picked up by either runtime.
 */
export const REGISTRATIONS: Registration[] = [
  {
    name: "discover_business",
    options: { batchSize: 1, localConcurrency: 2 },
    handler: handleDiscoverBusiness,
  },
  {
    name: "generate_content_batch",
    options: { batchSize: 1, localConcurrency: 2 },
    handler: handleGenerateContentBatch,
  },
  { name: "run_analyst", options: { batchSize: 1, localConcurrency: 2 }, handler: handleRunAnalyst },
  {
    name: "run_product_advisor",
    options: { batchSize: 1, localConcurrency: 1 },
    handler: handleRunProductAdvisor,
  },
  {
    name: "publish_due_posts",
    options: { batchSize: 1, localConcurrency: 1 },
    handler: handlePublishDuePosts,
  },
  { name: "publish_post", options: { batchSize: 5, localConcurrency: 5 }, handler: handlePublishPost },
  { name: "fetch_insights", options: { batchSize: 1, localConcurrency: 2 }, handler: handleFetchInsights },
  { name: "refresh_tokens", options: { batchSize: 1, localConcurrency: 1 }, handler: handleRefreshTokens },
  {
    name: "sync_product_analytics",
    options: { batchSize: 1, localConcurrency: 1 },
    handler: handleSyncProductAnalytics,
  },
  {
    name: "provision_mailbox",
    options: { batchSize: 1, localConcurrency: 1 },
    handler: handleProvisionMailbox,
  },
  {
    name: "verify_mailbox_dns",
    options: { batchSize: 1, localConcurrency: 1 },
    handler: handleVerifyMailboxDns,
  },
  { name: "improve_app", options: { batchSize: 1, localConcurrency: 1 }, handler: handleImproveApp },
  {
    name: "run_analyst_all",
    options: { batchSize: 1, localConcurrency: 1 },
    handler: handleRunAnalystAll,
  },
  {
    name: "run_product_advisor_all",
    options: { batchSize: 1, localConcurrency: 1 },
    handler: handleRunProductAdvisorAll,
  },
  {
    name: "content_autopilot",
    options: { batchSize: 1, localConcurrency: 1 },
    handler: handleContentAutopilot,
  },
];
