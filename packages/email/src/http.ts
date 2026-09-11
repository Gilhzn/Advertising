import { logger as defaultLogger, type Logger } from "@adv/shared";
import { EmailProviderError, type EmailProviderName } from "./errors.js";

export interface JsonRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
  logger?: Logger;
  /** Provider name used for error attribution and log fields. */
  provider: EmailProviderName;
  /** HTTP status codes that should be retried (in addition to network errors/timeouts). */
  retryStatuses?: number[];
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_STATUSES = [429, 500, 502, 503, 504];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Minimal fetch wrapper (timeout + bounded retries + structured errors +
 * logging without secrets) for the email package's HTTP clients. There is no
 * shared `packages/connectors/src/http.ts` in this repo yet, and this
 * package may only write inside `packages/email` — see NOTES.md.
 */
export async function requestJson<T>(url: string, opts: JsonRequestOptions): Promise<T> {
  const {
    method = "GET",
    headers = {},
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    fetchImpl = fetch,
    logger = defaultLogger,
    provider,
    retryStatuses = DEFAULT_RETRY_STATUSES,
  } = opts;

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method,
        headers: {
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const retryable = retryStatuses.includes(res.status);
        if (retryable && attempt < retries) {
          logger.warn(
            { provider, status: res.status, attempt, url: safeUrl(url) },
            "email provider request retrying",
          );
          attempt++;
          await sleep(backoffMs(attempt));
          continue;
        }
        throw new EmailProviderError(
          `${provider} request failed: ${method} ${safeUrl(url)} -> ${res.status} ${truncate(text)}`,
          provider,
          res.status === 404 ? "not_found" : res.status === 429 ? "rate_limited" : "invalid_response",
          retryable,
          res.status,
        );
      }

      if (res.status === 204) return undefined as T;
      const text = await res.text();
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new EmailProviderError(
          `${provider} returned non-JSON response for ${method} ${safeUrl(url)}`,
          provider,
          "invalid_response",
          false,
        );
      }
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof EmailProviderError) throw err;
      lastError = err;
      const isAbort = err instanceof Error && err.name === "AbortError";
      if (attempt < retries) {
        logger.warn(
          { provider, attempt, url: safeUrl(url), reason: isAbort ? "timeout" : "network" },
          "email provider request retrying after error",
        );
        attempt++;
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new EmailProviderError(
        `${provider} request ${isAbort ? "timed out" : "failed"}: ${method} ${safeUrl(url)}`,
        provider,
        "network",
        false,
      );
    }
  }

  if (lastError instanceof Error) {
    throw new EmailProviderError(
      `${provider} request failed after retries: ${lastError.message}`,
      provider,
      "network",
      false,
    );
  }
  throw new EmailProviderError(`${provider} request failed after retries`, provider, "network", false);
}

function backoffMs(attempt: number): number {
  return Math.min(2000, 200 * 2 ** attempt);
}

function truncate(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

/** Strips query strings (which may carry tokens for some providers) before logging. */
function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}
