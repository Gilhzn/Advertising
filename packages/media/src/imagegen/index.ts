/**
 * Optional image-generation plugin, behind `IMAGE_GEN_PROVIDER` (plan: "ספק image-gen חיצוני = plugin
 * אופציונלי מאחורי IMAGE_GEN_PROVIDER"). `none` (default) disables it entirely - no network calls, no
 * agent tool. Providers are stateless per call; nothing is cached across requests so tests can flip
 * env vars freely.
 */
import type { Aspect } from "../types.js";
import { uploadMediaImpl } from "../upload.js";
import { FalImageProvider } from "./fal.js";
import { OpenAiImageProvider } from "./openai.js";
import type { ImageGenProvider } from "./types.js";

export type { ImageGenErrorCode, ImageGenInput, ImageGenOutput, ImageGenProvider } from "./types.js";
export { ImageGenError } from "./types.js";

export type ImageGenProviderId = "none" | "openai" | "fal";

/**
 * Builds the configured provider from `IMAGE_GEN_PROVIDER` (`none` | `openai` | `fal`) and
 * `IMAGE_GEN_API_KEY`. Returns `null` for `none`, an unknown value, or a missing key - image
 * generation is opt-in and fails closed.
 */
export function getImageGenProvider(): ImageGenProvider | null {
  const kind = (process.env.IMAGE_GEN_PROVIDER ?? "none").trim().toLowerCase();
  if (kind === "" || kind === "none") return null;
  const apiKey = process.env.IMAGE_GEN_API_KEY;
  if (!apiKey) return null;
  if (kind === "openai") return new OpenAiImageProvider(apiKey);
  if (kind === "fal") return new FalImageProvider(apiKey);
  return null;
}

export function isImageGenEnabled(): boolean {
  return getImageGenProvider() !== null;
}

export interface GenerateAndUploadInput {
  businessId: string;
  prompt: string;
  aspect: Aspect;
  negativePrompt?: string;
  seed?: number;
  /** optional deterministic key for idempotency, forwarded to `uploadMedia` */
  key?: string;
}

export interface GenerateAndUploadOutput {
  url: string;
  width: number;
  height: number;
}

function extFromMime(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

/** Generates one image through the configured provider and uploads it via the shared media store. */
export async function generateAndUpload(input: GenerateAndUploadInput): Promise<GenerateAndUploadOutput> {
  const provider = getImageGenProvider();
  if (!provider) {
    throw new Error("image generation is not enabled (set IMAGE_GEN_PROVIDER and IMAGE_GEN_API_KEY)");
  }
  const generated = await provider.generate({
    prompt: input.prompt,
    aspect: input.aspect,
    ...(input.negativePrompt ? { negativePrompt: input.negativePrompt } : {}),
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
  });
  const uploaded = await uploadMediaImpl({
    businessId: input.businessId,
    buffer: generated.buffer,
    contentType: generated.mimeType,
    ext: extFromMime(generated.mimeType),
    ...(input.key ? { key: input.key } : {}),
  });
  return { url: uploaded.url, width: generated.width, height: generated.height };
}
