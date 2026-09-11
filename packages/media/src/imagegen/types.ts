/**
 * Optional image-generation plugin contract. A provider turns a text prompt into a raster image;
 * `index.ts` picks the configured one (or none) and wires it to `uploadMedia`.
 */
import type { Aspect } from "../types.js";

export interface ImageGenInput {
  prompt: string;
  aspect: Aspect;
  /** things the image must avoid, e.g. "text, watermark, logo" */
  negativePrompt?: string;
  /** for reproducibility where the provider supports it */
  seed?: number;
}

export interface ImageGenOutput {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
}

export interface ImageGenProvider {
  readonly id: string;
  generate(input: ImageGenInput): Promise<ImageGenOutput>;
}

export type ImageGenErrorCode =
  | "auth"
  | "rate_limited"
  | "invalid_request"
  | "network"
  | "unsupported"
  | "unknown";

/** Typed error every provider throws instead of a bare Error; never carries the API key. */
export class ImageGenError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly code: ImageGenErrorCode,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "ImageGenError";
  }
}
