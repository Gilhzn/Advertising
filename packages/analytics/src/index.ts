import { z } from "zod";

export * from "./posthog.js";
export * from "./queries.js";
export * from "./setup.js";
export * from "./sync.js";

// ---------------------------------------------------------------------------
// Zod shapes for the assembled analytics payloads, so apps/web (dashboard) and
// packages/agents (product-advisor) can rely on a stable contract instead of the raw
// `product_analytics_snapshots.payload` jsonb blob.
// ---------------------------------------------------------------------------

export const OverviewPayloadSchema = z.object({
  users: z.number(),
  sessions: z.number(),
  avgSessionDurationSeconds: z.number().nullable(),
  bounceRate: z.number().nullable(),
});

export const TopScreenRowSchema = z.object({
  screen: z.string(),
  uniqueUsers: z.number(),
  pageviews: z.number(),
  totalDurationSeconds: z.number().nullable(),
});

export const TopElementRowSchema = z.object({
  element: z.string(),
  url: z.string().nullable(),
  clicks: z.number(),
  uniqueUsers: z.number(),
});

export const RageClickRowSchema = z.object({
  url: z.string().nullable(),
  element: z.string().nullable(),
  rageClicks: z.number(),
  uniqueUsers: z.number(),
});

export const FunnelStepRowSchema = z.object({
  step: z.number().int(),
  event: z.string(),
  users: z.number(),
  conversionFromFirst: z.number().nullable(),
  conversionFromPrevious: z.number().nullable(),
});

export const RetentionRowSchema = z.object({
  cohortDate: z.string(),
  cohortSize: z.number(),
  retainedUsers: z.number(),
  retentionRate: z.number(),
});

export const UtmAttributionRowSchema = z.object({
  utmSource: z.string().nullable(),
  utmMedium: z.string().nullable(),
  utmCampaign: z.string().nullable(),
  pageviews: z.number(),
  uniqueUsers: z.number(),
});

export const HeatmapRefPayloadSchema = z.object({
  available: z.boolean(),
  heatmaps: z.array(z.record(z.string(), z.unknown())).optional(),
  error: z.string().optional(),
});

/**
 * Shape of an assembled product-analytics summary for one business/period — one field per
 * `product_analytics_snapshots.kind` value written by `syncProductAnalytics`. All fields are
 * optional because a given kind's row may not exist yet (e.g. first sync, or a business
 * without a PostHog project).
 */
export const AnalyticsSummarySchema = z.object({
  businessId: z.uuid(),
  periodStart: z.iso.datetime(),
  periodEnd: z.iso.datetime(),
  overview: OverviewPayloadSchema.optional(),
  topScreens: z.array(TopScreenRowSchema).optional(),
  topElements: z.array(TopElementRowSchema).optional(),
  rageClicks: z.array(RageClickRowSchema).optional(),
  retention: z.array(RetentionRowSchema).optional(),
  utmAttribution: z.array(UtmAttributionRowSchema).optional(),
  heatmapRef: HeatmapRefPayloadSchema.optional(),
});
export type AnalyticsSummary = z.infer<typeof AnalyticsSummarySchema>;
