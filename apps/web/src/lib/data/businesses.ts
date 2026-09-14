import { and, businesses, desc, eq, getDb } from "@adv/db";
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
  // Scoped to the user in the query, not filtered afterwards. The unique index is (user_id, slug),
  // so the same slug can legitimately exist for two users; a global lookup returns whichever row
  // Postgres happens to pick, and the post-hoc userId check then 404s the rightful owner out of
  // their own business. Nothing leaked, but anyone could squat a slug and lock its owner out.
  const [row] = await db
    .select()
    .from(businesses)
    .where(and(eq(businesses.slug, slug), eq(businesses.userId, userId)))
    .limit(1);
  if (!row) notFound();
  return row;
}

export async function getBusinessById(userId: string, id: string): Promise<Business | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(businesses)
    .where(and(eq(businesses.id, id), eq(businesses.userId, userId)))
    .limit(1);
  if (!row) return null;
  return row;
}
