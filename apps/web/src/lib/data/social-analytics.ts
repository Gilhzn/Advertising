import { and, eq, getDb, gte, metricSnapshots, posts } from "@adv/db";
import type { PlatformId } from "@adv/shared";

const ENGAGEMENT_METRICS = ["likes", "comments", "shares", "clicks"] as const;

interface RawRow {
  platform: string;
  metric: string;
  value: string;
  capturedAt: Date;
  postId: string | null;
  pillarId: string | null;
  language: string | null;
  publishedAt: Date | null;
  title: string | null;
  body: string | null;
  externalUrl: string | null;
}

async function fetchRows(businessId: string, since: Date): Promise<RawRow[]> {
  const db = getDb();
  return db
    .select({
      platform: metricSnapshots.platform,
      metric: metricSnapshots.metric,
      value: metricSnapshots.value,
      capturedAt: metricSnapshots.capturedAt,
      postId: metricSnapshots.postId,
      pillarId: posts.pillarId,
      language: posts.language,
      publishedAt: posts.publishedAt,
      title: posts.title,
      body: posts.body,
      externalUrl: posts.externalUrl,
    })
    .from(metricSnapshots)
    .leftJoin(posts, eq(metricSnapshots.postId, posts.id))
    .where(and(eq(metricSnapshots.businessId, businessId), gte(metricSnapshots.capturedAt, since)));
}

export interface KpiTotals {
  followers: Record<string, number>;
  impressions: number;
  reach: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
}

export interface DailySeriesPoint {
  day: string;
  [platform: string]: number | string;
}

export interface StackedEngagementRow {
  platform: string;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
}

export interface TopPostRow {
  postId: string;
  platform: string;
  title: string | null;
  body: string;
  externalUrl: string | null;
  publishedAt: Date | null;
  impressions: number;
  engagement: number;
}

export interface BreakdownRow {
  key: string;
  value: number;
}

export interface SocialAnalytics {
  hasData: boolean;
  platforms: PlatformId[];
  kpis: KpiTotals;
  dailyReach: DailySeriesPoint[];
  dailyImpressions: DailySeriesPoint[];
  engagementByPlatform: StackedEngagementRow[];
  topPosts: TopPostRow[];
  byPillar: BreakdownRow[];
  byHour: BreakdownRow[];
  byLanguage: BreakdownRow[];
}

function num(v: string): number {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Aggregates `metric_snapshots` (joined to `posts` for pillar/hour/language/top-posts) for a
 * business over the trailing `days` window. All aggregation happens in JS over the raw rows —
 * same pattern as `get_metrics` in `packages/agents/src/tools/engine.ts` — rather than in SQL,
 * since the row volume per business/period is small.
 */
export async function getSocialAnalytics(businessId: string, days: 7 | 30 | 90): Promise<SocialAnalytics> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await fetchRows(businessId, since);

  const platformSet = new Set<string>();
  const kpis: KpiTotals = {
    followers: {},
    impressions: 0,
    reach: 0,
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    clicks: 0,
  };
  const followersLatestAt: Record<string, Date> = {};
  const dailyReachMap = new Map<string, Record<string, number>>();
  const dailyImpressionsMap = new Map<string, Record<string, number>>();
  const engagementByPlatformMap = new Map<string, StackedEngagementRow>();
  const perPost = new Map<string, TopPostRow>();
  const pillarTotals = new Map<string, number>();
  const hourTotals = new Map<string, number>();
  const languageTotals = new Map<string, number>();

  for (const r of rows) {
    platformSet.add(r.platform);
    const value = num(r.value);

    if (r.metric === "followers") {
      const seenAt = followersLatestAt[r.platform];
      if (!seenAt || r.capturedAt > seenAt) {
        followersLatestAt[r.platform] = r.capturedAt;
        kpis.followers[r.platform] = value;
      }
      continue;
    }

    if (r.metric === "impressions" || r.metric === "reach" || r.metric === "views") {
      kpis[r.metric] += value;
    }
    if ((ENGAGEMENT_METRICS as readonly string[]).includes(r.metric)) {
      kpis[r.metric as (typeof ENGAGEMENT_METRICS)[number]] += value;
      const bucket =
        engagementByPlatformMap.get(r.platform) ??
        ({
          platform: r.platform,
          likes: 0,
          comments: 0,
          shares: 0,
          clicks: 0,
        } satisfies StackedEngagementRow);
      bucket[r.metric as (typeof ENGAGEMENT_METRICS)[number]] += value;
      engagementByPlatformMap.set(r.platform, bucket);
    }

    if (r.metric === "reach") {
      const day = dayKey(r.capturedAt);
      const slot = dailyReachMap.get(day) ?? {};
      slot[r.platform] = (slot[r.platform] ?? 0) + value;
      dailyReachMap.set(day, slot);
    }
    if (r.metric === "impressions") {
      const day = dayKey(r.capturedAt);
      const slot = dailyImpressionsMap.get(day) ?? {};
      slot[r.platform] = (slot[r.platform] ?? 0) + value;
      dailyImpressionsMap.set(day, slot);
    }

    if (r.postId) {
      const prev = perPost.get(r.postId) ?? {
        postId: r.postId,
        platform: r.platform,
        title: r.title,
        body: r.body ?? "",
        externalUrl: r.externalUrl,
        publishedAt: r.publishedAt,
        impressions: 0,
        engagement: 0,
      };
      if (r.metric === "impressions") prev.impressions += value;
      if ((ENGAGEMENT_METRICS as readonly string[]).includes(r.metric)) prev.engagement += value;
      perPost.set(r.postId, prev);

      const engagementValue = (ENGAGEMENT_METRICS as readonly string[]).includes(r.metric) ? value : 0;
      if (r.pillarId) pillarTotals.set(r.pillarId, (pillarTotals.get(r.pillarId) ?? 0) + engagementValue);
      if (r.language) languageTotals.set(r.language, (languageTotals.get(r.language) ?? 0) + engagementValue);
      if (r.publishedAt) {
        const hour = String(r.publishedAt.getUTCHours()).padStart(2, "0");
        hourTotals.set(hour, (hourTotals.get(hour) ?? 0) + engagementValue);
      }
    }
  }

  const toSeries = (map: Map<string, Record<string, number>>): DailySeriesPoint[] =>
    [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, values]) => ({ day, ...values }));

  const toBreakdown = (map: Map<string, number>): BreakdownRow[] =>
    [...map.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);

  return {
    hasData: rows.length > 0,
    platforms: [...platformSet] as PlatformId[],
    kpis,
    dailyReach: toSeries(dailyReachMap),
    dailyImpressions: toSeries(dailyImpressionsMap),
    engagementByPlatform: [...engagementByPlatformMap.values()],
    topPosts: [...perPost.values()].sort((a, b) => b.engagement - a.engagement).slice(0, 10),
    byPillar: toBreakdown(pillarTotals),
    byHour: [...hourTotals.entries()]
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    byLanguage: toBreakdown(languageTotals),
  };
}
