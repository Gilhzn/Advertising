"use server";

import { ensureProject } from "@adv/analytics";
import { businesses, eq, getDb } from "@adv/db";
import { enqueue } from "@adv/jobs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getBusinessById } from "@/lib/data/businesses";
import { requireUser } from "@/lib/session";

async function assertOwnership(businessId: string) {
  const user = await requireUser();
  const business = await getBusinessById(user.id, businessId);
  if (!business) throw new Error("Not found");
  return business;
}

export type EnsureProjectState = { error?: string; ok?: boolean } | undefined;

export async function ensurePostHogProjectAction(
  businessId: string,
  slug: string,
): Promise<EnsureProjectState> {
  await assertOwnership(businessId);
  const result = await ensureProject(businessId);
  revalidatePath(`/b/${slug}/product`);
  if (result.created === false && result.reason === "org_not_configured") {
    return { error: "POSTHOG_ORG_ID is not configured — paste an existing project's id and token instead." };
  }
  return { ok: true };
}

const ManualPostHogSchema = z.object({
  posthogProjectId: z.string().trim().min(1),
  posthogProjectToken: z.string().trim().min(1),
});

export type ManualPostHogState = { error?: string; ok?: boolean } | undefined;

export async function saveManualPostHogAction(
  businessId: string,
  slug: string,
  _prevState: ManualPostHogState,
  formData: FormData,
): Promise<ManualPostHogState> {
  await assertOwnership(businessId);
  const parsed = ManualPostHogSchema.safeParse({
    posthogProjectId: formData.get("posthogProjectId"),
    posthogProjectToken: formData.get("posthogProjectToken"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  }
  const db = getDb();
  await db
    .update(businesses)
    .set({
      posthogProjectId: parsed.data.posthogProjectId,
      posthogProjectToken: parsed.data.posthogProjectToken,
    })
    .where(eq(businesses.id, businessId));
  revalidatePath(`/b/${slug}/product`);
  return { ok: true };
}

export async function syncProductAnalyticsAction(businessId: string, slug: string): Promise<void> {
  await assertOwnership(businessId);
  await enqueue("sync_product_analytics", { businessId });
  revalidatePath(`/b/${slug}/product`);
}
