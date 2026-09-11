import type { RateLimit } from "@adv/connectors";
import { logger } from "@adv/shared";

/**
 * Matches `@adv/connectors`' `RateLimiter.acquire()` shape exactly (see that package's
 * `src/rate-limiter.ts`): returns `0` when the call may proceed (the slot is consumed), or the number
 * of milliseconds to wait before retrying (nothing consumed).
 */
export interface Limiter {
  acquire(key: string, rateLimit: RateLimit): number;
}

/** Local fallback with the same sliding-window semantics, used only if `@adv/connectors` does not
 * export a `RateLimiter` (kept in sync manually - see the real implementation for the source of truth). */
export class LocalRateLimiter implements Limiter {
  private readonly hits = new Map<string, number[]>();

  acquire(key: string, rateLimit: RateLimit): number {
    const { limit, windowMs } = rateLimit;
    if (limit <= 0) return windowMs;

    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (this.hits.get(key) ?? []).filter((t) => t > cutoff);

    if (timestamps.length < limit) {
      timestamps.push(now);
      this.hits.set(key, timestamps);
      return 0;
    }

    this.hits.set(key, timestamps);
    const oldest = timestamps[0] ?? now;
    return Math.max(1, oldest + windowMs - now);
  }
}

let cached: Limiter | undefined;

/**
 * Returns the process-wide rate limiter, preferring the `RateLimiter` exported from
 * `@adv/connectors` (shared with connector-level throttling there) and falling back to a local
 * in-memory implementation when the connectors package does not export one.
 */
export async function getRateLimiter(): Promise<Limiter> {
  if (cached) return cached;
  try {
    const mod = (await import("@adv/connectors")) as unknown as Record<string, unknown>;
    const Ctor = mod.RateLimiter;
    if (typeof Ctor === "function") {
      cached = new (Ctor as new () => Limiter)();
      return cached;
    }
  } catch (err) {
    logger.warn({ err }, "limiter: failed to probe @adv/connectors for RateLimiter, using local limiter");
  }
  cached = new LocalRateLimiter();
  return cached;
}
