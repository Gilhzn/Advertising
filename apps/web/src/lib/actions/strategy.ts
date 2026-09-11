"use server";

import { brandKits, channelPlans, desc, eq, getDb } from "@adv/db";
import { enqueue } from "@adv/jobs";
import type { BrandKit } from "@adv/shared";
import { revalidatePath } from "next/cache";
import { getBusinessById } from "@/lib/data/businesses";
import { requireUser } from "@/lib/session";

async function assertOwnership(businessId: string): Promise<void> {
  const user = await requireUser();
  const business = await getBusinessById(user.id, businessId);
  if (!business) throw new Error("Not found");
}

export async function rerunStrategyAction(businessId: string, slug: string): Promise<void> {
  await assertOwnership(businessId);
  await enqueue("discover_business", { businessId, reason: "manual" });
  revalidatePath(`/b/${slug}/strategy`);
}

export async function approveStrategyAction(businessId: string, slug: string): Promise<void> {
  await assertOwnership(businessId);
  const db = getDb();
  const now = new Date();

  const [latestKit] = await db
    .select()
    .from(brandKits)
    .where(eq(brandKits.businessId, businessId))
    .orderBy(desc(brandKits.version))
    .limit(1);
  if (latestKit) {
    await db.update(brandKits).set({ approvedAt: now }).where(eq(brandKits.id, latestKit.id));
  }

  const [latestPlan] = await db
    .select()
    .from(channelPlans)
    .where(eq(channelPlans.businessId, businessId))
    .orderBy(desc(channelPlans.version))
    .limit(1);
  if (latestPlan) {
    await db.update(channelPlans).set({ approvedAt: now }).where(eq(channelPlans.id, latestPlan.id));
  }

  revalidatePath(`/b/${slug}/strategy`);
}

export type UpdateBrandKitState = { error?: string; ok?: boolean } | undefined;

export async function updateBrandKitAction(
  businessId: string,
  slug: string,
  base: BrandKit,
  _prevState: UpdateBrandKitState,
  formData: FormData,
): Promise<UpdateBrandKitState> {
  await assertOwnership(businessId);
  const db = getDb();

  const handleSuggestions = String(formData.get("handleSuggestions") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const bios: BrandKit["bios"] = { ...base.bios };
  for (const platform of Object.keys(bios)) {
    const short = formData.get(`bio_short_${platform}`);
    const long = formData.get(`bio_long_${platform}`);
    bios[platform as keyof typeof bios] = {
      short: short ? String(short) : (bios[platform as keyof typeof bios]?.short ?? ""),
      long: long ? String(long) : bios[platform as keyof typeof bios]?.long,
    };
  }

  const nextData: BrandKit = {
    ...base,
    handleSuggestions: handleSuggestions.length > 0 ? handleSuggestions : base.handleSuggestions,
    bios,
  };

  const [latest] = await db
    .select()
    .from(brandKits)
    .where(eq(brandKits.businessId, businessId))
    .orderBy(desc(brandKits.version))
    .limit(1);

  await db.insert(brandKits).values({
    businessId,
    version: (latest?.version ?? 0) + 1,
    data: nextData,
  });

  revalidatePath(`/b/${slug}/strategy`);
  return { ok: true };
}
