/**
 * Media rendering + storage contract. Implemented in this package (satori + resvg templates, R2/S3
 * upload with local-disk fallback). The visual-director agent tool `render_image` calls renderTemplate
 * + uploadMedia.
 */
export type {
  Aspect,
  BrandStyle,
  RenderInput,
  RenderOutput,
  TemplateId,
  UploadInput,
  UploadOutput,
} from "./types.js";
export { ASPECT_SIZES } from "./types.js";

import { renderTemplateImpl } from "./render.js";
import type { RenderInput, RenderOutput, UploadInput, UploadOutput } from "./types.js";
import { uploadMediaImpl } from "./upload.js";

export async function renderTemplate(input: RenderInput): Promise<RenderOutput> {
  return renderTemplateImpl(input);
}

export async function uploadMedia(input: UploadInput): Promise<UploadOutput> {
  return uploadMediaImpl(input);
}

export * from "./imagegen/index.js";

export { activeUploadBackend, type UploadBackend } from "./upload.js";
