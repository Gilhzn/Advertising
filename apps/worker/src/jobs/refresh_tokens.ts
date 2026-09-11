import { getConnector } from "@adv/connectors";
import { and, eq, getDb, lte, oauthTokens, platformAccounts } from "@adv/db";
import type { JobPayload } from "@adv/jobs";
import { logger } from "@adv/shared";
import type { Job } from "pg-boss";
import { loadAccount, refreshAccountTokens } from "../lib/accounts.js";
import { writeAudit } from "../lib/audit.js";

/** Refreshes every connected account's tokens that expire within the next 24h. */
export async function handleRefreshTokens(jobs: Job<JobPayload<"refresh_tokens">>[]): Promise<void> {
  for (const job of jobs) {
    const log = logger.child({ jobId: job.id, jobName: "refresh_tokens" });
    const db = getDb();
    const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const rows = await db
      .select({ id: platformAccounts.id, platform: platformAccounts.platform })
      .from(platformAccounts)
      .innerJoin(oauthTokens, eq(oauthTokens.accountId, platformAccounts.id))
      .where(and(eq(platformAccounts.status, "connected"), lte(oauthTokens.expiresAt, soon)));

    log.info({ candidates: rows.length }, "refresh_tokens: checking expiring tokens");

    for (const row of rows) {
      try {
        const connector = getConnector(row.platform);
        if (!connector.refresh && !connector.refreshForAccount) continue;
        const account = await loadAccount(row.id);
        if (!account?.tokens) continue;
        await refreshAccountTokens(connector, account);
        await writeAudit(account.businessId, "system", "refresh_tokens.refreshed", {
          accountId: row.id,
          platform: row.platform,
        });
      } catch (err) {
        log.error({ err, accountId: row.id, platform: row.platform }, "refresh_tokens: failed for account");
      }
    }
  }
}
