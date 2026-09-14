import { getDb, sql } from "@adv/db";
import { enqueue, type JobPayload } from "@adv/jobs";
import { logger } from "@adv/shared";
import type { Job } from "pg-boss";

const CLAIM_LIMIT = 50;

/**
 * Claims up to 50 due posts (`status IN ('approved','scheduled')` and `scheduledAt <= now()`) by
 * atomically flipping them to `publishing` (`UPDATE ... WHERE status IN (...) RETURNING`, guarded with
 * `FOR UPDATE SKIP LOCKED` so two concurrent runs never double-claim the same row), then enqueues one
 * `publish_post` job per claimed post with `singletonKey = postId` so re-running this scheduler tick
 * cannot enqueue the same post twice. Each claim mints a single-use `claim_token` that the payload
 * carries and `publish_post` consumes, so a retry of that job cannot reuse the claim.
 *
 * Rows stranded in `publishing` by a crashed worker are re-claimed once their lease goes stale.
 */
export async function handlePublishDuePosts(jobs: Job<JobPayload<"publish_due_posts">>[]): Promise<void> {
  for (const job of jobs) {
    const log = logger.child({ jobId: job.id, jobName: "publish_due_posts" });
    const db = getDb();

    const claimed = (await db.execute(sql`
      UPDATE posts
      SET status = 'publishing', updated_at = now(), claim_token = gen_random_uuid()
      WHERE id IN (
        SELECT id FROM posts
        WHERE (
          (status IN ('approved', 'scheduled') AND scheduled_at <= now())
          -- Rows a dead worker left behind: publish_post's own stale-lease takeover only helps when
          -- pg-boss still has the job, so once its retries are exhausted the post is stuck in
          -- the publishing state forever. Re-claiming a stale lease here is the recovery path.
          OR (status = 'publishing' AND updated_at < now() - interval '15 minutes')
        )
        ORDER BY scheduled_at ASC
        LIMIT ${CLAIM_LIMIT}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, claim_token
    `)) as unknown as Array<{ id: string; claim_token: string }>;

    log.info({ claimed: claimed.length }, "publish_due_posts: claimed posts");

    for (const row of claimed) {
      await enqueue(
        "publish_post",
        { postId: row.id, claimedBy: "scheduler", claimToken: row.claim_token },
        { singletonKey: row.id },
      );
    }
  }
}
