import { describe, expect, it } from "vitest";
import type { RateLimit } from "./connector.js";
import { RateLimiter, rateLimitKey } from "./rate-limiter.js";

const LIMIT: RateLimit = { limit: 3, windowMs: 1000 };

function fixedClock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
  };
}

describe("RateLimiter", () => {
  it("allows up to `limit` calls in a window", () => {
    const clock = fixedClock();
    const limiter = new RateLimiter(clock.now);
    expect(limiter.acquire("k", LIMIT)).toBe(0);
    expect(limiter.acquire("k", LIMIT)).toBe(0);
    expect(limiter.acquire("k", LIMIT)).toBe(0);
  });

  it("returns the wait until the oldest call leaves the window", () => {
    const clock = fixedClock();
    const limiter = new RateLimiter(clock.now);
    for (let i = 0; i < 3; i++) {
      limiter.acquire("k", LIMIT);
      clock.advance(100);
    }
    // oldest hit was 300ms ago -> 700ms until it falls out of the 1000ms window
    expect(limiter.acquire("k", LIMIT)).toBe(700);
  });

  it("does not consume a slot when it returns a wait", () => {
    const clock = fixedClock();
    const limiter = new RateLimiter(clock.now);
    for (let i = 0; i < 3; i++) limiter.acquire("k", LIMIT);
    expect(limiter.acquire("k", LIMIT)).toBeGreaterThan(0);
    expect(limiter.acquire("k", LIMIT)).toBeGreaterThan(0);
    clock.advance(1001);
    expect(limiter.acquire("k", LIMIT)).toBe(0);
  });

  it("slides: old hits expire one by one", () => {
    const clock = fixedClock();
    const limiter = new RateLimiter(clock.now);
    limiter.acquire("k", LIMIT);
    clock.advance(500);
    limiter.acquire("k", LIMIT);
    limiter.acquire("k", LIMIT);
    expect(limiter.acquire("k", LIMIT)).toBe(500);
    clock.advance(501); // the first hit has now expired
    expect(limiter.acquire("k", LIMIT)).toBe(0);
  });

  it("keeps separate windows per key", () => {
    const clock = fixedClock();
    const limiter = new RateLimiter(clock.now);
    for (let i = 0; i < 3; i++) limiter.acquire("a", LIMIT);
    expect(limiter.acquire("a", LIMIT)).toBeGreaterThan(0);
    expect(limiter.acquire("b", LIMIT)).toBe(0);
  });

  it("reports remaining capacity", () => {
    const clock = fixedClock();
    const limiter = new RateLimiter(clock.now);
    expect(limiter.remaining("k", LIMIT)).toBe(3);
    limiter.acquire("k", LIMIT);
    expect(limiter.remaining("k", LIMIT)).toBe(2);
    clock.advance(1001);
    expect(limiter.remaining("k", LIMIT)).toBe(3);
  });

  it("treats limit 0 as closed", () => {
    const limiter = new RateLimiter();
    expect(limiter.acquire("k", { limit: 0, windowMs: 500 })).toBe(500);
  });

  it("resets one key or everything", () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 3; i++) limiter.acquire("a", LIMIT);
    for (let i = 0; i < 3; i++) limiter.acquire("b", LIMIT);
    limiter.reset("a");
    expect(limiter.acquire("a", LIMIT)).toBe(0);
    expect(limiter.acquire("b", LIMIT)).toBeGreaterThan(0);
    limiter.reset();
    expect(limiter.acquire("b", LIMIT)).toBe(0);
  });

  it("prunes keys whose window has fully passed", () => {
    const clock = fixedClock();
    const limiter = new RateLimiter(clock.now);
    limiter.acquire("a", LIMIT);
    clock.advance(2000);
    limiter.prune(LIMIT.windowMs);
    expect(limiter.remaining("a", LIMIT)).toBe(3);
  });

  it("acquireBlocking waits for a free slot", async () => {
    const limiter = new RateLimiter();
    const tiny: RateLimit = { limit: 1, windowMs: 30 };
    expect(limiter.acquire("k", tiny)).toBe(0);
    const started = Date.now();
    await expect(limiter.acquireBlocking("k", tiny, 500)).resolves.toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(20);
  });

  it("acquireBlocking gives up past the deadline", async () => {
    const limiter = new RateLimiter();
    const slow: RateLimit = { limit: 1, windowMs: 10_000 };
    limiter.acquire("k", slow);
    await expect(limiter.acquireBlocking("k", slow, 50)).resolves.toBe(false);
  });

  it("enforces a real connector rate limit shape (Instagram 100/24h)", () => {
    const clock = fixedClock();
    const limiter = new RateLimiter(clock.now);
    const ig: RateLimit = { limit: 100, windowMs: 86_400_000 };
    for (let i = 0; i < 100; i++) expect(limiter.acquire("ig", ig)).toBe(0);
    expect(limiter.acquire("ig", ig)).toBe(86_400_000);
  });
});

describe("rateLimitKey", () => {
  it("scopes by platform, account and operation", () => {
    expect(rateLimitKey("instagram", "acc_1")).toBe("instagram:acc_1:publish");
    expect(rateLimitKey("instagram", "acc_1", "insights")).toBe("instagram:acc_1:insights");
  });
});
