import { afterEach, describe, expect, it } from "vitest";
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

describe("key rotation", () => {
  const KEY_A = "a".repeat(64);
  const KEY_B = "b".repeat(64);
  const prev = {
    current: process.env.TOKEN_ENCRYPTION_KEY,
    previous: process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS,
  };
  afterEach(() => {
    if (prev.current === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = prev.current;
    if (prev.previous === undefined) delete process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
    else process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS = prev.previous;
  });

  it("decrypts ciphertext from the previous key after a rotation", () => {
    process.env.TOKEN_ENCRYPTION_KEY = KEY_A;
    delete process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
    const sealed = encryptSecret("ya29.a0AfH6-refresh-token");

    // Rotate: what was current becomes previous.
    process.env.TOKEN_ENCRYPTION_KEY = KEY_B;
    process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS = KEY_A;
    expect(decryptSecret(sealed)).toBe("ya29.a0AfH6-refresh-token");

    // New writes use the new key and still read back.
    expect(decryptSecret(encryptSecret("fresh"))).toBe("fresh");
  });

  it("fails closed once the previous key is dropped", () => {
    process.env.TOKEN_ENCRYPTION_KEY = KEY_A;
    const sealed = encryptSecret("secret");
    process.env.TOKEN_ENCRYPTION_KEY = KEY_B;
    delete process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
    expect(() => decryptSecret(sealed)).toThrow(/could not decrypt/i);
  });

  it("never puts the ciphertext or a key into the error message", () => {
    process.env.TOKEN_ENCRYPTION_KEY = KEY_A;
    const sealed = encryptSecret("secret");
    process.env.TOKEN_ENCRYPTION_KEY = KEY_B;
    delete process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
    try {
      decryptSecret(sealed);
      throw new Error("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).not.toContain(sealed);
      expect(message).not.toContain(KEY_A);
      expect(message).not.toContain(KEY_B);
    }
  });

  it.each(["", "x".repeat(64), "abc", "A".repeat(63)])(
    "rejects %s as a key instead of producing a confusing cipher error",
    (bad) => {
      process.env.TOKEN_ENCRYPTION_KEY = bad;
      expect(() => encryptSecret("x")).toThrow(/TOKEN_ENCRYPTION_KEY must be a 64-char hex/);
    },
  );
});
