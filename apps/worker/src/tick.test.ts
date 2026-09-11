import "./test-setup.js";

process.env.PGBOSS_SCHEDULE = "off";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Drives the real `tick.ts` against the local Postgres: real pg-boss (queues created, a real job fetched
 * by a real `boss.work` worker), but a stubbed registration table so no marketing/LLM handler can run -
 * the point here is the tick *lifecycle* (catch up, drain, exit), and a handler that talked to a platform
 * API or the Agent SDK would make this test non-deterministic.
 *
 * `worker_state` is pre-seeded up to date for every `SCHEDULES` entry so the catch-up step enqueues
 * nothing: what the catch-up step does on its own is covered by `lib/catch-up-schedules.test.ts`.
 */
const handled: Array<{ id: string }> = [];

vi.mock("./registrations.js", () => ({
  REGISTRATIONS: [
    {
      name: "publish_due_posts",
      options: { batchSize: 1, localConcurrency: 1 },
      handler: async (jobs: Array<{ id: string }>) => {
        handled.push(...jobs);
      },
    },
  ],
}));

const { getDb, inArray, workerState } = await import("@adv/db");
const { enqueue, getBoss, JOBS, SCHEDULES, stopBoss } = await import("@adv/jobs");
const { scheduleStateKey } = await import("./lib/catch-up-schedules.js");
const { runTick } = await import("./tick.js");

const db = getDb();
const SCHEDULE_KEYS = SCHEDULES.map((s) => scheduleStateKey(s.name));

async function markAllSchedulesUpToDate(): Promise<void> {
  // Far enough in the future that no cron occurrence can be "newer" during the test run.
  const lastFiredAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  for (const key of SCHEDULE_KEYS) {
    await db
      .insert(workerState)
      .values({ key, value: { lastFiredAt } })
      .onConflictDoUpdate({ target: workerState.key, set: { value: { lastFiredAt } } });
  }
}

/** The local dev DB can carry queued jobs from an earlier `pnpm dev` session - start from a clean queue. */
async function clearQueue(): Promise<void> {
  const boss = await getBoss();
  // Other suites (e2e chain, publish tests) leave jobs behind in every queue; a tick would work them.
  for (const name of Object.keys(JOBS)) {
    await boss.createQueue(name).catch(() => undefined);
    await boss.deleteAllJobs(name);
  }
}

beforeEach(async () => {
  handled.length = 0;
  await markAllSchedulesUpToDate();
  await clearQueue();
  await stopBoss({ graceful: false });
});

afterEach(async () => {
  delete process.env.TICK_MAX_MINUTES;
  await clearQueue();
  await stopBoss({ graceful: false });
});

afterAll(async () => {
  await db.delete(workerState).where(inArray(workerState.key, SCHEDULE_KEYS));
});

describe("runTick", () => {
  it("exits on its wall-clock cap when there is nothing to do", async () => {
    process.env.TICK_MAX_MINUTES = "0.05"; // 3 seconds
    const startedAt = Date.now();
    const summary = await runTick();

    expect(summary.exitReason).toBe("max_minutes"); // 3s is shorter than the 30s idle threshold
    expect(summary.scheduled).toEqual([]);
    expect(summary.processed).toEqual({});
    expect(summary.failed).toEqual({});
    expect(summary.remaining).toBe(0);
    expect(Date.now() - startedAt).toBeLessThan(15_000);
    expect(handled).toHaveLength(0);
  });

  it("runs a queued job's handler and then exits once the queues stay empty", async () => {
    const jobId = await enqueue("publish_due_posts", {}, { retryLimit: 0 });
    expect(jobId).toBeTruthy();

    const summary = await runTick({ maxMinutes: 0.5, pollMs: 250, idleMs: 750 });

    expect(handled.map((j) => j.id)).toEqual([jobId]);
    expect(summary.processed).toEqual({ publish_due_posts: 1 });
    expect(summary.failed).toEqual({});
    expect(summary.exitReason).toBe("drained");
    expect(summary.remaining).toBe(0);
  });
});
