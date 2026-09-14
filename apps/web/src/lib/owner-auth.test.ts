import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetLoginAttemptsForTests,
  checkLoginAttempt,
  hashPassword,
  isOwnerLoginEnabled,
  ownerPasswordCredential,
  recordLoginFailure,
  recordLoginSuccess,
  verifyOwnerCredentials,
  verifyPassword,
} from "./owner-auth.js";

describe("hashPassword / verifyPassword", () => {
  it("round-trips a correct password", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^scrypt\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects a wrong password against a hash", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces a different hash (random salt) each time", () => {
    expect(hashPassword("same-password")).not.toBe(hashPassword("same-password"));
  });

  it("accepts a plaintext OWNER_PASSWORD fallback", () => {
    expect(verifyPassword("plain-secret", "plain-secret")).toBe(true);
    expect(verifyPassword("wrong", "plain-secret")).toBe(false);
  });

  it("rejects malformed stored hashes instead of throwing", () => {
    expect(verifyPassword("x", "scrypt$not-base64-!!!$also-bad-!!!")).toBe(false);
    expect(verifyPassword("x", "scrypt$onlyonepart")).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
  });
});

describe("isOwnerLoginEnabled / ownerPasswordCredential", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("is disabled with no env set", () => {
    delete process.env.OWNER_EMAIL;
    delete process.env.OWNER_PASSWORD_HASH;
    delete process.env.OWNER_PASSWORD;
    expect(isOwnerLoginEnabled()).toBe(false);
  });

  it("is disabled with only an email set", () => {
    process.env.OWNER_EMAIL = "owner@example.com";
    delete process.env.OWNER_PASSWORD_HASH;
    delete process.env.OWNER_PASSWORD;
    expect(isOwnerLoginEnabled()).toBe(false);
  });

  it("is enabled with email + hash", () => {
    process.env.OWNER_EMAIL = "owner@example.com";
    process.env.OWNER_PASSWORD_HASH = "scrypt$aa$bb";
    delete process.env.OWNER_PASSWORD;
    expect(isOwnerLoginEnabled()).toBe(true);
    expect(ownerPasswordCredential()).toBe("scrypt$aa$bb");
  });

  it("is enabled with email + plain password, and hash takes precedence when both are set", () => {
    process.env.OWNER_EMAIL = "owner@example.com";
    process.env.OWNER_PASSWORD = "plain";
    delete process.env.OWNER_PASSWORD_HASH;
    expect(isOwnerLoginEnabled()).toBe(true);
    expect(ownerPasswordCredential()).toBe("plain");

    process.env.OWNER_PASSWORD_HASH = "scrypt$aa$bb";
    expect(ownerPasswordCredential()).toBe("scrypt$aa$bb");
  });
});

describe("checkLoginAttempt rate limiter", () => {
  beforeEach(() => {
    __resetLoginAttemptsForTests();
  });

  it("allows an IP with no history", () => {
    expect(checkLoginAttempt("1.1.1.1").allowed).toBe(true);
  });

  it("blocks after 5 failures within the window", () => {
    const ip = "2.2.2.2";
    for (let i = 0; i < 5; i++) recordLoginFailure(ip);
    const result = checkLoginAttempt(ip);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("allows the 5th attempt but blocks the 6th", () => {
    const ip = "3.3.3.3";
    for (let i = 0; i < 4; i++) {
      expect(checkLoginAttempt(ip).allowed).toBe(true);
      recordLoginFailure(ip);
    }
    // 4 failures recorded so far - still allowed.
    expect(checkLoginAttempt(ip).allowed).toBe(true);
    recordLoginFailure(ip);
    // 5 failures recorded - now blocked.
    expect(checkLoginAttempt(ip).allowed).toBe(false);
  });

  it("resets the window on a successful login", () => {
    const ip = "4.4.4.4";
    for (let i = 0; i < 5; i++) recordLoginFailure(ip);
    expect(checkLoginAttempt(ip).allowed).toBe(false);
    recordLoginSuccess(ip);
    expect(checkLoginAttempt(ip).allowed).toBe(true);
  });

  it("resets the window after it expires", () => {
    vi.useFakeTimers();
    try {
      const ip = "5.5.5.5";
      const start = Date.now();
      for (let i = 0; i < 5; i++) recordLoginFailure(ip, start);
      expect(checkLoginAttempt(ip, start).allowed).toBe(false);

      const after = start + 15 * 60 * 1000 + 1;
      expect(checkLoginAttempt(ip, after).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("tracks IPs independently", () => {
    for (let i = 0; i < 5; i++) recordLoginFailure("6.6.6.6");
    expect(checkLoginAttempt("6.6.6.6").allowed).toBe(false);
    expect(checkLoginAttempt("7.7.7.7").allowed).toBe(true);
  });
});

describe("verifyOwnerCredentials", () => {
  const prev = { email: process.env.OWNER_EMAIL, pw: process.env.OWNER_PASSWORD_HASH };
  beforeEach(() => {
    __resetLoginAttemptsForTests();
    process.env.OWNER_EMAIL = "owner@example.com";
    process.env.OWNER_PASSWORD_HASH = hashPassword("correct horse battery staple");
  });
  afterEach(() => {
    if (prev.email === undefined) delete process.env.OWNER_EMAIL;
    else process.env.OWNER_EMAIL = prev.email;
    if (prev.pw === undefined) delete process.env.OWNER_PASSWORD_HASH;
    else process.env.OWNER_PASSWORD_HASH = prev.pw;
  });

  it("accepts the right email and password", () => {
    expect(verifyOwnerCredentials("owner@example.com", "correct horse battery staple")).toBe(true);
  });

  it.each([
    ["owner@example.com", "wrong"],
    ["someone@example.com", "correct horse battery staple"],
    ["someone@example.com", "wrong"],
    ["", ""],
  ])("rejects %s / %s", (email, password) => {
    expect(verifyOwnerCredentials(email, password)).toBe(false);
  });

  // The enumeration oracle: `email === ownerEmail && verifyPassword(...)` short-circuits, so a
  // wrong email skipped scrypt and answered ~53ms sooner. Both paths must now do the same work.
  it("spends comparable time on a wrong email and a wrong password", () => {
    const time = (email: string, password: string) => {
      const t0 = process.hrtime.bigint();
      verifyOwnerCredentials(email, password);
      return Number(process.hrtime.bigint() - t0) / 1e6;
    };
    // warm any caches so the first call does not skew the comparison
    time("owner@example.com", "warmup");
    const wrongEmail = time("nobody@example.com", "correct horse battery staple");
    const wrongPassword = time("owner@example.com", "definitely not it");
    const slower = Math.max(wrongEmail, wrongPassword);
    const faster = Math.min(wrongEmail, wrongPassword);
    // The old code differed by the whole scrypt cost (a factor of many); requiring them within 3x
    // catches a reintroduced short-circuit without being flaky on a noisy CI box.
    expect(slower).toBeLessThan(faster * 3 + 5);
  });
});

describe("global login ceiling", () => {
  beforeEach(() => __resetLoginAttemptsForTests());

  it("stops accepting attempts once the global ceiling is hit, whatever the IP", () => {
    // Rotating the key defeats the per-IP bucket entirely, which is exactly what a forged `ip`
    // credential allowed. The address-independent ceiling is what actually bounds the attack.
    for (let i = 0; i < 60; i++) recordLoginFailure(`10.0.0.${i % 250}`);
    expect(checkLoginAttempt("203.0.113.99").allowed).toBe(false);
  });

  it("still allows a fresh IP below the global ceiling", () => {
    for (let i = 0; i < 3; i++) recordLoginFailure(`10.0.0.${i}`);
    expect(checkLoginAttempt("203.0.113.99").allowed).toBe(true);
  });
});
