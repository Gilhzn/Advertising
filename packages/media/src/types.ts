/**
 * Media rendering + storage contract types. See `index.ts` for the public surface re-export and
 * `render.ts` / `upload.ts` for the implementation.
 */
export type TemplateId =
  | "announcement"
  | "quote"
  | "feature"
  | "before_after"
  | "stat"
  | "plain_photo"
  | "avatar"
  | "banner";
export type Aspect = "1:1" | "4:5" | "16:9" | "9:16" | "1.91:1" | "3:1";

export interface BrandStyle {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  /** optional logo/product image (public URL or data URI) */
  imageUrl?: string | null;
  fontFamily?: string;
  /** "rtl" for Hebrew */
  direction?: "ltr" | "rtl";
}

export interface RenderInput {
  template: TemplateId;
  aspect: Aspect;
  headline: string;
  subheadline?: string;
  body?: string;
  cta?: string;
  /** e.g. "4.9 ★" for the stat template */
  stat?: string;
  brand: BrandStyle;
  businessName: string;
}

export interface RenderOutput {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: "image/png";
}

export interface UploadInput {
  businessId: string;
  buffer: Buffer;
  contentType: string;
  /** file extension without dot */
  ext: string;
  /** optional deterministic key for idempotency */
  key?: string;
}

export interface UploadOutput {
  url: string;
  key: string;
}

export const ASPECT_SIZES: Record<Aspect, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 1080, height: 1920 },
  "1.91:1": { width: 1200, height: 628 },
  /** brand banner (avatar/banner download assets) */
  "3:1": { width: 1500, height: 500 },
};
