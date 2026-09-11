import { desc, eq, getDb, insights, recommendations } from "@adv/db";

export type InsightRow = typeof insights.$inferSelect;
export type RecommendationRow = typeof recommendations.$inferSelect;

export async function listInsights(businessId: string, limit = 20): Promise<InsightRow[]> {
  const db = getDb();
  return db
    .select()
    .from(insights)
    .where(eq(insights.businessId, businessId))
    .orderBy(desc(insights.periodEnd))
    .limit(limit);
}

export async function listRecommendations(businessId: string, limit = 50): Promise<RecommendationRow[]> {
  const db = getDb();
  return db
    .select()
    .from(recommendations)
    .where(eq(recommendations.businessId, businessId))
    .orderBy(desc(recommendations.createdAt))
    .limit(limit);
}

export async function getRecommendation(id: string): Promise<RecommendationRow | null> {
  const db = getDb();
  const [row] = await db.select().from(recommendations).where(eq(recommendations.id, id)).limit(1);
  return row ?? null;
}
