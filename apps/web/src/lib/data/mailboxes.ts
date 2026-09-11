import { desc, eq, getDb, mailboxes } from "@adv/db";

export type Mailbox = typeof mailboxes.$inferSelect;

export async function getMailboxForBusiness(businessId: string): Promise<Mailbox | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.businessId, businessId))
    .orderBy(desc(mailboxes.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getMailboxById(id: string): Promise<Mailbox | null> {
  const db = getDb();
  const [row] = await db.select().from(mailboxes).where(eq(mailboxes.id, id)).limit(1);
  return row ?? null;
}

/**
 * The address to prefill into bios/contact fields (plan item 20): the active mailbox if one exists,
 * else the most recently created mailbox, else undefined when the business has none yet.
 */
export async function getContactEmailForBusiness(businessId: string): Promise<string | undefined> {
  const db = getDb();
  const rows = await db
    .select({ address: mailboxes.address, status: mailboxes.status })
    .from(mailboxes)
    .where(eq(mailboxes.businessId, businessId))
    .orderBy(desc(mailboxes.createdAt));
  if (rows.length === 0) return undefined;
  return (rows.find((r) => r.status === "active") ?? rows[0])?.address;
}
