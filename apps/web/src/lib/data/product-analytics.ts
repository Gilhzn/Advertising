import {
  HeatmapRefPayloadSchema,
  OverviewPayloadSchema,
  RageClickRowSchema,
  RetentionRowSchema,
  TopElementRowSchema,
  TopScreenRowSchema,
  UtmAttributionRowSchema,
} from "@adv/analytics";
import { desc, eq, getDb, productAnalyticsSnapshots } from "@adv/db";
import { z } from "zod";

export interface ProductAnalyticsSummary {
  hasAnySnapshot: boolean;
  periodStart: Date | null;
  periodEnd: Date | null;
  overview?: z.infer<typeof OverviewPayloadSchema>;
  topScreens?: z.infer<typeof TopScreenRowSchema>[];
  topElements?: z.infer<typeof TopElementRowSchema>[];
  rageClicks?: z.infer<typeof RageClickRowSchema>[];
  retention?: z.infer<typeof RetentionRowSchema>[];
  utmAttribution?: z.infer<typeof UtmAttributionRowSchema>[];
  heatmapRef?: z.infer<typeof HeatmapRefPayloadSchema>;
}

const KIND_SCHEMAS = {
  overview: OverviewPayloadSchema,
  top_screens: z.array(TopScreenRowSchema),
  top_elements: z.array(TopElementRowSchema),
  rage_clicks: z.array(RageClickRowSchema),
  retention: z.array(RetentionRowSchema),
  utm_attribution: z.array(UtmAttributionRowSchema),
  heatmap_ref: HeatmapRefPayloadSchema,
} as const;

/** Latest `product_analytics_snapshots` row per kind, parsed against the shared analytics schemas. */
export async function getProductAnalyticsSummary(businessId: string): Promise<ProductAnalyticsSummary> {
  const db = getDb();
  const rows = await db
    .select()
    .from(productAnalyticsSnapshots)
    .where(eq(productAnalyticsSnapshots.businessId, businessId))
    .orderBy(desc(productAnalyticsSnapshots.periodEnd))
    .limit(200);

  const latestByKind = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latestByKind.has(row.kind)) latestByKind.set(row.kind, row);
  }

  const summary: ProductAnalyticsSummary = {
    hasAnySnapshot: latestByKind.size > 0,
    periodStart: null,
    periodEnd: null,
  };

  for (const [kind, row] of latestByKind) {
    if (!summary.periodEnd || row.periodEnd > summary.periodEnd) {
      summary.periodStart = row.periodStart;
      summary.periodEnd = row.periodEnd;
    }
    const schema = KIND_SCHEMAS[kind as keyof typeof KIND_SCHEMAS];
    if (!schema) continue;
    const parsed = schema.safeParse(row.payload);
    if (!parsed.success) continue;
    switch (kind) {
      case "overview":
        summary.overview = parsed.data as z.infer<typeof OverviewPayloadSchema>;
        break;
      case "top_screens":
        summary.topScreens = parsed.data as z.infer<typeof TopScreenRowSchema>[];
        break;
      case "top_elements":
        summary.topElements = parsed.data as z.infer<typeof TopElementRowSchema>[];
        break;
      case "rage_clicks":
        summary.rageClicks = parsed.data as z.infer<typeof RageClickRowSchema>[];
        break;
      case "retention":
        summary.retention = parsed.data as z.infer<typeof RetentionRowSchema>[];
        break;
      case "utm_attribution":
        summary.utmAttribution = parsed.data as z.infer<typeof UtmAttributionRowSchema>[];
        break;
      case "heatmap_ref":
        summary.heatmapRef = parsed.data as z.infer<typeof HeatmapRefPayloadSchema>;
        break;
    }
  }

  return summary;
}
