"use server";

import { eq, getDb, recommendations } from "@adv/db";
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
