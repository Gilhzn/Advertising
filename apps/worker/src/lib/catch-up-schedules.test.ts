import "../test-setup.js";

import { describe, expect, it, vi } from "vitest";

/**
 * The cron maths and the first-run grace window are pure enough to assert exactly with an injected `now`
 * and a fake `enqueue`; the `worker_state` round-trip is not, so it runs against the real local Postgres
 * (same DB every other worker test uses) under throwaway job names, cleaned up after each test.
 */
const { eq, getDb, inArray, workerState } = await import("@adv/db");
const { enqueueMissedSchedules, previousOccurrence, scheduleStateKey } = await import(
  "./catch-up-schedules.js"
);
const { SCHEDULES } = await import("@adv/jobs");

const db = getDb();

/** `JobName`s used as throwaway state keys - the fake `enqueue` means nothing is really sent. */
const MINUTELY = "publish_due_posts" as const;
const TWELVE_HOURLY = "refresh_tokens" as const;
const DAILY = "content_autopilot" as const;
const WEEKLY = "run_analyst_all" as const;

const ALL_KEYS = [MINUTELY, TWELVE_HOURLY, DAILY, WEEKLY].map(scheduleStateKey);

async function clearState(): Promise<void> {
  await db.delete(workerState).where(inArray(workerState.key, ALL_KEYS));
}

async function seedState(name: string, lastFiredAt: Date): Promise<void> {
  const key = scheduleStateKey(name as typeof MINUTELY);
  await db
    .insert(workerState)
    .values({ key, value: { lastFiredAt: lastFiredAt.toISOString() } })
    .onConflictDoUpdate({
      target: workerState.key,
      set: { value: { lastFiredAt: lastFiredAt.toISOString() } },
    });
}

async function readState(name: string): Promise<string | undefined> {
  const [row] = await db
    .select()
    .from(workerState)
    .where(eq(workerState.key, scheduleStateKey(name as typeof MINUTELY)));
  return (row?.value as { lastFiredAt?: string } | undefined)?.lastFiredAt;
}

describe("previousOccurrence", () => {
  it("returns the most recent UTC occurrence before `now`", () => {
    expect(previousOccurrence("* * * * *", new Date("2026-03-04T10:00:30Z")).toISOString()).toBe(
      "2026-03-04T10:00:00.000Z",
    );
    expect(previousOccurrence("0 4 * * *", new Date("2026-03-04T10:00:00Z")).toISOString()).toBe(
      "2026-03-04T04:00:00.000Z",
    );
    // Monday 05:00 seen from a Thursday -> that same week's Monday.
    expect(previousOccurrence("0 5 * * 1", new Date("2026-03-05T12:00:00Z")).toISOString()).toBe(
      "2026-03-02T05:00:00.000Z",
    );
  });

  it("is exclusive of `now` itself, leaving a boundary occurrence to the next tick", () => {
    expect(previousOccurrence("0 4 * * *", new Date("2026-03-04T04:00:00Z")).toISOString()).toBe(
      "2026-03-03T04:00:00.000Z",
    );
  });
});

describe("enqueueMissedSchedules", () => {
  const schedules = [
    { name: MINUTELY, cron: "* * * * *" },
    { name: TWELVE_HOURLY, cron: "15 */12 * * *" },
    { name: DAILY, cron: "0 4 * * *" },
    { name: WEEKLY, cron: "0 5 * * 1" },
  ];

  it("on a fresh database runs the heartbeat jobs and records, but does not burst, the weekly one", async () => {
    await clearState();
    try {
      const enqueue = vi.fn(async () => "job-id");
      // Thursday 12:00 UTC: the weekly Monday 05:00 occurrence is ~3 days old (outside the 24h grace),
      // the daily 04:00 one is 8h old (inside it).
      const now = new Date("2026-03-05T12:00:00Z");
      const results = await enqueueMissedSchedules({ now, schedules, db, enqueue });

      expect(Object.fromEntries(results.map((r) => [r.name, r.verdict]))).toEqual({
        [MINUTELY]: "first_run_due",
        [TWELVE_HOURLY]: "first_run_due",
        [DAILY]: "first_run_recent",
        [WEEKLY]: "first_run_skipped",
      });
      expect(enqueue.mock.calls.map((c) => c[0])).toEqual([MINUTELY, TWELVE_HOURLY, DAILY]);
      // empty payload + singletonKey = job name, so overlapping ticks cannot duplicate
      expect(enqueue.mock.calls[0]?.slice(1)).toEqual([{}, { singletonKey: MINUTELY }]);

      // Every schedule - including the skipped weekly one - now has its occurrence recorded.
      expect(await readState(MINUTELY)).toBe("2026-03-05T11:59:00.000Z");
      expect(await readState(DAILY)).toBe("2026-03-05T04:00:00.000Z");
      expect(await readState(WEEKLY)).toBe("2026-03-02T05:00:00.000Z");
    } finally {
      await clearState();
    }
  });

  it("enqueues only the schedules whose cron came due since the last tick", async () => {
    await clearState();
    try {
      const now = new Date("2026-03-05T12:00:00Z");
      await seedState(MINUTELY, new Date("2026-03-05T11:50:00Z")); // 10 minutes ago -> due
      await seedState(TWELVE_HOURLY, new Date("2026-03-05T00:15:00Z")); // its last occurrence -> up to date
      await seedState(DAILY, new Date("2026-03-05T04:00:00Z")); // today's run already done
      await seedState(WEEKLY, new Date("2026-02-23T05:00:00Z")); // a week behind -> due

      const enqueue = vi.fn(async () => "job-id");
      const results = await enqueueMissedSchedules({ now, schedules, db, enqueue });

      expect(Object.fromEntries(results.map((r) => [r.name, r.verdict]))).toEqual({
        [MINUTELY]: "due",
        [TWELVE_HOURLY]: "up_to_date",
        [DAILY]: "up_to_date",
        [WEEKLY]: "due",
      });
      expect(enqueue.mock.calls.map((c) => c[0])).toEqual([MINUTELY, WEEKLY]);
      expect(await readState(MINUTELY)).toBe("2026-03-05T11:59:00.000Z");
      expect(await readState(WEEKLY)).toBe("2026-03-02T05:00:00.000Z");
      // untouched
      expect(await readState(DAILY)).toBe("2026-03-05T04:00:00.000Z");
    } finally {
      await clearState();
    }
  });

  it("is idempotent for the same `now` (a second tick in the same minute enqueues nothing)", async () => {
    await clearState();
    try {
      const now = new Date("2026-03-05T12:00:30Z");
      const enqueue = vi.fn(async () => "job-id");
      await enqueueMissedSchedules({ now, schedules, db, enqueue });
      const firstPass = enqueue.mock.calls.length;
      expect(firstPass).toBeGreaterThan(0);

      enqueue.mockClear();
      const second = await enqueueMissedSchedules({ now, schedules, db, enqueue });
      expect(enqueue).not.toHaveBeenCalled();
      expect(second.every((r) => r.verdict === "up_to_date")).toBe(true);
    } finally {
      await clearState();
    }
  });

  it("defaults to the real SCHEDULES table", async () => {
    const enqueue = vi.fn(async () => "job-id");
    // `db` is still injected, but nothing is written: every entry is already up to date at this `now`.
    const now = new Date("2026-03-05T12:00:00Z");
    for (const { name } of SCHEDULES) await seedState(name, now);
    try {
      const results = await enqueueMissedSchedules({ now, db, enqueue });
      expect(results.map((r) => r.name)).toEqual(SCHEDULES.map((s) => s.name));
      expect(enqueue).not.toHaveBeenCalled();
    } finally {
      await db.delete(workerState).where(
        inArray(
          workerState.key,
          SCHEDULES.map((s) => scheduleStateKey(s.name)),
        ),
      );
    }
  });
});
