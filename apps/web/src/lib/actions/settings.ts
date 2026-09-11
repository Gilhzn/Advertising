"use server";

import { businesses, eq, getDb } from "@adv/db";
import { CONTENT_LANGUAGES } from "@adv/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getBusinessById } from "@/lib/data/businesses";
import { requireUser } from "@/lib/session";

const UpdateSettingsSchema = z.object({
  languages: z.array(z.enum(CONTENT_LANGUAGES)).min(1),
  primaryLanguage: z.enum(CONTENT_LANGUAGES),
  timezone: z.string().min(1),
  domain: z
    .string()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i)
    .optional()
    .or(z.literal("")),
  aiMonthlyBudgetUsd: z.coerce.number().min(0).max(100000),
  appRepoUrl: z.string().url().optional().or(z.literal("")),
});

export type UpdateSettingsState = { error?: string; ok?: boolean } | undefined;

export async function updateBusinessSettingsAction(
  businessId: string,
  slug: string,
  _prevState: UpdateSettingsState,
  formData: FormData,
): Promise<UpdateSettingsState> {
  const user = await requireUser();
  const business = await getBusinessById(user.id, businessId);
  if (!business) return { error: "Not found" };

  const parsed = UpdateSettingsSchema.safeParse({
    languages: formData.getAll("languages").map(String),
    primaryLanguage: formData.get("primaryLanguage"),
    timezone: formData.get("timezone"),
    domain: formData.get("domain") ?? "",
    aiMonthlyBudgetUsd: formData.get("aiMonthlyBudgetUsd"),
    appRepoUrl: formData.get("appRepoUrl") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  }
  const input = parsed.data;

  const db = getDb();
  await db
    .update(businesses)
    .set({
      languages: input.languages,
      primaryLanguage: input.primaryLanguage,
      timezone: input.timezone,
      domain: input.domain || null,
      aiMonthlyBudgetUsd: String(input.aiMonthlyBudgetUsd),
      appRepoUrl: input.appRepoUrl || null,
    })
    .where(eq(businesses.id, businessId));

  revalidatePath(`/b/${slug}/settings`);
  return { ok: true };
}

export async function deleteBusinessAction(businessId: string): Promise<void> {
  const user = await requireUser();
  const business = await getBusinessById(user.id, businessId);
  if (!business) throw new Error("Not found");
  const db = getDb();
  await db.delete(businesses).where(eq(businesses.id, businessId));
  redirect("/");
}
