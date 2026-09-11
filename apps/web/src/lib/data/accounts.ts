import { desc, eq, getDb, platformAccounts } from "@adv/db";

export type PlatformAccount = typeof platformAccounts.$inferSelect;

export async function listAccounts(businessId: string): Promise<PlatformAccount[]> {
  const db = getDb();
  return db
    .select()
    .from(platformAccounts)
    .where(eq(platformAccounts.businessId, businessId))
    .orderBy(desc(platformAccounts.createdAt));
}

export async function getAccount(id: string): Promise<PlatformAccount | null> {
  const db = getDb();
  const [row] = await db.select().from(platformAccounts).where(eq(platformAccounts.id, id)).limit(1);
  return row ?? null;
}

export async function countConnected(businessId: string): Promise<{ connected: number; total: number }> {
  const rows = await listAccounts(businessId);
  return { connected: rows.filter((r) => r.status === "connected").length, total: rows.length };
}
