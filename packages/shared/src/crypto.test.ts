import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto.js";

const key = Buffer.alloc(32, 7);

describe("crypto", () => {
  it("round-trips", () => {
    const enc = encryptSecret("hello-token", key);
    expect(enc).not.toContain("hello");
    expect(decryptSecret(enc, key)).toBe("hello-token");
  });
  it("produces distinct ciphertexts per call (random iv)", () => {
    expect(encryptSecret("x", key)).not.toBe(encryptSecret("x", key));
  });
  it("fails on tampering", () => {
    const enc = encryptSecret("secret", key);
    const buf = Buffer.from(enc, "base64");
    buf[buf.length - 1] = (buf[buf.length - 1] ?? 0) ^ 1;
    expect(() => decryptSecret(buf.toString("base64"), key)).toThrow();
  });
});
