/**
 * Owner-password login primitives.
 *
 * Deliberately import nothing from Next.js (or from `@adv/db`) so this module can be executed
 * directly by `tsx` from the root `owner:hash` script as well as from the Next.js app.
 *
 * Password hashes use the format `scrypt$<saltB64>$<hashB64>` with fixed, documented scrypt
 * parameters so a hash produced by `pnpm owner:hash` always verifies against `OWNER_PASSWORD_HASH`.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;
// scrypt's default `maxmem` (32MB) is too small for N=16384, r=8 (needs ~128 * N * r bytes = 16MB
// per call, but Node also budgets for internal buffers) - give it headroom explicitly.
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const SALT_BYTES = 32;
const KEY_BYTES = 64;
const SCRYPT_PREFIX = "scrypt";

function scrypt(password: string, salt: Buffer, keyLength: number): Buffer {
  return scryptSync(password, salt, keyLength, { ...SCRYPT_PARAMS, maxmem: SCRYPT_MAXMEM });
}

/** Hash a plaintext password into the storable `scrypt$<saltB64>$<hashB64>` format. */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scrypt(password, salt, KEY_BYTES);
  return `${SCRYPT_PREFIX}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function verifyScryptHash(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== SCRYPT_PREFIX) return false;
  const [, saltB64, hashB64] = parts;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64 as string, "base64");
    expected = Buffer.from(hashB64 as string, "base64");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = scrypt(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

// Fixed salt used only to compare a submitted password against a plaintext `OWNER_PASSWORD`
// fallback in roughly constant time (hashing both sides masks length/early-exit differences from
// a naive string comparison). This salt is not a secret and must never be used to hash a value
// that is persisted.
const FIXED_COMPARISON_SALT = Buffer.from("adv-owner-login-fixed-comparison-salt-v1");

function verifyPlainPassword(password: string, plain: string): boolean {
  const actual = scrypt(password, FIXED_COMPARISON_SALT, KEY_BYTES);
  const expected = scrypt(plain, FIXED_COMPARISON_SALT, KEY_BYTES);
  return timingSafeEqual(actual, expected);
}

/**
 * Verify `password` against `stored`, which is either a `scrypt$...` hash (the `OWNER_PASSWORD_HASH`
 * case) or a plaintext password (the `OWNER_PASSWORD` fallback case).
 */
export function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;
  if (stored.startsWith(`${SCRYPT_PREFIX}$`)) return verifyScryptHash(password, stored);
  return verifyPlainPassword(password, stored);
}

/** Owner-password login is available once an email and either a hash or a plain password is set. */
export function isOwnerLoginEnabled(): boolean {
  return (
    Boolean(process.env.OWNER_EMAIL) && Boolean(process.env.OWNER_PASSWORD_HASH || process.env.OWNER_PASSWORD)
  );
}

/** The credential to verify against: prefers the hash, falls back to the plaintext env var. */
export function ownerPasswordCredential(): string {
  return process.env.OWNER_PASSWORD_HASH || process.env.OWNER_PASSWORD || "";
}

// ---- In-memory rate limiter -------------------------------------------------------------------
// Per-process, best-effort brute-force guard for the owner-login provider. Not shared across
// instances/restarts - that's an acceptable trade-off for a single-owner login gate that also sits
// behind a rate-limited scrypt comparison.

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

interface AttemptState {
  failures: number;
  windowStartedAt: number;
}

const attemptsByIp = new Map<string, AttemptState>();

export interface LoginAttemptCheck {
  allowed: boolean;
  /** Milliseconds until the window resets, when `allowed` is false. */
  retryAfterMs: number;
}

/** Has this IP exceeded `MAX_FAILURES` failed attempts within the current `WINDOW_MS`? */
export function checkLoginAttempt(ip: string, now: number = Date.now()): LoginAttemptCheck {
  const state = attemptsByIp.get(ip);
  if (!state) return { allowed: true, retryAfterMs: 0 };
  const elapsed = now - state.windowStartedAt;
  if (elapsed > WINDOW_MS) {
    attemptsByIp.delete(ip);
    return { allowed: true, retryAfterMs: 0 };
  }
  if (state.failures >= MAX_FAILURES) {
    return { allowed: false, retryAfterMs: WINDOW_MS - elapsed };
  }
  return { allowed: true, retryAfterMs: 0 };
}

/** Record a failed attempt, starting (or continuing) the 15-minute window for this IP. */
export function recordLoginFailure(ip: string, now: number = Date.now()): void {
  const state = attemptsByIp.get(ip);
  if (!state || now - state.windowStartedAt > WINDOW_MS) {
    attemptsByIp.set(ip, { failures: 1, windowStartedAt: now });
    return;
  }
  state.failures += 1;
}

/** Reset the window for this IP on a successful login. */
export function recordLoginSuccess(ip: string): void {
  attemptsByIp.delete(ip);
}

/** Test-only: clear all rate-limiter state so tests don't leak into each other. */
export function __resetLoginAttemptsForTests(): void {
  attemptsByIp.clear();
}
