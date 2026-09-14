import { PgBoss } from "pg-boss";

type SendOptions = NonNullable<Parameters<PgBoss["send"]>[2]>;

import { z } from "zod";

/** Job contracts shared by apps/web (enqueue) and apps/worker (handle). */
export const JOBS = {
  discover_business: z.object({
    businessId: z.string().uuid(),
    reason: z.enum(["initial", "replan", "manual"]).default("initial"),
  }),
  generate_content_batch: z.object({
    businessId: z.string().uuid(),
    days: z.number().int().min(1).max(30).default(7),
    platforms: z.array(z.string()).optional(),
  }),
  publish_post: z.object({
    postId: z.string().uuid(),
    /** set by publish_due_posts, which already flipped the row to `publishing` (its atomic claim) */
    claimedBy: z.enum(["scheduler"]).optional(),
    /** Single-use proof of the scheduler's claim; consumed by publish_post so retries re-claim. */
    claimToken: z.string().uuid().optional(),
  }),
  publish_due_posts: z.object({}),
  fetch_insights: z.object({ businessId: z.string().uuid().optional() }),
  sync_product_analytics: z.object({ businessId: z.string().uuid().optional() }),
  run_analyst: z.object({ businessId: z.string().uuid() }),
  run_product_advisor: z.object({ businessId: z.string().uuid() }),
  provision_mailbox: z.object({
    businessId: z.string().uuid(),
    localPart: z.string().default("hello"),
    forwardTo: z.string().email().optional(),
    /** Overrides `EMAIL_PROVIDER` env when set. */
    provider: z.enum(["cloudflare_routing", "migadu"]).optional(),
  }),
  verify_mailbox_dns: z.object({ mailboxId: z.string().uuid() }),
  refresh_tokens: z.object({}),
  improve_app: z.object({ businessId: z.string().uuid(), recommendationId: z.string().uuid() }),
  run_analyst_all: z.object({}),
  run_product_advisor_all: z.object({}),
  content_autopilot: z.object({}),
} as const;

export type JobName = keyof typeof JOBS;
export type JobPayload<N extends JobName> = z.infer<(typeof JOBS)[N]>;

/** Recurring schedules registered by the worker (cron in UTC). */
export const SCHEDULES: Array<{ name: JobName; cron: string }> = [
  { name: "publish_due_posts", cron: "* * * * *" },
  { name: "fetch_insights", cron: "0 */6 * * *" },
  { name: "sync_product_analytics", cron: "30 3 * * *" },
  { name: "refresh_tokens", cron: "15 */12 * * *" },
  { name: "content_autopilot", cron: "0 4 * * *" },
  { name: "run_analyst_all", cron: "0 5 * * 1" },
  { name: "run_product_advisor_all", cron: "30 5 * * 1" },
];

let boss: PgBoss | undefined;

export async function getBoss(connectionString = process.env.DATABASE_URL): Promise<PgBoss> {
  if (boss) return boss;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  // PGBOSS_SCHEDULE=off disables pg-boss's cron supervisor (tick mode owns scheduling via worker_state).
  boss = new PgBoss({ connectionString, schema: "pgboss", schedule: process.env.PGBOSS_SCHEDULE !== "off" });
  boss.on("error", (err: unknown) => console.error("[pg-boss]", err));
  await boss.start();
  return boss;
}

export async function enqueue<N extends JobName>(
  name: N,
  payload: JobPayload<N>,
  opts: SendOptions = {},
): Promise<string | null> {
  const schema = JOBS[name] as z.ZodTypeAny;
  const data = schema.parse(payload) as object;
  const b = await getBoss();
  await b.createQueue(name).catch(() => undefined);
  return b.send(name, data, { retryLimit: 3, retryBackoff: true, ...opts });
}

/**
 * Stops the shared pg-boss instance and clears the cached singleton (a later `getBoss()` starts a fresh
 * one). `graceful` (default `true`) lets in-flight jobs finish before the pool closes - the short-lived
 * tick runtime (`apps/worker/src/tick.ts`) passes it explicitly alongside a `timeout` so a run that hit
 * its wall-clock cap still gives active handlers a bounded chance to complete instead of being killed
 * mid-side-effect.
 */
export async function stopBoss(options: { graceful?: boolean; timeout?: number } = {}): Promise<void> {
  if (boss) {
    const { graceful = true, timeout } = options;
    await boss.stop(timeout === undefined ? { graceful } : { graceful, timeout });
    boss = undefined;
  }
}
