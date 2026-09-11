import type { RateLimit } from "./connector.js";

/**
 * In-memory sliding-window limiter used by the publisher to pace calls per
 * connected account. It is per-process: the worker runs a single publish queue,
 * so a shared store is not needed yet. Swap the backing map for Redis if the
 * worker is ever scaled horizontally.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  /**
   * Reserves one slot for `key`. Returns 0 when the call may proceed (the slot
   * is consumed), or the number of milliseconds to wait before retrying (in
   * which case nothing is consumed).
   */
  acquire(key: string, rateLimit: RateLimit): number {
    const { limit, windowMs } = rateLimit;
    if (limit <= 0) return windowMs;

    const now = this.now();
    const cutoff = now - windowMs;
    const timestamps = (this.hits.get(key) ?? []).filter((t) => t > cutoff);

    if (timestamps.length < limit) {
      timestamps.push(now);
      this.hits.set(key, timestamps);
      return 0;
    }

    this.hits.set(key, timestamps);
    const oldest = timestamps[0] as number;
    return Math.max(1, oldest + windowMs - now);
  }

  /** How many calls are still available in the current window. */
  remaining(key: string, rateLimit: RateLimit): number {
    const cutoff = this.now() - rateLimit.windowMs;
    const timestamps = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    return Math.max(0, rateLimit.limit - timestamps.length);
  }

  /** Waits until a slot is free, then consumes it. Gives up after `timeoutMs`. */
  async acquireBlocking(key: string, rateLimit: RateLimit, timeoutMs = 60_000): Promise<boolean> {
    const deadline = this.now() + timeoutMs;
    for (;;) {
      const wait = this.acquire(key, rateLimit);
      if (wait === 0) return true;
      if (this.now() + wait > deadline) return false;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  reset(key?: string): void {
    if (key === undefined) this.hits.clear();
    else this.hits.delete(key);
  }

  /** Drops windows that are entirely in the past so long-lived processes do not leak keys. */
  prune(windowMs: number): void {
    const cutoff = this.now() - windowMs;
    for (const [key, timestamps] of this.hits) {
      const kept = timestamps.filter((t) => t > cutoff);
      if (kept.length === 0) this.hits.delete(key);
      else this.hits.set(key, kept);
    }
  }
}

/** Process-wide limiter shared by all connectors. */
export const rateLimiter = new RateLimiter();

/** Convenience key builder: one window per account per operation. */
export function rateLimitKey(platform: string, accountId: string, op = "publish"): string {
  return `${platform}:${accountId}:${op}`;
}
