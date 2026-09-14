import { createServer } from "node:http";
import { loadWorkerEnv } from "./load-env.js";

// Load the repo root .env in dev (Railway/production sets real env vars directly). Safe to run before
// the imports below settle: @adv/db and @adv/jobs both read `process.env.DATABASE_URL` lazily inside
// function calls, never at module-evaluation time, so import hoisting cannot race this.
loadWorkerEnv();

import { getBoss, JOBS, type JobName, SCHEDULES, stopBoss } from "@adv/jobs";
import { logger } from "@adv/shared";
import { registerAllConnectors } from "./connectors-shim.js";
import { checkHealth } from "./lib/health.js";
import { REGISTRATIONS } from "./registrations.js";

const PORT = Number(process.env.PORT ?? 3001);

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

  // PGBOSS_SCHEDULE=off disables pg-boss's cron supervisor. That is correct for the tick runtime,
  // which drives schedules itself - but in the always-on worker it meant `boss.schedule` rows landed
  // and never fired, while this still logged "schedules registered" and /health stayed green.
  // Publishing, insights, token refresh and autopilot would all stop, silently. Fail loudly instead.
  if (process.env.PGBOSS_SCHEDULE === "off") {
    throw new Error(
      "PGBOSS_SCHEDULE=off is only valid for the tick runtime (src/tick.ts). The always-on worker " +
        "needs pg-boss's scheduler; with it off, no cron job would ever run.",
    );
  }
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
