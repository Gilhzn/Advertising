import { z } from "zod";
import { BUSINESS_CATEGORIES, CONTENT_LANGUAGES, PLATFORM_IDS } from "../platforms.js";

export const BusinessInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().min(10).max(4000),
  category: z.enum(BUSINESS_CATEGORIES).default("other"),
  languages: z.array(z.enum(CONTENT_LANGUAGES)).min(1).default(["en"]),
  primaryLanguage: z.enum(CONTENT_LANGUAGES).default("en"),
  websiteUrl: z.url().optional(),
  links: z.array(z.url()).default([]),
  imageUrl: z.url().optional(),
  domain: z
    .string()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i)
    .optional(),
  targetRegion: z.string().max(80).optional(),
});
export type BusinessInput = z.infer<typeof BusinessInputSchema>;

/** Output of the Strategist's deep discovery */
export const BrandKitSchema = z.object({
  positioning: z.string(),
  uniqueSellingPoints: z.array(z.string()).min(1).max(8),
  targetAudiences: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        painPoints: z.array(z.string()),
        whereTheyHangOut: z.array(z.string()),
      }),
    )
    .min(1),
  toneOfVoice: z.object({
    adjectives: z.array(z.string()).min(2).max(6),
    dos: z.array(z.string()),
    donts: z.array(z.string()),
  }),
  handleSuggestions: z
    .array(z.string().regex(/^[a-z0-9_.]{3,30}$/))
    .min(3)
    .max(8),
  tagline: z.string().max(120),
  bios: z.record(z.enum(PLATFORM_IDS), z.object({ short: z.string(), long: z.string().optional() })),
  palette: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    background: z.string(),
    text: z.string(),
  }),
  visualStyle: z.string(),
  keywords: z.array(z.string()).max(30),
  hashtags: z.array(z.string().regex(/^#\S+$/)).max(30),
});
export type BrandKit = z.infer<typeof BrandKitSchema>;

export const ContentPillarSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  description: z.string(),
  share: z.number().min(0).max(1),
  exampleAngles: z.array(z.string()).min(1),
});

export const ChannelPlanSchema = z.object({
  platforms: z
    .array(
      z.object({
        platform: z.enum(PLATFORM_IDS),
        priority: z.enum(["core", "secondary", "experimental"]),
        rationale: z.string(),
        postsPerWeek: z.number().int().min(0).max(21),
        bestTimesLocal: z.array(z.string()),
        formats: z.array(z.string()),
      }),
    )
    .min(1),
  communities: z.array(
    z.object({
      platform: z.enum(PLATFORM_IDS),
      name: z.string(),
      url: z.url().optional(),
      audienceFit: z.string(),
      rulesSummary: z.string(),
      approvalRequired: z.literal(true),
    }),
  ),
  pillars: z.array(ContentPillarSchema).min(2).max(6),
  weeklyCadence: z.number().int().min(1).max(60),
  launchPlan: z.array(
    z.object({
      day: z.number().int().min(0).max(60),
      action: z.string(),
      platform: z.enum(PLATFORM_IDS).optional(),
    }),
  ),
  kpis: z.array(z.object({ name: z.string(), target: z.string(), why: z.string() })),
});
export type ChannelPlan = z.infer<typeof ChannelPlanSchema>;
