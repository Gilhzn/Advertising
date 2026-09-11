import { brandKits, channelPlans, desc, eq, getDb } from "@adv/db";
import { type BrandKit, BrandKitSchema, type ChannelPlan, ChannelPlanSchema } from "@adv/shared";

export type BrandKitRow = typeof brandKits.$inferSelect;
export type ChannelPlanRow = typeof channelPlans.$inferSelect;

export async function getLatestBrandKit(businessId: string): Promise<BrandKitRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(brandKits)
    .where(eq(brandKits.businessId, businessId))
    .orderBy(desc(brandKits.version))
    .limit(1);
  return row ?? null;
}

export async function getLatestChannelPlan(businessId: string): Promise<ChannelPlanRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(channelPlans)
    .where(eq(channelPlans.businessId, businessId))
    .orderBy(desc(channelPlans.version))
    .limit(1);
  return row ?? null;
}

/** Parses stored JSON defensively - agent output may be mid-shape while agents evolve. */
export function parseBrandKit(row: BrandKitRow | null): BrandKit | null {
  if (!row) return null;
  const parsed = BrandKitSchema.safeParse(row.data);
  return parsed.success ? parsed.data : null;
}

export function parseChannelPlan(row: ChannelPlanRow | null): ChannelPlan | null {
  if (!row) return null;
  const parsed = ChannelPlanSchema.safeParse(row.data);
  return parsed.success ? parsed.data : null;
}
