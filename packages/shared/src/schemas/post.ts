import { z } from "zod";
import { CONTENT_LANGUAGES, PLATFORM_IDS } from "../platforms.js";

export const POST_STATUSES = [
  "draft",
  "awaiting_approval",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "rejected",
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const MediaAssetSchema = z.object({
  kind: z.enum(["image", "video"]),
  url: z.url(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  altText: z.string().max(1000).optional(),
  mimeType: z.string().optional(),
});
export type MediaAsset = z.infer<typeof MediaAssetSchema>;

export const PostDraftSchema = z.object({
  platform: z.enum(PLATFORM_IDS),
  language: z.enum(CONTENT_LANGUAGES),
  pillarId: z.string(),
  title: z.string().max(300).optional(),
  body: z.string().min(1),
  hashtags: z.array(z.string()).default([]),
  linkUrl: z.url().optional(),
  media: z.array(MediaAssetSchema).default([]),
  variantGroup: z.string().optional(),
  variantLabel: z.string().optional(),
  scheduledAt: z.iso.datetime().optional(),
  rationale: z.string().optional(),
});
export type PostDraft = z.infer<typeof PostDraftSchema>;

export const ComplianceResultSchema = z.object({
  verdict: z.enum(["pass", "fix", "block"]),
  issues: z.array(
    z.object({ rule: z.string(), severity: z.enum(["low", "medium", "high"]), detail: z.string() }),
  ),
  suggestedBody: z.string().optional(),
});
export type ComplianceResult = z.infer<typeof ComplianceResultSchema>;
