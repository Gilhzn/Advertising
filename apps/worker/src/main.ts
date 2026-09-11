import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Load the repo root .env in dev (Railway/production sets real env vars directly). Safe to run before
// the imports below settle: @adv/db and @adv/jobs both read `process.env.DATABASE_URL` lazily inside
// function calls, never at module-evaluation time, so import hoisting cannot race this.
if (process.env.NODE_ENV !== "production") {
  const here = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.resolve(here, "../../../.env") });
}

import { getBoss, JOBS, type JobName, SCHEDULES, stopBoss } from "@adv/jobs";
import { logger } from "@adv/shared";
import type { WorkOptions } from "pg-boss";
import { registerAllConnectors } from "./connectors-shim.js";
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
import { checkHealth } from "./lib/health.js";

const PORT = Number(process.env.PORT ?? 3001);

/** Registered handler + `work()` options for every job in the `JOBS` contract. */
// biome-ignore lint/suspicious/noExplicitAny: handlers are individually typed at their own call sites; this map only threads them through boss.work.
type Registration = { name: JobName; options: WorkOptions; handler: (jobs: any[]) => Promise<void> };

const REGISTRATIONS: Registration[] = [
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

async function main(): Promise<void> {
  logger.info("worker: booting");

  await registerAllConnectors();
  logger.info("worker: connectors registered");

  const boss = await getBoss();
  logger.info("worker: pg-boss started");

  for (const name of Object.keys(JOBS) as JobName[]) {
    await boss.createQueue(name);
  }
  logger.info({ queues: Object.keys(JOBS) }, "worker: queues ensured");

  for (const { name, cron } of SCHEDULES) {
    await boss.schedule(name, cron, {}, { tz: "UTC" });
  }
  logger.info({ schedules: SCHEDULES }, "worker: schedules registered");

  for (const { name, options, handler } of REGISTRATIONS) {
    await boss.work(name, options, handler);
  }
  logger.info({ jobs: REGISTRATIONS.map((r) => r.name) }, "worker: job handlers registered, worker is live");

  const server = createServer((req, res) => {
    if (req.url === "/health") {
      checkHealth()
        .then((report) => {
          res.writeHead(report.ok ? 200 : 503, { "content-type": "application/json" });
          res.end(JSON.stringify(report));
        })
        .catch((err: unknown) => {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: (err as Error).message }));
        });
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  logger.info({ port: PORT }, "worker: http server listening");

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "worker: shutting down");
    server.close();
    stopBoss()
      .then(() => {
        logger.info("worker: pg-boss stopped, exiting");
        process.exit(0);
      })
      .catch((err: unknown) => {
        logger.error({ err }, "worker: error during shutdown");
        process.exit(1);
      });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err: unknown) => {
  logger.error({ err }, "worker: fatal startup error");
  process.exit(1);
});
