import { and, businesses, eq, getDb, metricSnapshots, posts, productAnalyticsSnapshots } from "@adv/db";
import { logger } from "@adv/shared";
import { PostHogClient } from "./posthog.js";
import {
  type AnalyticsPeriod,
  normaliseOverview,
  normaliseRageClicks,
  normaliseRetention,
  normaliseTopElements,
  normaliseTopScreens,
  normaliseUtmAttribution,
  overviewQuery,
  rageClicksQuery,
  retentionQuery,
  topElementsQuery,
  topScreensQuery,
  utmAttributionQuery,
} from "./queries.js";

export interface SyncProductAnalyticsOptions {
  days?: number;
  cohortDays?: number;
  /** Injected in tests; defaults to a real `PostHogClient` built from env vars. */
  client?: PostHogClient;
}

export type SyncProductAnalyticsResult =
  | { skipped: true; reason: "no_business" | "no_project" }
  | {
      skipped: false;
      kinds: string[];
      periodStart: string;
      periodEnd: string;
      clickMetricsWritten: number;
    };

/** Truncates to UTC midnight so re-runs on the same day compute the same period bounds. */
function dayFloor(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Pulls a fixed set of PostHog HogQL queries for a business's product-analytics project and
 * writes one `product_analytics_snapshots` row per kind (`overview`, `top_screens`,
 * `top_elements`, `rage_clicks`, `retention`, `utm_attribution`, `heatmap_ref`), plus a
 * `metric_snapshots` `clicks` row per post whose id shows up as a `utm_campaign` value (see
 * `buildTrackedUrl` in queries.ts). Idempotent per calendar day: existing rows for the same
 * business/kind/period (or business/post/metric/period for click metrics) are deleted before
 * the new ones are inserted. Businesses without a linked PostHog project are tolerated —
 * returns `{ skipped: true, reason: "no_project" }` rather than throwing.
 */
export async function syncProductAnalytics(
  businessId: string,
  opts: SyncProductAnalyticsOptions = {},
): Promise<SyncProductAnalyticsResult> {
  const days = opts.days ?? 7;
  const cohortDays = opts.cohortDays ?? 7;
  const db = getDb();

  const business = await db.query.businesses.findFirst({ where: eq(businesses.id, businessId) });
  if (!business) {
    logger.warn({ businessId }, "sync_product_analytics: business not found");
    return { skipped: true, reason: "no_business" };
  }
  if (!business.posthogProjectId) {
    logger.info({ businessId }, "sync_product_analytics: no posthog project linked, skipping");
    return { skipped: true, reason: "no_project" };
  }

  const projectId = business.posthogProjectId;
  const client = opts.client ?? new PostHogClient();

  const periodEnd = dayFloor(new Date());
  const periodStart = new Date(periodEnd.getTime() - days * 24 * 60 * 60 * 1000);
  const period: AnalyticsPeriod = { start: periodStart.toISOString(), end: periodEnd.toISOString() };

  const payloads: Record<string, unknown> = {};

  const [overviewRes, topScreensRes, topElementsRes, rageClicksRes, retentionRes, utmRes] = await Promise.all(
    [
      client.query(projectId, overviewQuery(period)),
      client.query(projectId, topScreensQuery(period)),
      client.query(projectId, topElementsQuery(period)),
      client.query(projectId, rageClicksQuery(period)),
      client.query(projectId, retentionQuery(period, cohortDays)),
      client.query(projectId, utmAttributionQuery(period)),
    ],
  );

  payloads.overview = normaliseOverview(overviewRes);
  payloads.top_screens = normaliseTopScreens(topScreensRes);
  payloads.top_elements = normaliseTopElements(topElementsRes);
  payloads.rage_clicks = normaliseRageClicks(rageClicksRes);
  payloads.retention = normaliseRetention(retentionRes);
  const utmRows = normaliseUtmAttribution(utmRes);
  payloads.utm_attribution = utmRows;

  try {
    const heatmaps = await client.listHeatmaps(projectId, {
      dateFrom: period.start,
      dateTo: period.end,
    });
    payloads.heatmap_ref = { available: true, heatmaps };
  } catch (err) {
    logger.warn({ businessId, err }, "sync_product_analytics: heatmaps unavailable, storing empty ref");
    payloads.heatmap_ref = { available: false, error: (err as Error).message };
  }

  let clickMetricsWritten = 0;

  await db.transaction(async (tx) => {
    for (const [kind, payload] of Object.entries(payloads)) {
      await tx
        .delete(productAnalyticsSnapshots)
        .where(
          and(
            eq(productAnalyticsSnapshots.businessId, businessId),
            eq(productAnalyticsSnapshots.kind, kind),
            eq(productAnalyticsSnapshots.periodStart, periodStart),
            eq(productAnalyticsSnapshots.periodEnd, periodEnd),
          ),
        );
      await tx.insert(productAnalyticsSnapshots).values({
        businessId,
        kind,
        periodStart,
        periodEnd,
        payload: payload as object,
      });
    }

    const businessPosts = await tx.query.posts.findMany({ where: eq(posts.businessId, businessId) });
    const postById = new Map(businessPosts.map((p) => [p.id, p]));

    for (const row of utmRows) {
      const post = row.utmCampaign ? postById.get(row.utmCampaign) : undefined;
      if (!post) continue;

      await tx
        .delete(metricSnapshots)
        .where(
          and(
            eq(metricSnapshots.postId, post.id),
            eq(metricSnapshots.metric, "clicks"),
            eq(metricSnapshots.capturedAt, periodEnd),
          ),
        );
      await tx.insert(metricSnapshots).values({
        businessId,
        postId: post.id,
        accountId: post.accountId,
        platform: post.platform,
        metric: "clicks",
        value: String(row.pageviews),
        capturedAt: periodEnd,
      });
      clickMetricsWritten += 1;
    }
  });

  logger.info(
    { businessId, kinds: Object.keys(payloads), clickMetricsWritten },
    "sync_product_analytics: done",
  );

  return {
    skipped: false,
    kinds: Object.keys(payloads),
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    clickMetricsWritten,
  };
}
