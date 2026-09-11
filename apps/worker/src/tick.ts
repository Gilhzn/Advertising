import { pathToFileURL } from "node:url";
import { loadWorkerEnv } from "./load-env.js";

// Must be set before the first getBoss(): in tick mode the catch-up step is the only scheduler.
process.env.PGBOSS_SCHEDULE = "off";

// Same dev-only repo-root .env load as `main.ts` (GitHub Actions sets NODE_ENV=production and real env
// vars): @adv/db and @adv/jobs read `process.env` lazily inside function calls, so import hoisting above
// this line cannot race it.
loadWorkerEnv();

import { getBoss, JOBS, type JobName, SCHEDULES, stopBoss } from "@adv/jobs";
import { logger } from "@adv/shared";
import { registerAllConnectors } from "./connectors-shim.js";
import { enqueueMissedSchedules } from "./lib/catch-up-schedules.js";
import { REGISTRATIONS } from "./registrations.js";

/**
 * Short-lived worker runtime: does one pass of work and exits, so the worker can live in a GitHub Actions
 * job that runs every 10 minutes instead of an always-on container (see docs/deploy.md, "Worker as a
 * GitHub Actions tick"). The difference from `main.ts` is deliberately narrow:
 *
 * - no HTTP `/health` server (nothing would poll it),
 * - no `boss.schedule(...)`: pg-boss's cron clock only ticks while a process is alive, which this one is
 *   not, so `enqueueMissedSchedules` reconstructs the missed occurrences from `worker_state` instead,
 * - it drains the queues, then exits, instead of waiting for SIGTERM.
 *
 * Registering no schedules is also forward-compatible with a database that an always-on worker used
 * before: leftover `pgboss.schedule` rows are inert unless some process is running pg-boss's timekeeper.
 */

const DEFAULT_MAX_MINUTES = 20;
/** How often the drain loop asks pg-boss how much work is left. */
const DEFAULT_POLL_MS = 5_000;
/** How long the queues must stay empty before we call the tick done. */
const DEFAULT_IDLE_MS = 30_000;
/** Grace period handed to pg-boss's graceful stop for jobs still running when we exit. */
const STOP_TIMEOUT_MS = 30_000;

export type TickExitReason = "drained" | "max_minutes";

export interface TickSummary {
  exitReason: TickExitReason;
  durationMs: number;
  /** Jobs whose handler ran to completion during this tick, by job name. */
  processed: Record<string, number>;
  /** Jobs whose handler threw during this tick (pg-boss will retry them), by job name. */
  failed: Record<string, number>;
  /** Schedules this tick enqueued because their cron came due while nothing was running. */
  scheduled: JobName[];
  /** Runnable + active jobs left behind (non-zero only when `exitReason` is `max_minutes`). */
  remaining: number;
  /** Jobs deliberately left for a later tick: retry backoff / `startAfter` in the future. */
  deferred: number;
}

export interface RunTickOptions {
  /** Wall-clock cap; default `TICK_MAX_MINUTES` env, else 20. */
  maxMinutes?: number;
  /** Drain-loop poll interval; default `TICK_POLL_MS` env, else 5s. */
  pollMs?: number;
  /** Consecutive idle time required before exiting; default `TICK_IDLE_MS` env, else 30s. */
  idleMs?: number;
}

const QUEUE_NAMES = Object.keys(JOBS) as JobName[];

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Work left in our queues right now.
 *
 * `readyCount` is pg-boss's runnable backlog (`queuedCount` minus future-dated jobs) and `activeCount` is
 * what handlers are holding. Deferred jobs are reported separately and never hold the tick open: a job
 * waiting on retry backoff or an explicit `startAfter` (e.g. `verify_mailbox_dns` re-enqueueing itself 10
 * minutes out) is exactly what the *next* tick is for.
 */
async function countWork(
  boss: Awaited<ReturnType<typeof getBoss>>,
): Promise<{ outstanding: number; deferred: number }> {
  const queues = await boss.getQueues(QUEUE_NAMES);
  let outstanding = 0;
  let deferred = 0;
  for (const q of queues) {
    outstanding += q.readyCount + q.activeCount;
    deferred += q.deferredCount;
  }
  return { outstanding, deferred };
}

/**
 * Boots pg-boss, catches up missed crons, drains the queues and stops. Resolves with a summary; throws
 * only on a boot failure (the caller turns that into a non-zero exit).
 */
export async function runTick(options: RunTickOptions = {}): Promise<TickSummary> {
  const startedAt = Date.now();
  const maxMinutes = options.maxMinutes ?? envNumber("TICK_MAX_MINUTES", DEFAULT_MAX_MINUTES);
  const pollMs = options.pollMs ?? envNumber("TICK_POLL_MS", DEFAULT_POLL_MS);
  const idleMs = options.idleMs ?? envNumber("TICK_IDLE_MS", DEFAULT_IDLE_MS);
  const deadline = startedAt + maxMinutes * 60_000;

  logger.info({ maxMinutes, pollMs, idleMs }, "worker tick: booting");

  await registerAllConnectors();
  const boss = await getBoss();
  for (const name of QUEUE_NAMES) await boss.createQueue(name);
  // A previous always-on worker may have left cron schedules in pg-boss; in tick mode the catch-up
  // step below is the only scheduler, otherwise a schedule could fire twice inside one tick.
  for (const { name } of SCHEDULES) await boss.unschedule(name).catch(() => undefined);
  logger.info({ queues: QUEUE_NAMES.length }, "worker tick: pg-boss started, queues ensured");

  const catchUp = await enqueueMissedSchedules();
  const scheduled = catchUp.filter((r) => r.enqueued).map((r) => r.name);

  const processed: Record<string, number> = {};
  const failed: Record<string, number> = {};
  for (const { name, options: workOptions, handler } of REGISTRATIONS) {
    // Counting here rather than from `pgboss.job` keeps the summary exact without a second query: this is
    // the only place a handler can finish, and a throw is what pg-boss turns into a retry.
    // biome-ignore lint/suspicious/noExplicitAny: mirrors `Registration.handler` - see registrations.ts.
    await boss.work(name, workOptions, async (jobs: any[]) => {
      try {
        await handler(jobs);
        processed[name] = (processed[name] ?? 0) + jobs.length;
      } catch (err) {
        failed[name] = (failed[name] ?? 0) + jobs.length;
        throw err;
      }
    });
  }
  logger.info({ jobs: REGISTRATIONS.length }, "worker tick: job handlers registered, draining");

  let exitReason: TickExitReason = "max_minutes";
  let idleSince: number | undefined;
  let last = { outstanding: 0, deferred: 0 };

  while (Date.now() < deadline) {
    last = await countWork(boss);
    if (last.outstanding === 0) {
      idleSince ??= Date.now();
      if (Date.now() - idleSince >= idleMs) {
        exitReason = "drained";
        break;
      }
    } else {
      idleSince = undefined;
    }
    // Never sleep past the deadline: a tiny `TICK_MAX_MINUTES` (tests, a manual smoke run) must still
    // return promptly rather than block for a whole poll interval.
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(pollMs, remainingMs));
  }

  const durationMs = Date.now() - startedAt;
  const summary: TickSummary = {
    exitReason,
    durationMs,
    processed,
    failed,
    scheduled,
    remaining: exitReason === "drained" ? 0 : last.outstanding,
    deferred: last.deferred,
  };

  // Graceful either way: on a `drained` exit nothing is in flight so it costs nothing, and on a
  // `max_minutes` exit killing a handler mid-publish could leave a platform side effect with no DB row -
  // a bounded wait is much cheaper than that. Whatever is still queued is the next tick's problem.
  await stopBoss({ graceful: true, timeout: STOP_TIMEOUT_MS });

  logger.info(summary, `worker tick: done (${exitReason}) in ${Math.round(durationMs / 1000)}s`);
  if (summary.remaining > 0) {
    logger.warn(
      { remaining: summary.remaining, deferred: summary.deferred },
      "worker tick: hit the time cap with jobs still queued - the next tick picks them up",
    );
  }
  return summary;
}

/** Only run when executed directly (`pnpm tick`, `node dist/tick.js`), never when imported by a test. */
const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (entry === import.meta.url) {
  runTick()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      logger.error({ err }, "worker tick: fatal error");
      // Best effort: a boot failure may have left pg-boss half-started.
      stopBoss({ graceful: false }).finally(() => process.exit(1));
    });
}
