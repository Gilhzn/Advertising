/** Small helpers shared by the image-gen providers. Self-contained: this package does not depend on
 * `@adv/connectors`, so it does not reuse that package's `http.ts` (same redaction idea, kept local). */
import { logger } from "@adv/shared";
import { ImageGenError } from "./types.js";

const DEFAULT_TIMEOUT_MS = 60_000;

/** Never let an API key reach a log line or an error message. */
export function redactKey(input: string, key: string | undefined): string {
  if (!key) return input;
  return input.split(key).join("***");
}

export interface TimedFetchOptions {
  provider: string;
  timeoutMs?: number;
  apiKey?: string;
}

/**
 * `fetch` with an abort timeout, mapping network/timeout failures onto {@link ImageGenError}. Callers
 * still need to check `res.ok` themselves since HTTP-status mapping differs per provider.
 */
export async function timedFetch(url: string, init: RequestInit, opts: TimedFetchOptions): Promise<Response> {
  const { provider, timeoutMs = DEFAULT_TIMEOUT_MS, apiKey } = opts;
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const safe = redactKey(message, apiKey);
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    logger.warn({ provider, url: redactKey(url, apiKey) }, `image-gen request failed: ${safe}`);
    throw new ImageGenError(
      isTimeout ? `${provider} request timed out after ${timeoutMs}ms` : `${provider} network error: ${safe}`,
      provider,
      "network",
      true,
    );
  }
}

/** Downloads a remote image (fal.ai returns a URL, not bytes) with a hard size cap. */
export async function downloadCapped(
  url: string,
  maxBytes: number,
  opts: TimedFetchOptions,
): Promise<Buffer> {
  const res = await timedFetch(url, { method: "GET" }, opts);
  if (!res.ok) {
    throw new ImageGenError(
      `${opts.provider} image download failed with HTTP ${res.status}`,
      opts.provider,
      "network",
      res.status >= 500,
    );
  }
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    throw new ImageGenError(
      `${opts.provider} image is ${declared} bytes, over the ${maxBytes} byte cap`,
      opts.provider,
      "invalid_request",
      false,
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) {
    throw new ImageGenError(
      `${opts.provider} image is ${buf.byteLength} bytes, over the ${maxBytes} byte cap`,
      opts.provider,
      "invalid_request",
      false,
    );
  }
  return buf;
}

/** Best-effort error message extraction from a JSON (or text) error body, key-redacted. */
export async function readErrorBody(res: Response, apiKey: string | undefined): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return "";
    try {
      const body = JSON.parse(text) as Record<string, unknown>;
      const err = body.error;
      if (typeof err === "string") return redactKey(err, apiKey);
      if (err && typeof err === "object") {
        const msg = (err as Record<string, unknown>).message;
        if (typeof msg === "string") return redactKey(msg, apiKey);
      }
      if (typeof body.message === "string") return redactKey(body.message, apiKey);
      return redactKey(text.slice(0, 500), apiKey);
    } catch {
      return redactKey(text.slice(0, 500), apiKey);
    }
  } catch {
    return "";
  }
}
