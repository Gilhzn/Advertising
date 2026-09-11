import { and, desc, eq, getDb, inArray, posts } from "@adv/db";
import type { PlatformId, PostStatus } from "@adv/shared";

export type Post = typeof posts.$inferSelect;

export interface PostFilters {
  platform?: PlatformId;
  status?: PostStatus;
  language?: string;
}

export async function listPosts(businessId: string, filters: PostFilters = {}): Promise<Post[]> {
  const db = getDb();
  const conditions = [eq(posts.businessId, businessId)];
  if (filters.platform) conditions.push(eq(posts.platform, filters.platform));
  if (filters.status) conditions.push(eq(posts.status, filters.status));
  if (filters.language) conditions.push(eq(posts.language, filters.language as never));
  return db
    .select()
    .from(posts)
    .where(and(...conditions))
    .orderBy(desc(posts.scheduledAt));
}

export async function getPost(id: string): Promise<Post | null> {
  const db = getDb();
  const [row] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  return row ?? null;
}

export async function countAwaitingApproval(businessId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select()
    .from(posts)
    .where(and(eq(posts.businessId, businessId), eq(posts.status, "awaiting_approval")));
  return rows.length;
}

export async function listAwaitingApproval(businessIds: string[], limit = 20): Promise<Post[]> {
  if (businessIds.length === 0) return [];
  const db = getDb();
  return db
    .select()
    .from(posts)
    .where(and(inArray(posts.businessId, businessIds), eq(posts.status, "awaiting_approval")))
    .orderBy(desc(posts.createdAt))
    .limit(limit);
}

export async function countPostsByStatus(businessId: string, statuses: PostStatus[]): Promise<number> {
  const db = getDb();
  const rows = await db
    .select()
    .from(posts)
    .where(and(eq(posts.businessId, businessId), inArray(posts.status, statuses)));
  return rows.length;
}
