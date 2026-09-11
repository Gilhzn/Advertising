import { Buffer } from "node:buffer";
import { logger, type PlatformId } from "@adv/shared";
import { ConnectorError } from "./connector.js";

/** Hard ceiling for anything we download and re-upload to a platform. */
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BASE_BACKOFF_MS = 500;
/** If a server asks us to wait longer than this we give up and let the job queue reschedule. */
const DEFAULT_MAX_RETRY_WAIT_MS = 30_000;

export interface HttpOptions {
  platform: PlatformId;
  timeoutMs?: number;
  retries?: number;
  /** Extra structured-log fields, e.g. { businessId, jobId, accountId }. */
  context?: Record<string, unknown>;
  /** Base for the exponential backoff between retries (ms). */
  baseBackoffMs?: number;
  /** Longest we are willing to sleep inside a single call. */
  maxRetryWaitMs?: number;
  /**
   * Some APIs put the retry delay in the JSON body instead of `Retry-After`
   * (Telegram `parameters.retry_after`, Discord `retry_after`). Return seconds.
   */
  retryAfterFrom?: (body: unknown) => number | undefined;
  /** Map a non-2xx response to a ConnectorError yourself; return undefined to use the default mapping. */
  mapError?: (status: number, body: unknown) => ConnectorError | undefined;
  /** Treat a 2xx body as an error (Telegram answers 200 with `{ok:false}` in some edge cases). */
  checkBody?: (body: unknown, status: number) => ConnectorError | undefined;
}

export interface JsonResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

/* ------------------------------------------------------------------ */
/* redaction                                                           */
/* ------------------------------------------------------------------ */

const SECRET_QUERY_KEYS = new Set([
  "access_token",
  "app_access_token",
  "client_secret",
  "code",
  "code_verifier",
  "fb_exchange_token",
  "input_token",
  "key",
  "password",
  "refresh_token",
  "secret",
  "token",
]);

/** Removes credentials from a URL so it is safe to log. Never logs headers. */
export function redactUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return "<invalid-url>";
  }
  for (const key of [...url.searchParams.keys()]) {
    if (SECRET_QUERY_KEYS.has(key.toLowerCase())) url.searchParams.set(key, "***");
  }
  let path = url.pathname;
  // Telegram: https://api.telegram.org/bot<token>/sendMessage
  path = path.replace(/\/bot[^/]+/i, "/bot***");
  // Discord: https://discord.com/api/webhooks/<id>/<token>
  path = path.replace(/(\/webhooks\/\d+)\/[^/?]+/i, "$1/***");
  // LinkedIn / Meta signed upload URLs carry the credential in the path.
  path = path.replace(/\/(uploads?|signed)\/[^/?]{20,}/i, "/$1/***");
  url.pathname = path;
  url.username = "";
  url.password = "";
  return url.toString();
}

const SECRET_PATTERNS: RegExp[] = [
  /("?(?:access_token|refresh_token|client_secret|accessJwt|refreshJwt|app_password|password|token)"?\s*[:=]\s*"?)([^",&\s}]+)/gi,
  /(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi,
];

/** Scrubs anything token-shaped out of a string before it reaches a log or an Error message. */
export function redactSecrets(input: string): string {
  let out = input;
  for (const re of SECRET_PATTERNS) out = out.replace(re, (_m, p1: string) => `${p1}***`);
  return out;
}

/* ------------------------------------------------------------------ */
/* timing                                                              */
/* ------------------------------------------------------------------ */

/**
 * Multiplier applied to every retry sleep. Production leaves it at 1;
 * tests set `CONNECTOR_RETRY_TIME_SCALE=0` so retry paths run instantly.
 */
function timeScale(): number {
  const raw = process.env.CONNECTOR_RETRY_TIME_SCALE;
  if (raw === undefined) return 1;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

export function sleep(ms: number): Promise<void> {
  const actual = Math.max(0, Math.round(ms * timeScale()));
  return new Promise((resolve) => setTimeout(resolve, actual));
}

/** Parses `Retry-After` in both delta-seconds and HTTP-date form. Returns ms. */
export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function backoffMs(attempt: number, base: number): number {
  const exp = base * 2 ** attempt;
  return Math.round(exp * (0.5 + Math.random() / 2)); // full-ish jitter
}

/* ------------------------------------------------------------------ */
/* error mapping                                                       */
/* ------------------------------------------------------------------ */

function bodyMessage(body: unknown): string {
  if (typeof body === "string") return body.slice(0, 500);
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const candidates = [b.error_description, b.message, b.description, b.error, b.detail];
    for (const c of candidates) {
      if (typeof c === "string") return c.slice(0, 500);
      if (c && typeof c === "object") {
        const m = (c as Record<string, unknown>).message;
        if (typeof m === "string") return m.slice(0, 500);
      }
    }
    try {
      return JSON.stringify(body).slice(0, 500);
    } catch {
      return "<unserialisable body>";
    }
  }
  return "";
}

export function statusToCode(status: number): ConnectorError["code"] {
  if (status === 401) return "auth_expired";
  if (status === 403) return "auth_expired";
  if (status === 404) return "not_configured";
  if (status === 413 || status === 415) return "invalid_media";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "network";
  if (status >= 400) return "rejected";
  return "unknown";
}

export function toConnectorError(
  platform: PlatformId,
  status: number,
  body: unknown,
  retryAfterMs?: number,
): ConnectorError {
  const code = statusToCode(status);
  const retryable = code === "rate_limited" || code === "network";
  const detail = redactSecrets(bodyMessage(body));
  return new ConnectorError(
    `${platform} HTTP ${status}${detail ? `: ${detail}` : ""}`,
    platform,
    code,
    retryable,
    retryAfterMs,
  );
}

/* ------------------------------------------------------------------ */
/* fetchJson                                                           */
/* ------------------------------------------------------------------ */

async function readBody(res: Response): Promise<unknown> {
  const type = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (!text) return undefined;
  if (type.includes("json") || text.startsWith("{") || text.startsWith("[")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

/**
 * The only way this package talks HTTP. Adds an AbortController timeout, retries
 * 429/5xx/network failures with exponential backoff that honours `Retry-After`,
 * maps everything else onto {@link ConnectorError}, and logs structurally with
 * the URL redacted. Request headers are never logged.
 */
export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  opts: HttpOptions,
): Promise<JsonResponse<T>> {
  const {
    platform,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    context = {},
    baseBackoffMs = DEFAULT_BASE_BACKOFF_MS,
    maxRetryWaitMs = DEFAULT_MAX_RETRY_WAIT_MS,
    retryAfterFrom,
    mapError,
    checkBody,
  } = opts;

  const safeUrl = redactUrl(url);
  const method = (init.method ?? "GET").toUpperCase();
  let lastError: ConnectorError | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      const aborted = controller.signal.aborted;
      lastError = new ConnectorError(
        aborted
          ? `${platform} request timed out after ${timeoutMs}ms`
          : `${platform} network error: ${redactSecrets(err instanceof Error ? err.message : String(err))}`,
        platform,
        "network",
        true,
      );
      logger.warn(
        { ...context, platform, method, url: safeUrl, attempt, aborted, durationMs: Date.now() - startedAt },
        "connector.http.network_error",
      );
      if (attempt < retries) {
        await sleep(backoffMs(attempt, baseBackoffMs));
        continue;
      }
      throw lastError;
    }
    clearTimeout(timer);

    const body = await readBody(res);
    const durationMs = Date.now() - startedAt;

    if (res.ok) {
      const bodyError = checkBody?.(body, res.status);
      if (!bodyError) {
        logger.debug(
          { ...context, platform, method, url: safeUrl, status: res.status, attempt, durationMs },
          "connector.http.ok",
        );
        return { data: body as T, status: res.status, headers: res.headers };
      }
      lastError = bodyError;
      logger.warn(
        { ...context, platform, method, url: safeUrl, status: res.status, attempt, code: bodyError.code },
        "connector.http.body_error",
      );
      if (bodyError.retryable && attempt < retries) {
        await sleep(Math.min(bodyError.retryAfterMs ?? backoffMs(attempt, baseBackoffMs), maxRetryWaitMs));
        continue;
      }
      throw bodyError;
    }

    const retryAfterSeconds = retryAfterFrom?.(body);
    const retryAfterMs =
      retryAfterSeconds !== undefined && Number.isFinite(retryAfterSeconds)
        ? Math.max(0, retryAfterSeconds * 1000)
        : parseRetryAfter(res.headers.get("retry-after"));

    const error = mapError?.(res.status, body) ?? toConnectorError(platform, res.status, body, retryAfterMs);
    lastError = error;

    logger.warn(
      {
        ...context,
        platform,
        method,
        url: safeUrl,
        status: res.status,
        attempt,
        durationMs,
        code: error.code,
        retryAfterMs,
      },
      "connector.http.error",
    );

    const canRetry = error.retryable && attempt < retries;
    if (canRetry) {
      const wait = retryAfterMs ?? backoffMs(attempt, baseBackoffMs);
      if (wait > maxRetryWaitMs) {
        // Waiting inline would block the worker; hand it back to the scheduler.
        throw new ConnectorError(error.message, platform, error.code, true, wait);
      }
      await sleep(wait);
      continue;
    }
    throw error;
  }

  /* c8 ignore next */
  throw lastError ?? new ConnectorError(`${platform} request failed`, platform, "unknown", false);
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** POST `application/x-www-form-urlencoded`. Undefined/null fields are dropped. */
export function postForm<T>(
  url: string,
  fields: Record<string, string | number | boolean | undefined | null>,
  opts: HttpOptions & { headers?: Record<string, string> },
): Promise<JsonResponse<T>> {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    form.set(k, String(v));
  }
  return fetchJson<T>(
    url,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        ...(opts.headers ?? {}),
      },
      body: form.toString(),
    },
    opts,
  );
}

export interface MultipartFile {
  /** form field name, e.g. "photo" or "file" */
  field: string;
  filename: string;
  contentType: string;
  data: Uint8Array;
}

/** POST `multipart/form-data` with a single binary part plus scalar fields. */
export function uploadMultipart<T>(
  url: string,
  fields: Record<string, string | number | boolean | undefined | null>,
  file: MultipartFile,
  opts: HttpOptions & { headers?: Record<string, string> },
): Promise<JsonResponse<T>> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    form.set(k, String(v));
  }
  // Copy into a fresh ArrayBuffer so a Buffer view over a pooled allocation is not sent whole.
  const bytes = new Uint8Array(file.data.byteLength);
  bytes.set(file.data);
  form.set(file.field, new Blob([bytes], { type: file.contentType }), file.filename);
  // Content-Type (with boundary) is set by fetch from the FormData body.
  return fetchJson<T>(url, { method: "POST", headers: opts.headers, body: form }, opts);
}

export interface DownloadedMedia {
  buffer: Buffer;
  mimeType: string;
}

const EXT_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

function guessMime(url: string): string {
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();
  for (const [ext, mime] of Object.entries(EXT_MIME)) if (path.endsWith(ext)) return mime;
  return "application/octet-stream";
}

/**
 * Downloads a public media URL (our R2 bucket, normally) with a hard
 * {@link MAX_MEDIA_BYTES} cap enforced while streaming, so an oversized asset
 * never lands in memory.
 */
export async function downloadMedia(
  url: string,
  opts: { platform: PlatformId; timeoutMs?: number; maxBytes?: number; context?: Record<string, unknown> },
): Promise<DownloadedMedia> {
  const { platform, timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = MAX_MEDIA_BYTES, context = {} } = opts;
  const safeUrl = redactUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } catch (err) {
      const aborted = controller.signal.aborted;
      throw new ConnectorError(
        aborted
          ? `${platform} media download timed out after ${timeoutMs}ms`
          : `${platform} media download failed: ${redactSecrets(err instanceof Error ? err.message : String(err))}`,
        platform,
        "network",
        true,
      );
    }

    if (!res.ok) {
      throw new ConnectorError(
        `${platform} media download failed with HTTP ${res.status} for ${safeUrl}`,
        platform,
        res.status >= 500 ? "network" : "invalid_media",
        res.status >= 500,
      );
    }

    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new ConnectorError(
        `${platform} media is ${declared} bytes, over the ${maxBytes} byte limit`,
        platform,
        "invalid_media",
        false,
      );
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new ConnectorError(
            `${platform} media exceeds the ${maxBytes} byte limit`,
            platform,
            "invalid_media",
            false,
          );
        }
        chunks.push(value);
      }
    } else {
      const ab = new Uint8Array(await res.arrayBuffer());
      if (ab.byteLength > maxBytes) {
        throw new ConnectorError(
          `${platform} media exceeds the ${maxBytes} byte limit`,
          platform,
          "invalid_media",
          false,
        );
      }
      total = ab.byteLength;
      chunks.push(ab);
    }

    // R2 and some CDNs serve unknown types as octet-stream; fall back to the extension then.
    const declaredType = (res.headers.get("content-type") ?? "").split(";")[0]?.trim();
    const mimeType =
      !declaredType || declaredType === "application/octet-stream" ? guessMime(url) : declaredType;
    logger.debug(
      { ...context, platform, url: safeUrl, bytes: total, mimeType },
      "connector.media.downloaded",
    );
    return { buffer: Buffer.concat(chunks), mimeType };
  } finally {
    clearTimeout(timer);
  }
}
