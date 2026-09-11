import { z } from "zod";

export const METRIC_NAMES = [
  "impressions",
  "reach",
  "views",
  "likes",
  "comments",
  "shares",
  "saves",
  "clicks",
  "followers",
  "replies",
  "reposts",
  "score",
  "upvote_ratio",
  "watch_time_seconds",
] as const;
export type MetricName = (typeof METRIC_NAMES)[number];

export const MetricSnapshotSchema = z.object({
  metric: z.enum(METRIC_NAMES),
  value: z.number(),
  capturedAt: z.iso.datetime(),
});

export const InsightSchema = z.object({
  summary: z.string(),
  findings: z
    .array(
      z.object({ title: z.string(), evidence: z.string(), confidence: z.enum(["low", "medium", "high"]) }),
    )
    .min(1),
  weights: z.object({
    platforms: z.record(z.string(), z.number().min(0).max(2)),
    pillars: z.record(z.string(), z.number().min(0).max(2)),
    hours: z.record(z.string(), z.number().min(0).max(2)),
    languages: z.record(z.string(), z.number().min(0).max(2)),
  }),
});
export type Insight = z.infer<typeof InsightSchema>;

export const RecommendationSchema = z.object({
  type: z.enum(["marketing", "product"]),
  priority: z.number().int().min(1).max(5),
  title: z.string(),
  detail: z.string(),
  evidence: z.string(),
  effort: z.enum(["low", "medium", "high"]),
  expectedImpact: z.enum(["low", "medium", "high"]),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;
