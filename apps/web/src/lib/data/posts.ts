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

/**
 * Unscoped by id. Every caller MUST establish ownership of `post.businessId` before showing the row
 * to anyone - `assertPostOwnership` in the content actions does exactly that. When the id comes from
 * data rather than from a route the user owns, use `getPostForBusiness` instead.
 */
export async function getPost(id: string): Promise<Post | null> {
  const db = getDb();
  const [row] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  return row ?? null;
}

/**
 * Tenant-scoped lookup for ids that arrive as data rather than as a route parameter.
 *
 * The product page resolves `utm_campaign` values coming back from PostHog into posts. Those values
 * are strings a third party can put into the analytics stream, so an id belonging to another
 * business would have rendered that business's post title and body on this page. Scoping the query
 * makes a foreign id simply return nothing. Ids that are not UUIDs are rejected before the query so
 * a malformed value cannot raise a database error either.
 */
export async function getPostForBusiness(businessId: string, id: string): Promise<Post | null> {
  if (!UUID_RE.test(id)) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, id), eq(posts.businessId, businessId)))
    .limit(1);
  return row ?? null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export interface ScheduledDayCount {
  day: string;
  count: number;
}

/** Counts of scheduled/approved posts due each of the next `days` days (UTC calendar days), for a mini calendar strip. */
export async function scheduledCountsByDay(businessIds: string[], days = 7): Promise<ScheduledDayCount[]> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const result: ScheduledDayCount[] = Array.from({ length: days }, (_, i) => {
    const d = new Date(todayStart.getTime() + i * 24 * 60 * 60 * 1000);
    return { day: d.toISOString().slice(0, 10), count: 0 };
  });
  if (businessIds.length === 0) return result;

  const db = getDb();
  const windowEnd = new Date(todayStart.getTime() + days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ scheduledAt: posts.scheduledAt })
    .from(posts)
    .where(
      and(
        inArray(posts.businessId, businessIds),
        inArray(posts.status, ["scheduled", "approved"]),
        // scheduledAt is nullable in the type but required for these statuses in practice
      ),
    );

  const byDay = new Map(result.map((r) => [r.day, r]));
  for (const row of rows) {
    if (!row.scheduledAt) continue;
    if (row.scheduledAt < todayStart || row.scheduledAt >= windowEnd) continue;
    const key = row.scheduledAt.toISOString().slice(0, 10);
    const slot = byDay.get(key);
    if (slot) slot.count += 1;
  }
  return result;
}

export async function countPostsByStatus(businessId: string, statuses: PostStatus[]): Promise<number> {
  const db = getDb();
  const rows = await db
    .select()
    .from(posts)
    .where(and(eq(posts.businessId, businessId), inArray(posts.status, statuses)));
  return rows.length;
}
