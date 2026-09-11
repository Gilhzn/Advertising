import { businesses, desc, eq, getDb } from "@adv/db";
import { notFound } from "next/navigation";

export type Business = typeof businesses.$inferSelect;

export async function listBusinesses(userId: string): Promise<Business[]> {
  const db = getDb();
  return db
    .select()
    .from(businesses)
    .where(eq(businesses.userId, userId))
    .orderBy(desc(businesses.createdAt));
}

export async function getBusinessBySlug(userId: string, slug: string): Promise<Business> {
  const db = getDb();
  const [row] = await db.select().from(businesses).where(eq(businesses.slug, slug)).limit(1);
  if (!row || row.userId !== userId) notFound();
  return row;
}

export async function getBusinessById(userId: string, id: string): Promise<Business | null> {
  const db = getDb();
  const [row] = await db.select().from(businesses).where(eq(businesses.id, id)).limit(1);
  if (!row || row.userId !== userId) return null;
  return row;
}
