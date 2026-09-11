import {
  and,
  businesses,
  channelPlans,
  eq,
  getDb,
  gte,
  inArray,
  lte,
  platformAccounts,
  posts,
  sql,
} from "@adv/db";
import { enqueue, type JobPayload } from "@adv/jobs";
import { logger } from "@adv/shared";
import type { Job } from "pg-boss";

const LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_SCHEDULED = 3;
/** Statuses that count as "on the calendar" for the next 7 days - draft/rejected/failed do not. */
const COUNTED_STATUSES = ["scheduled", "approved", "publishing", "published"] as const;

/**
 * Daily fan-out (cron: 04:00 UTC, see `SCHEDULES.content_autopilot`): for every business with an
 * approved channel plan and at least one connected account, enqueues `generate_content_batch` when
 * fewer than `MIN_SCHEDULED` posts are already on the calendar for the next 7 days. Uses
 * `singletonKey = businessId` so a slow-running batch from a previous day is never duplicated while
 * still in flight.
 */
export async function handleContentAutopilot(jobs: Job<JobPayload<"content_autopilot">>[]): Promise<void> {
  for (const job of jobs) {
    const log = logger.child({ jobId: job.id, jobName: "content_autopilot" });
    const db = getDb();

    const eligible = await db
      .selectDistinct({ businessId: businesses.id })
      .from(businesses)
      .innerJoin(
        channelPlans,
        and(eq(channelPlans.businessId, businesses.id), sql`${channelPlans.approvedAt} is not null`),
      )
      .innerJoin(
        platformAccounts,
        and(eq(platformAccounts.businessId, businesses.id), eq(platformAccounts.status, "connected")),
      );

    log.info({ candidates: eligible.length }, "content_autopilot: scanning eligible businesses");

    const now = new Date();
    const weekAhead = new Date(now.getTime() + LOOKAHEAD_MS);

    for (const { businessId } of eligible) {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(posts)
        .where(
          and(
            eq(posts.businessId, businessId),
            inArray(posts.status, COUNTED_STATUSES),
            gte(posts.scheduledAt, now),
            lte(posts.scheduledAt, weekAhead),
          ),
        );
      const scheduledCount = row?.count ?? 0;
      if (scheduledCount >= MIN_SCHEDULED) continue;

      log.info(
        { businessId, scheduledCount },
        "content_autopilot: below cadence threshold, enqueueing generate_content_batch",
      );
      await enqueue("generate_content_batch", { businessId, days: 7 }, { singletonKey: businessId });
    }
  }
}
