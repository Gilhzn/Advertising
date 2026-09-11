import { and, eq, getDb, gte, metricSnapshots } from "@adv/db";
import type { MetricName, PlatformId } from "@adv/shared";

export type MetricSnapshot = typeof metricSnapshots.$inferSelect;

/** Sums/last-value per metric for an account since `since`. `followers` uses the latest value; others sum. */
export async function accountMetricTotals(
  accountId: string,
  since: Date,
): Promise<Partial<Record<MetricName, number>>> {
  const db = getDb();
  const rows = await db
    .select()
    .from(metricSnapshots)
    .where(and(eq(metricSnapshots.accountId, accountId), gte(metricSnapshots.capturedAt, since)));
  const totals: Partial<Record<MetricName, number>> = {};
  const latestAt: Partial<Record<MetricName, Date>> = {};
  for (const row of rows) {
    const v = Number.parseFloat(row.value);
    if (row.metric === "followers") {
      const seenAt = latestAt[row.metric];
      if (!seenAt || row.capturedAt > seenAt) {
        latestAt[row.metric] = row.capturedAt;
        totals[row.metric] = v;
      }
    } else {
      totals[row.metric] = (totals[row.metric] ?? 0) + v;
    }
  }
  return totals;
}

export async function businessMetricSnapshots(businessId: string, since: Date): Promise<MetricSnapshot[]> {
  const db = getDb();
  return db
    .select()
    .from(metricSnapshots)
    .where(and(eq(metricSnapshots.businessId, businessId), gte(metricSnapshots.capturedAt, since)));
}

export type PlatformMetricSummary = {
  platform: PlatformId;
  followers?: number;
  impressions7d: number;
  impressions30d: number;
  reach7d: number;
  reach30d: number;
  engagement7d: number;
  engagement30d: number;
};
