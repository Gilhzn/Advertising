"use server";

import { businesses, eq, getDb } from "@adv/db";
import { enqueue } from "@adv/jobs";
import { BUSINESS_CATEGORIES, CONTENT_LANGUAGES } from "@adv/shared";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { saveImageUpload, UploadRejectedError } from "@/lib/uploads";

const CreateBusinessSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().min(10).max(4000),
  category: z.enum(BUSINESS_CATEGORIES),
  languages: z.array(z.enum(CONTENT_LANGUAGES)).min(1),
  primaryLanguage: z.enum(CONTENT_LANGUAGES),
  websiteUrl: z.string().url().optional().or(z.literal("")),
  links: z.array(z.string().url()).default([]),
  domain: z
    .string()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i)
    .optional()
    .or(z.literal("")),
  targetRegion: z.string().max(80).optional().or(z.literal("")),
  timezone: z.string().min(1).default("UTC"),
});

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "business"
  );
}

// Slugs are looked up globally (getBusinessBySlug has no userId to scope by), so they must
// be unique across all users, not just within one - hence no userId parameter here.
async function uniqueSlug(base: string): Promise<string> {
  const db = getDb();
  let slug = base;
  let n = 2;
  for (;;) {
    const [existing] = await db
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.slug, slug))
      .limit(1);
    if (!existing) return slug;
    slug = `${base}-${n++}`;
  }
}

export type CreateBusinessState = { error?: string } | undefined;

export async function createBusinessAction(
  _prevState: CreateBusinessState,
  formData: FormData,
): Promise<CreateBusinessState> {
  const user = await requireUser();

  const links = String(formData.get("links") ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const languages = formData.getAll("languages").map(String);

  const parsed = CreateBusinessSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    category: formData.get("category"),
    languages,
    primaryLanguage: formData.get("primaryLanguage"),
    websiteUrl: formData.get("websiteUrl") ?? "",
    links,
    domain: formData.get("domain") ?? "",
    targetRegion: formData.get("targetRegion") ?? "",
    timezone: formData.get("timezone") ?? "UTC",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  }
  const input = parsed.data;

  const db = getDb();
  const slug = await uniqueSlug(slugify(input.name));

  const [row] = await db
    .insert(businesses)
    .values({
      userId: user.id,
      name: input.name,
      slug,
      description: input.description,
      category: input.category,
      languages: input.languages,
      primaryLanguage: input.primaryLanguage,
      websiteUrl: input.websiteUrl || null,
      links: input.links,
      domain: input.domain || null,
      targetRegion: input.targetRegion || null,
      timezone: input.timezone,
    })
    .returning();

  if (!row) {
    return { error: "Could not create the business. Try again." };
  }

  // Uploaded after the insert so the stored object is keyed by the business it belongs to.
  const image = formData.get("image");
  if (image instanceof File) {
    try {
      const imageUrl = await saveImageUpload(image, row.id);
      if (imageUrl) await db.update(businesses).set({ imageUrl }).where(eq(businesses.id, row.id));
    } catch (err) {
      if (err instanceof UploadRejectedError) {
        await db.delete(businesses).where(eq(businesses.id, row.id));
        return { error: err.message };
      }
      throw err;
    }
  }

  await enqueue("discover_business", { businessId: row.id, reason: "initial" });

  redirect(`/b/${row.slug}/strategy`);
}
