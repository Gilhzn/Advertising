"use server";

import { eq, getDb, recommendations } from "@adv/db";
import { enqueue } from "@adv/jobs";
import { revalidatePath } from "next/cache";
import { getBusinessById } from "@/lib/data/businesses";
import { getRecommendation } from "@/lib/data/insights";
import { requireUser } from "@/lib/session";

export async function setRecommendationStatusAction(
  recommendationId: string,
  status: "accepted" | "dismissed",
): Promise<void> {
  const user = await requireUser();
  const rec = await getRecommendation(recommendationId);
  if (!rec) throw new Error("Not found");
  const business = await getBusinessById(user.id, rec.businessId);
  if (!business) throw new Error("Not found");

  const db = getDb();
  await db.update(recommendations).set({ status }).where(eq(recommendations.id, recommendationId));
  revalidatePath(`/b/${business.slug}/insights`);
}

async function assertOwnership(businessId: string) {
  const user = await requireUser();
  const business = await getBusinessById(user.id, businessId);
  if (!business) throw new Error("Not found");
  return business;
}

export async function runAnalystNowAction(businessId: string, slug: string): Promise<void> {
  await assertOwnership(businessId);
  await enqueue("run_analyst", { businessId });
  revalidatePath(`/b/${slug}/insights`);
}

export async function runProductAdvisorAction(businessId: string, slug: string): Promise<void> {
  await assertOwnership(businessId);
  await enqueue("run_product_advisor", { businessId });
  revalidatePath(`/b/${slug}/insights`);
}

export async function replanStrategyAction(businessId: string, slug: string): Promise<void> {
  await assertOwnership(businessId);
  await enqueue("discover_business", { businessId, reason: "replan" });
  revalidatePath(`/b/${slug}/insights`);
}

/** The app-improvement agent only opens PRs; it never pushes directly to a user's repo. */
export async function openAppPrAction(
  businessId: string,
  slug: string,
  recommendationId: string,
): Promise<void> {
  const business = await assertOwnership(businessId);
  if (!business.appRepoUrl) throw new Error("Set an app repo URL in Settings first.");
  await enqueue("improve_app", { businessId, recommendationId });
  revalidatePath(`/b/${slug}/insights`);
}
