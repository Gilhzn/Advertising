import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";

const KEY_HEX_RE = /^[0-9a-f]{64}$/i;

function parseKey(hex: string | undefined, varName: string): Buffer {
  // Length alone was the only check, so a 64-char non-hex value produced a short Buffer and a
  // confusing "Invalid key length" from createCipheriv instead of naming the variable at fault.
  if (!hex || !KEY_HEX_RE.test(hex)) {
    throw new Error(`${varName} must be a 64-char hex string (32 bytes). Generate: openssl rand -hex 32`);
  }
  return Buffer.from(hex, "hex");
}

function keyFromEnv(): Buffer {
  return parseKey(process.env.TOKEN_ENCRYPTION_KEY, "TOKEN_ENCRYPTION_KEY");
}

/**
 * Keys to try when decrypting, newest first.
 *
 * Without this, rotating `TOKEN_ENCRYPTION_KEY` instantly bricks every `oauth_tokens` row and every
 * `mailboxes.password_enc`, and the failure surfaces as an opaque throw from `loadAccount` - every
 * publish job failing three times with nothing pointing at the key change. Setting
 * `TOKEN_ENCRYPTION_KEY_PREVIOUS` to the old key lets both generations decrypt, so a rotation is:
 * set PREVIOUS to the current key, set TOKEN_ENCRYPTION_KEY to the new one, run the re-encrypt
 * script, then drop PREVIOUS. Encryption always uses the current key only.
 */
function decryptionKeys(): Buffer[] {
  const keys = [keyFromEnv()];
  const previous = process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
  if (previous) keys.push(parseKey(previous, "TOKEN_ENCRYPTION_KEY_PREVIOUS"));
  return keys;
}

/** Encrypt a UTF-8 string. Output format: base64(iv | tag | ciphertext). */
export function encryptSecret(plain: string, key: Buffer = keyFromEnv()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string, key?: Buffer): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const keys = key ? [key] : decryptionKeys();
  let lastError: unknown;
  for (const k of keys) {
    try {
      const decipher = createDecipheriv(ALGO, k, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    } catch (err) {
      // GCM authentication failed for this key: either the wrong generation, or real tampering.
      // Never include the ciphertext or the key in what propagates.
      lastError = err;
    }
  }
  throw new Error(
    keys.length > 1
      ? "could not decrypt with TOKEN_ENCRYPTION_KEY or TOKEN_ENCRYPTION_KEY_PREVIOUS"
      : `could not decrypt with TOKEN_ENCRYPTION_KEY: ${lastError instanceof Error ? lastError.message : "authentication failed"}`,
  );
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
