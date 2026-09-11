/**
 * fal.ai `fal-ai/flux/schnell` endpoint. Request/response shape below is per the task spec; the docs
 * site is not reachable from this sandbox (network egress to fal.ai is blocked) so it is UNVERIFIED
 * against the live API - see NOTES.md. Do not change this file's request shape without re-checking
 * the docs.
 */
import sharp from "sharp";
import { ASPECT_SIZES } from "../types.js";
import type { ImageGenInput, ImageGenOutput, ImageGenProvider } from "./types.js";
import { ImageGenError } from "./types.js";
import { downloadCapped, readErrorBody, timedFetch } from "./util.js";

const ENDPOINT = "https://fal.run/fal-ai/flux/schnell";
/** Cap on the generated image download, per the task spec. */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function statusToCode(status: number): "auth" | "rate_limited" | "invalid_request" | "network" | "unknown" {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "network";
  if (status >= 400) return "invalid_request";
  return "unknown";
}

interface FalImagesResponse {
  images?: Array<{ url?: string }>;
}

export class FalImageProvider implements ImageGenProvider {
  readonly id = "fal";

  constructor(private readonly apiKey: string) {}

  async generate(input: ImageGenInput): Promise<ImageGenOutput> {
    const target = ASPECT_SIZES[input.aspect];
    const res = await timedFetch(
      ENDPOINT,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: input.prompt,
          image_size: { width: target.width, height: target.height },
          num_images: 1,
          ...(input.seed !== undefined ? { seed: input.seed } : {}),
        }),
      },
      { provider: this.id, apiKey: this.apiKey },
    );

    if (!res.ok) {
      const detail = await readErrorBody(res, this.apiKey);
      const code = statusToCode(res.status);
      throw new ImageGenError(
        `fal flux/schnell HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
        this.id,
        code,
        code === "rate_limited" || code === "network",
      );
    }

    const body = (await res.json()) as FalImagesResponse;
    const imageUrl = body.images?.[0]?.url;
    if (!imageUrl) {
      throw new ImageGenError(
        "fal flux/schnell response carried no images[0].url",
        this.id,
        "unknown",
        false,
      );
    }

    const buffer = await downloadCapped(imageUrl, MAX_IMAGE_BYTES, {
      provider: this.id,
      apiKey: this.apiKey,
    });
    const meta = await sharp(buffer).metadata();
    return {
      buffer,
      mimeType: meta.format ? `image/${meta.format}` : "image/png",
      width: meta.width ?? target.width,
      height: meta.height ?? target.height,
    };
  }
}
