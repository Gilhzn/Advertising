"use server";

import { auditLog, brandKits, channelPlans, desc, eq, getDb } from "@adv/db";
import { enqueue } from "@adv/jobs";
import { renderTemplate, uploadMedia } from "@adv/media";
import { type BrandKit, BrandKitSchema } from "@adv/shared";
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

  // `base` is a bound server-action argument, which means it arrives from the client and is fully
  // attacker-controlled by anyone who can reach this action. It used to be spread straight into the
  // row, so any JSON at all could be written into `brand_kits.data` - a store the strategist and
  // copywriter agents read back and put into prompts. Validate it against the schema first, and
  // validate the result again after merging the form fields in.
  const parsedBase = BrandKitSchema.safeParse(base);
  if (!parsedBase.success) return { error: "That brand kit is not valid." };
  const safeBase = parsedBase.data;

  const handleSuggestions = String(formData.get("handleSuggestions") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const bios: BrandKit["bios"] = { ...safeBase.bios };
  for (const platform of Object.keys(bios)) {
    const short = formData.get(`bio_short_${platform}`);
    const long = formData.get(`bio_long_${platform}`);
    bios[platform as keyof typeof bios] = {
      short: short ? String(short) : (bios[platform as keyof typeof bios]?.short ?? ""),
      long: long ? String(long) : bios[platform as keyof typeof bios]?.long,
    };
  }

  const merged: BrandKit = {
    ...safeBase,
    handleSuggestions: handleSuggestions.length > 0 ? handleSuggestions : safeBase.handleSuggestions,
    bios,
  };
  const parsedNext = BrandKitSchema.safeParse(merged);
  if (!parsedNext.success) return { error: "Those brand kit values are not valid." };
  const nextData = parsedNext.data;

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

export type GenerateBrandAssetsState = { error?: string; ok?: boolean } | undefined;

/**
 * Renders an avatar (1:1) and a banner (3:1) from the latest brand kit's palette/tagline/business name
 * (plus the business's product image, if any), uploads both under deterministic keys so re-generating
 * overwrites the same URLs, and stores those URLs on a new brand kit version.
 */
export async function generateBrandAssetsAction(
  businessId: string,
  slug: string,
): Promise<GenerateBrandAssetsState> {
  const user = await requireUser();
  const business = await getBusinessById(user.id, businessId);
  if (!business) throw new Error("Not found");

  const db = getDb();
  const [latest] = await db
    .select()
    .from(brandKits)
    .where(eq(brandKits.businessId, businessId))
    .orderBy(desc(brandKits.version))
    .limit(1);
  const parsed = latest ? BrandKitSchema.safeParse(latest.data) : null;
  if (!latest || !parsed?.success) {
    return { error: "Generate a strategy first, then come back to render brand assets." };
  }
  const kit = parsed.data;

  const brand = {
    ...kit.palette,
    imageUrl: business.imageUrl,
    direction: business.primaryLanguage === "he" ? ("rtl" as const) : ("ltr" as const),
  };

  const [avatarRendered, bannerRendered] = await Promise.all([
    renderTemplate({
      template: "avatar",
      aspect: "1:1",
      headline: kit.tagline,
      brand,
      businessName: business.name,
    }),
    renderTemplate({
      template: "banner",
      aspect: "3:1",
      headline: kit.tagline,
      brand,
      businessName: business.name,
    }),
  ]);

  const [avatarUpload, bannerUpload] = await Promise.all([
    uploadMedia({
      businessId,
      buffer: avatarRendered.buffer,
      contentType: avatarRendered.mimeType,
      ext: "png",
      key: "brand/avatar",
    }),
    uploadMedia({
      businessId,
      buffer: bannerRendered.buffer,
      contentType: bannerRendered.mimeType,
      ext: "png",
      key: "brand/banner",
    }),
  ]);

  const nextData: BrandKit = {
    ...kit,
    assets: {
      avatarUrl: avatarUpload.url,
      bannerUrl: bannerUpload.url,
      generatedAt: new Date().toISOString(),
    },
  };

  await db.insert(brandKits).values({
    businessId,
    version: latest.version + 1,
    data: nextData,
  });

  try {
    await db.insert(auditLog).values({
      businessId,
      actor: `user:${user.id}`,
      action: "brand_assets.generated",
      target: businessId,
      payload: { avatarUrl: avatarUpload.url, bannerUrl: bannerUpload.url },
    });
  } catch (err) {
    console.error("[audit_log] failed to write", { action: "brand_assets.generated", err });
  }

  revalidatePath(`/b/${slug}/strategy`);
  revalidatePath(`/b/${slug}/setup`);
  return { ok: true };
}
