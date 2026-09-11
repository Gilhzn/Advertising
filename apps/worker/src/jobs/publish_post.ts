import type { Connector, PublishablePost } from "@adv/connectors";
import { ConnectorError, resolveConnector } from "@adv/connectors";
import { type Db, eq, getDb, posts, sql } from "@adv/db";
import { enqueue, JOBS, type JobPayload } from "@adv/jobs";
import { logger, redactSecrets } from "@adv/shared";
import type { Job } from "pg-boss";
import { isExpiringSoon, loadAccount, refreshAccountTokens } from "../lib/accounts.js";
import { writeAudit } from "../lib/audit.js";
import { getRateLimiter } from "../lib/limiter.js";

/** Statuses a post may be in when this handler is allowed to actually publish it. */
const PUBLISHABLE_STATUSES = new Set(["approved", "scheduled", "publishing"]);

/**
 * How long a `publishing` row may sit untouched before another worker may steal the claim.
 * A crashed/killed worker would otherwise strand the post in `publishing` forever.
 */
const STALE_LEASE = "10 minutes";

/**
 * `db.execute()` returns postgres.js's result, which is an array of rows (older/other drivers return
 * `{ rows }`). Normalised here so the claim logic does not depend on the driver shape.
 * Covered by "claims a post exactly once" in `publish_post.test.ts`.
 */
function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

/**
 * Publishes one post. Idempotent (skips if `externalId` is already set), refuses posts that never
 * went through approval (required for every community post per CLAUDE.md, enforced here for owned
 * posts too), refreshes an expiring token before publishing, and honors the connector's rate limit by
 * re-enqueueing with `startAfter` instead of blocking the worker.
 *
 * Concurrency: exactly one worker publishes a post. The atomic claim below flips the row to
 * `publishing` and only the worker whose UPDATE returned a row proceeds; a `publishing` row whose
 * `updated_at` is older than `STALE_LEASE` is considered abandoned and may be re-claimed. The claim
 * is taken as late as possible (after the rate-limit check) and released again on a retryable
 * failure, so a lease is never held by a job that is not actively publishing.
 */
export async function handlePublishPost(jobs: Job<JobPayload<"publish_post">>[]): Promise<void> {
  for (const job of jobs) {
    const { postId } = JOBS.publish_post.parse(job.data);
    const log = logger.child({ jobId: job.id, jobName: "publish_post", postId });
    const db = getDb();

    const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
    if (!post) {
      log.error("publish_post: post not found, nothing to do");
      return;
    }

    if (post.status === "published" && post.externalId) {
      log.info({ externalId: post.externalId }, "publish_post: already published, skipping");
      return;
    }

    if (!PUBLISHABLE_STATUSES.has(post.status)) {
      const reason = post.communityId
        ? `community post requires human approval before publishing (status: ${post.status})`
        : `post is not approved/scheduled for publishing (status: ${post.status})`;
      await failPost(db, postId, reason);
      await writeAudit(post.businessId, "system", "publish_post.refused", { postId, reason });
      log.warn({ reason }, "publish_post: refused");
      return;
    }

    // A post aimed at a community we do not own must carry a recorded human approval, not merely an
    // `approved` status a job could have set. No retry: only a human can fix this.
    if (post.communityId && !post.approvedBy) {
      const reason = "community post has no recorded human approval (approved_by is null)";
      await failPost(db, postId, reason);
      await writeAudit(post.businessId, "system", "publish_post.refused", {
        postId,
        communityId: post.communityId,
        reason,
      });
      log.warn({ reason }, "publish_post: refused");
      return;
    }

    if (!post.accountId) {
      const reason = "post has no accountId";
      await failPost(db, postId, reason);
      await writeAudit(post.businessId, "system", "publish_post.failed", { postId, error: reason });
      log.error("publish_post: no accountId on post");
      return;
    }

    const account = await loadAccount(post.accountId);
    if (account?.status !== "connected") {
      const reason = account ? `account is not connected (status: ${account.status})` : "account not found";
      await failPost(db, postId, reason);
      await writeAudit(post.businessId, "system", "publish_post.failed", {
        postId,
        accountId: post.accountId,
        error: reason,
      });
      log.warn({ reason }, "publish_post: refused");
      return;
    }

    let connector: Connector;
    try {
      connector = resolveConnector(account.platform, account);
    } catch (err) {
      const reason = (err as Error).message;
      await failPost(db, postId, reason);
      await writeAudit(post.businessId, "system", "publish_post.failed", { postId, error: reason });
      log.error({ err }, "publish_post: no connector registered for platform");
      return;
    }

    if (
      account.tokens &&
      isExpiringSoon(account.tokens) &&
      (connector.refresh || connector.refreshForAccount)
    ) {
      try {
        const refreshed = await refreshAccountTokens(connector, account);
        if (refreshed) account.tokens = refreshed;
      } catch (err) {
        log.error({ err }, "publish_post: token refresh failed, continuing with existing token");
      }
    }

    const limiter = await getRateLimiter();
    const waitMs = limiter.acquire(account.id, connector.rateLimit);
    if (waitMs > 0) {
      log.info({ waitMs }, "publish_post: rate limited, re-enqueueing");
      await enqueue(
        "publish_post",
        { postId },
        { startAfter: new Date(Date.now() + waitMs), singletonKey: postId },
      );
      return;
    }

    // Atomic claim. Runs on every attempt, including when this row is already `publishing`: that is
    // only allowed once the lease has gone stale, which is what lets a crashed worker's post recover.
    const claimed = resultRows<{ id: string }>(
      await db.execute(sql`
        UPDATE posts SET status = 'publishing', updated_at = now()
        WHERE id = ${postId}
          AND (
            status IN ('approved', 'scheduled')
            OR (status = 'publishing' AND updated_at < now() - interval '${sql.raw(STALE_LEASE)}')
          )
        RETURNING id
      `),
    );
    if (claimed.length === 0) {
      log.info("publish_post: lost the claim race (already handled elsewhere), skipping");
      return;
    }
    /** Where the row goes back to if this attempt does not finish (so the retry can re-claim it). */
    const releaseStatus = post.status === "approved" ? "approved" : "scheduled";

    const publishablePost: PublishablePost = {
      id: post.id,
      platform: post.platform,
      language: post.language,
      title: post.title,
      body: post.body,
      hashtags: post.hashtags,
      linkUrl: post.linkUrl,
      media: post.media as PublishablePost["media"],
      scheduledAt: post.scheduledAt ? post.scheduledAt.toISOString() : null,
      externalId: post.externalId,
      communityRef: post.communityId,
    };

    try {
      const result = await connector.publish(account, publishablePost);
      const baseCompliance = (post.compliance ?? {}) as Record<string, unknown>;
      const compliance =
        result.visibility === "private"
          ? {
              ...baseCompliance,
              visibility: "private",
              visibilityNote: "Published private pending platform review/audit.",
            }
          : post.compliance;
      await db
        .update(posts)
        .set({
          status: "published",
          publishedAt: new Date(),
          externalId: result.externalId,
          externalUrl: result.url ?? null,
          compliance,
          lastError: null,
        })
        .where(eq(posts.id, postId));
      await writeAudit(post.businessId, "system", "publish_post.published", {
        postId,
        externalId: result.externalId,
        visibility: result.visibility ?? "public",
      });
      log.info({ externalId: result.externalId }, "publish_post: published");
    } catch (err) {
      if (err instanceof ConnectorError && err.retryable) {
        // Release the claim so pg-boss's retry can take it again without waiting out the lease.
        await db
          .update(posts)
          .set({
            status: releaseStatus,
            attempts: sql`${posts.attempts} + 1`,
            lastError: redactSecrets(err.message),
          })
          .where(eq(posts.id, postId));
        await writeAudit(post.businessId, "system", "publish_post.retry", {
          postId,
          error: err.message,
          code: err.code,
        });
        log.warn({ err }, "publish_post: retryable connector error, will retry");
        throw err; // let pg-boss retry (retryLimit 3, backoff) per the @adv/jobs enqueue default
      }
      const message = err instanceof Error ? err.message : String(err);
      await failPost(db, postId, message);
      await writeAudit(post.businessId, "system", "publish_post.failed", { postId, error: message });
      log.error({ err }, "publish_post: non-retryable failure");
    }
  }
}

/**
 * Marks a post failed. `lastError` is rendered in the dashboard and kept indefinitely, and connector
 * errors routinely quote the failing request, so the message is redacted before it is stored.
 */
async function failPost(db: Db, postId: string, lastError: string): Promise<void> {
  await db
    .update(posts)
    .set({ status: "failed", lastError: redactSecrets(lastError) })
    .where(eq(posts.id, postId));
}
