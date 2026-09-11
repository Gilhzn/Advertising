import type { BrandKit, PlatformId } from "@adv/shared";

export interface WizardContext {
  businessName: string;
  websiteUrl?: string | null;
  contactEmail?: string | null;
}

/** Short bio for a platform, falling back to the tagline and then the business name. */
export function bioFor(brandKit: BrandKit | null, platform: PlatformId, ctx: WizardContext): string {
  const bio = brandKit?.bios?.[platform];
  if (bio?.short) return bio.short;
  if (brandKit?.tagline) return brandKit.tagline;
  return `${ctx.businessName}${ctx.websiteUrl ? ` - ${ctx.websiteUrl}` : ""}`;
}

/** Longer bio where the platform allows one (Facebook Page "about", LinkedIn). */
export function longBioFor(brandKit: BrandKit | null, platform: PlatformId, ctx: WizardContext): string {
  return brandKit?.bios?.[platform]?.long ?? bioFor(brandKit, platform, ctx);
}

export function taglineOf(brandKit: BrandKit | null, ctx: WizardContext): string {
  return brandKit?.tagline ?? ctx.businessName;
}

const HANDLE_FALLBACK = /[^a-z0-9]+/g;

/** Suggested handles, falling back to a slug of the business name. */
export function handleSuggestions(brandKit: BrandKit | null, ctx: WizardContext, count = 3): string[] {
  const suggested = brandKit?.handleSuggestions ?? [];
  if (suggested.length >= count) return suggested.slice(0, count);
  const slug = ctx.businessName.toLowerCase().replace(HANDLE_FALLBACK, "").slice(0, 24) || "mybrand";
  const generated = [slug, `${slug}app`, `${slug}hq`, `get${slug}`];
  return [...new Set([...suggested, ...generated])].slice(0, count);
}

export function primaryHandle(brandKit: BrandKit | null, ctx: WizardContext): string {
  return handleSuggestions(brandKit, ctx, 1)[0] as string;
}

/** Hashtags for wizard prefills (profile bios etc.), already `#`-prefixed. */
export function brandHashtags(brandKit: BrandKit | null, count = 3): string[] {
  return (brandKit?.hashtags ?? []).slice(0, count);
}
