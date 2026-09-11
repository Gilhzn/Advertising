import { desc, eq, getDb, platformAccounts } from "@adv/db";

/**
 * Projection used by every dashboard view.
 *
 * `config` is deliberately excluded: it holds connector-specific secrets-adjacent values (Discord
 * webhook URLs, page/channel ids, IG user ids) that would otherwise be serialized into the RSC
 * payload of a page that only renders a status badge. Anything the UI genuinely needs from `config`
 * must be selected explicitly (one named value at a time), never the whole blob.
 */
const ACCOUNT_COLUMNS = {
  id: platformAccounts.id,
  businessId: platformAccounts.businessId,
  platform: platformAccounts.platform,
  ownership: platformAccounts.ownership,
  status: platformAccounts.status,
  handle: platformAccounts.handle,
  displayName: platformAccounts.displayName,
  profileUrl: platformAccounts.profileUrl,
  lastError: platformAccounts.lastError,
  lastSyncedAt: platformAccounts.lastSyncedAt,
  wizardStep: platformAccounts.wizardStep,
  externalId: platformAccounts.externalId,
} as const;

export type PlatformAccount = {
  [K in keyof typeof ACCOUNT_COLUMNS]: (typeof platformAccounts.$inferSelect)[K];
};

export async function listAccounts(businessId: string): Promise<PlatformAccount[]> {
  const db = getDb();
  return db
    .select(ACCOUNT_COLUMNS)
    .from(platformAccounts)
    .where(eq(platformAccounts.businessId, businessId))
    .orderBy(desc(platformAccounts.createdAt));
}

export async function getAccount(id: string): Promise<PlatformAccount | null> {
  const db = getDb();
  const [row] = await db
    .select(ACCOUNT_COLUMNS)
    .from(platformAccounts)
    .where(eq(platformAccounts.id, id))
    .limit(1);
  return row ?? null;
}

export async function countConnected(businessId: string): Promise<{ connected: number; total: number }> {
  const rows = await listAccounts(businessId);
  return { connected: rows.filter((r) => r.status === "connected").length, total: rows.length };
}
