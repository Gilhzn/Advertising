import { eq, getDb, workerState } from "@adv/db";
import { type JobName, enqueue as realEnqueue, SCHEDULES } from "@adv/jobs";
import { logger } from "@adv/shared";
import { CronExpressionParser } from "cron-parser";

/**
 * Cron catch-up for the short-lived "tick" runtime (`apps/worker/src/tick.ts`).
 *
 * The always-on worker (`main.ts`) registers `boss.schedule(...)` and pg-boss's own clock fires the
 * crons while that process lives. A tick process lives for a couple of minutes every 10 minutes, so it
 * has no clock at all: instead it asks, for each entry in `SCHEDULES`, "when should this last have
 * fired?" and compares that to what the previous tick recorded in `worker_state`
 * (`schedule:<job name>` -> `{ lastFiredAt }`). Anything that came due in between is enqueued exactly
 * once, which makes a chain of ticks behave like a process that had been running continuously.
 */

/** One `worker_state` row's value for a `schedule:<name>` key. */
export interface ScheduleState {
  /** ISO timestamp of the cron occurrence this schedule was last enqueued for. */
  lastFiredAt: string;
}

/** Minimal shape of `SCHEDULES` entries, so tests can inject their own cron table. */
export interface ScheduleEntry {
  name: JobName;
  cron: string;
}

/** Why a schedule was (or was not) enqueued - surfaced in the tick's boot log. */
export type CatchUpVerdict =
  | "due" // the cron fired since `lastFiredAt`
  | "first_run_due" // no state yet, and this schedule always catches up on a fresh install
  | "first_run_recent" // no state yet, but the last occurrence is within 24h, so run it
  | "first_run_skipped" // no state yet and the last occurrence is older than 24h: record, do not run
  | "up_to_date"; // already enqueued for this occurrence

export interface CatchUpResult {
  name: JobName;
  /** The most recent cron occurrence at or before `now`. */
  prev: Date;
  /** What the previous tick had recorded, if any. */
  lastFiredAt?: Date;
  verdict: CatchUpVerdict;
  enqueued: boolean;
}

export interface EnqueueMissedSchedulesOptions {
  /** Injected in tests; defaults to the real wall clock. */
  now?: Date;
  schedules?: readonly ScheduleEntry[];
  /** Drizzle db handle (the real one by default) - only ever touches `worker_state`. */
  db?: Pick<ReturnType<typeof getDb>, "select" | "insert">;
  /** Injected in tests; defaults to `@adv/jobs`'s `enqueue`. */
  enqueue?: (name: JobName, payload: object, opts: { singletonKey: string }) => Promise<unknown>;
}

/**
 * Schedules that must always run on the very first tick against a fresh database: they are cheap, they
 * are the heartbeat of the system, and skipping them would mean a freshly installed deployment publishes
 * nothing and refreshes no tokens until their next cron occurrence.
 */
const FIRST_RUN_ALWAYS_DUE: ReadonlySet<JobName> = new Set<JobName>(["publish_due_posts", "refresh_tokens"]);

/** On a fresh install, a daily/weekly schedule only catches up if its last occurrence is this recent. */
const FIRST_RUN_GRACE_MS = 24 * 60 * 60 * 1000;

export function scheduleStateKey(name: JobName): string {
  return `schedule:${name}`;
}

/**
 * Most recent moment `cron` should have fired, at or before `now`.
 *
 * `cron-parser`'s `prev()` is exclusive of `now` itself (an occurrence landing exactly on `now` is
 * reported as the *next* one), which is what we want here: a tick that starts exactly on a cron boundary
 * leaves that occurrence to the following tick rather than racing the boundary.
 */
export function previousOccurrence(cron: string, now: Date): Date {
  return CronExpressionParser.parse(cron, { tz: "UTC", currentDate: now }).prev().toDate();
}

async function readState(
  db: NonNullable<EnqueueMissedSchedulesOptions["db"]>,
  key: string,
): Promise<Date | undefined> {
  const [row] = await db.select().from(workerState).where(eq(workerState.key, key)).limit(1);
  const raw = (row?.value as ScheduleState | undefined)?.lastFiredAt;
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

async function writeState(
  db: NonNullable<EnqueueMissedSchedulesOptions["db"]>,
  key: string,
  firedAt: Date,
): Promise<void> {
  // `worker_state.value` is a generic jsonb bag (`Record<string, unknown>`); `satisfies` keeps this
  // writer honest about the shape `readState` expects back.
  const value: Record<string, unknown> = { lastFiredAt: firedAt.toISOString() } satisfies ScheduleState;
  await db
    .insert(workerState)
    .values({ key, value })
    .onConflictDoUpdate({ target: workerState.key, set: { value, updatedAt: new Date() } });
}

/**
 * Enqueues every schedule whose cron came due since the last tick recorded it, and records the occurrence
 * it enqueued for. Idempotent per occurrence: running this twice for the same `now` enqueues nothing the
 * second time, and each job is sent with `singletonKey = <job name>` so an overlapping tick (or a
 * still-queued job from the previous one) cannot produce a duplicate either.
 */
export async function enqueueMissedSchedules(
  options: EnqueueMissedSchedulesOptions = {},
): Promise<CatchUpResult[]> {
  const {
    now = new Date(),
    schedules = SCHEDULES,
    db = getDb(),
    enqueue = (name: JobName, payload: object, opts: { singletonKey: string }) =>
      // biome-ignore lint/suspicious/noExplicitAny: every catch-up schedule takes an empty payload; `enqueue`'s per-job generic cannot see that through `JobName`.
      realEnqueue(name, payload as any, opts),
  } = options;

  const results: CatchUpResult[] = [];

  for (const { name, cron } of schedules) {
    const prev = previousOccurrence(cron, now);
    const key = scheduleStateKey(name);
    const lastFiredAt = await readState(db, key);

    let verdict: CatchUpVerdict;
    if (lastFiredAt === undefined) {
      if (FIRST_RUN_ALWAYS_DUE.has(name)) verdict = "first_run_due";
      else if (now.getTime() - prev.getTime() <= FIRST_RUN_GRACE_MS) verdict = "first_run_recent";
      else verdict = "first_run_skipped";
    } else {
      verdict = prev.getTime() > lastFiredAt.getTime() ? "due" : "up_to_date";
    }

    const enqueued = verdict !== "up_to_date" && verdict !== "first_run_skipped";
    if (enqueued) await enqueue(name, {}, { singletonKey: name });
    // `first_run_skipped` still records `prev`: that is the whole point of the grace window - a fresh
    // install must not burst every weekly job at once, but the *next* occurrence must still be caught.
    if (verdict !== "up_to_date") await writeState(db, key, prev);

    results.push({ name, prev, lastFiredAt, verdict, enqueued });
  }

  const enqueuedNames = results.filter((r) => r.enqueued).map((r) => r.name);
  logger.info(
    {
      now: now.toISOString(),
      enqueued: enqueuedNames,
      verdicts: Object.fromEntries(results.map((r) => [r.name, r.verdict])),
    },
    "worker tick: schedule catch-up complete",
  );
  return results;
}
