import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetLoginAttemptsForTests,
  checkLoginAttempt,
  hashPassword,
  isOwnerLoginEnabled,
  ownerPasswordCredential,
  recordLoginFailure,
  recordLoginSuccess,
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
