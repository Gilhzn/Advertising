/**
 * OpenAI Images API (`gpt-image-1`). Request/response shape below is per the task spec; the docs site
 * is not reachable from this sandbox (network egress to platform.openai.com is blocked) so it is
 * UNVERIFIED against the live API - see NOTES.md. Do not change this file's request shape without
 * re-checking the docs.
 */
import sharp from "sharp";
import { ASPECT_SIZES, type Aspect } from "../types.js";
import type { ImageGenInput, ImageGenOutput, ImageGenProvider } from "./types.js";
import { ImageGenError } from "./types.js";
import { readErrorBody, timedFetch } from "./util.js";

const ENDPOINT = "https://api.openai.com/v1/images/generations";
const MODEL = "gpt-image-1";

/** gpt-image-1 only accepts these three sizes; we crop to the exact ASPECT_SIZES afterwards. */
type OpenAiSize = "1024x1024" | "1024x1536" | "1536x1024";

function sizeForAspect(aspect: Aspect): OpenAiSize {
  switch (aspect) {
    case "1:1":
      return "1024x1024";
    case "4:5":
    case "9:16":
      return "1024x1536";
    case "16:9":
    case "1.91:1":
      return "1536x1024";
    default:
      return "1024x1024";
  }
}

function statusToCode(status: number): "auth" | "rate_limited" | "invalid_request" | "network" | "unknown" {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "network";
  if (status >= 400) return "invalid_request";
  return "unknown";
}

interface OpenAiImagesResponse {
  data?: Array<{ b64_json?: string }>;
}

export class OpenAiImageProvider implements ImageGenProvider {
  readonly id = "openai";

  constructor(private readonly apiKey: string) {}

  async generate(input: ImageGenInput): Promise<ImageGenOutput> {
    const size = sizeForAspect(input.aspect);
    const res = await timedFetch(
      ENDPOINT,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: MODEL, prompt: input.prompt, size, n: 1 }),
      },
      { provider: this.id, apiKey: this.apiKey },
    );

    if (!res.ok) {
      const detail = await readErrorBody(res, this.apiKey);
      const code = statusToCode(res.status);
      throw new ImageGenError(
        `openai images HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
        this.id,
        code,
        code === "rate_limited" || code === "network",
      );
    }

    const body = (await res.json()) as OpenAiImagesResponse;
    const b64 = body.data?.[0]?.b64_json;
    if (!b64) {
      throw new ImageGenError(
        "openai images response carried no data[0].b64_json",
        this.id,
        "unknown",
        false,
      );
    }

    const raw = Buffer.from(b64, "base64");
    const target = ASPECT_SIZES[input.aspect];
    const cropped = await sharp(raw)
      .resize(target.width, target.height, { fit: "cover", position: "attention" })
      .png()
      .toBuffer();

    return { buffer: cropped, mimeType: "image/png", width: target.width, height: target.height };
  }
}
