import { resolveConnector } from "@adv/connectors";
import { and, eq, getDb, metricSnapshots, platformAccounts, posts } from "@adv/db";
import { JOBS, type JobPayload } from "@adv/jobs";
import { logger } from "@adv/shared";
import type { Job } from "pg-boss";
import { isExpiringSoon, loadAccount, refreshAccountTokens } from "../lib/accounts.js";
import { writeAudit } from "../lib/audit.js";

const DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * For each connected owned account (optionally scoped to one business) whose connector supports
 * insights, fetches metrics since `lastSyncedAt` (or 7 days ago) and inserts `metric_snapshots`. Each
 * account is wrapped in its own try/catch so one bad account never stops the batch.
 */
export async function handleFetchInsights(jobs: Job<JobPayload<"fetch_insights">>[]): Promise<void> {
  for (const job of jobs) {
    const payload = JOBS.fetch_insights.parse(job.data);
    const log = logger.child({ jobId: job.id, jobName: "fetch_insights", businessId: payload.businessId });
    const db = getDb();

    const where = payload.businessId
      ? and(
          eq(platformAccounts.ownership, "owned"),
          eq(platformAccounts.status, "connected"),
          eq(platformAccounts.businessId, payload.businessId),
        )
      : and(eq(platformAccounts.ownership, "owned"), eq(platformAccounts.status, "connected"));

    const accounts = await db.select().from(platformAccounts).where(where);
    log.info({ accounts: accounts.length }, "fetch_insights: scanning accounts");

    for (const accRow of accounts) {
      try {
        const connector = resolveConnector(accRow.platform, { ...accRow, tokens: null });
        if (!connector.capabilities.insights) continue;

        let account = await loadAccount(accRow.id);
        if (!account) continue;

        if (
          account.tokens &&
          isExpiringSoon(account.tokens) &&
          (connector.refresh || connector.refreshForAccount)
        ) {
          const refreshed = await refreshAccountTokens(connector, account);
          if (refreshed) account = { ...account, tokens: refreshed };
        }

        const since = (accRow.lastSyncedAt ?? new Date(Date.now() - DEFAULT_LOOKBACK_MS)).toISOString();

        const publishedPosts = await db
          .select({ id: posts.id, externalId: posts.externalId })
          .from(posts)
          .where(and(eq(posts.accountId, accRow.id), eq(posts.status, "published")));
        const knownPosts = publishedPosts
          .filter((p): p is { id: string; externalId: string } => Boolean(p.externalId))
          .map((p) => ({ id: p.id, externalId: p.externalId }));

        const snapshots = await connector.fetchInsights(account, since, knownPosts);

        for (const snap of snapshots) {
          const postId = snap.externalPostId
            ? (knownPosts.find((p) => p.externalId === snap.externalPostId)?.id ?? null)
            : null;
          await db.insert(metricSnapshots).values({
            businessId: accRow.businessId,
            accountId: accRow.id,
            postId,
            platform: accRow.platform,
            metric: snap.metric,
            value: snap.value.toString(),
            capturedAt: new Date(snap.capturedAt),
          });
        }

        await db
          .update(platformAccounts)
          .set({ lastSyncedAt: new Date() })
          .where(eq(platformAccounts.id, accRow.id));
        await writeAudit(accRow.businessId, "system", "fetch_insights.synced", {
          accountId: accRow.id,
          platform: accRow.platform,
          count: snapshots.length,
        });
      } catch (err) {
        log.error({ err, accountId: accRow.id, platform: accRow.platform }, "fetch_insights: account failed");
      }
    }
  }
}
