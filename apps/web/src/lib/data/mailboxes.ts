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
