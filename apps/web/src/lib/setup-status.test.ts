import { afterEach, describe, expect, it, vi } from "vitest";
import { missingRequiredEnv } from "./setup-status.js";

const FULL_ENV: Record<string, string> = {
  AUTH_SECRET: "a-long-random-secret",
  DATABASE_URL: "postgres://user:pass@host/db",
  TOKEN_ENCRYPTION_KEY: "0".repeat(63) + "f",
  APP_URL: "https://example.vercel.app",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_token",
};

const OPTIONAL_KEYS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];

function stubEnv(overrides: Record<string, string> = {}): void {
  for (const [key, value] of Object.entries({ ...FULL_ENV, ...overrides })) vi.stubEnv(key, value);
  for (const key of OPTIONAL_KEYS) if (!(key in overrides)) vi.stubEnv(key, "");
}

const names = (): string[] => missingRequiredEnv().map((item) => item.name);

describe("missingRequiredEnv", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reports nothing when everything is configured", () => {
    stubEnv();
    expect(missingRequiredEnv()).toEqual([]);
  });

  it("reports each missing variable by name", () => {
    stubEnv({ AUTH_SECRET: "", DATABASE_URL: "" });
    expect(names()).toEqual(["AUTH_SECRET", "DATABASE_URL"]);
  });

  it("treats a whitespace-only value as missing", () => {
    stubEnv({ APP_URL: "   " });
    expect(names()).toContain("APP_URL");
  });

  it("rejects a TOKEN_ENCRYPTION_KEY that is not 64 hex characters", () => {
    stubEnv({ TOKEN_ENCRYPTION_KEY: "too-short" });
    const item = missingRequiredEnv().find((i) => i.name === "TOKEN_ENCRYPTION_KEY");
    expect(item?.detail).toMatch(/64 hex/);
  });

  it("accepts storage from Vercel Blob or from a complete R2 set", () => {
    stubEnv();
    expect(names()).toEqual([]);

    stubEnv({
      BLOB_READ_WRITE_TOKEN: "",
      R2_ACCOUNT_ID: "acc",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
    });
    expect(names()).toEqual([]);
  });

  it("reports storage as missing when R2 is only partly configured", () => {
    stubEnv({ BLOB_READ_WRITE_TOKEN: "", R2_ACCOUNT_ID: "acc" });
    expect(names().some((n) => n.startsWith("BLOB_READ_WRITE_TOKEN"))).toBe(true);
  });

  it("never returns the value of a configured variable", () => {
    stubEnv({ AUTH_SECRET: "", TOKEN_ENCRYPTION_KEY: "not-hex-at-all" });
    const serialized = JSON.stringify(missingRequiredEnv());
    for (const value of Object.values(FULL_ENV)) expect(serialized).not.toContain(value);
    expect(serialized).not.toContain("not-hex-at-all");
  });
});
