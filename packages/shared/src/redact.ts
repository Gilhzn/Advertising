/**
 * Secret redaction for anything that lands in a database column, an audit payload or a log line.
 *
 * Connector/HTTP errors routinely quote the request that failed (a URL with `?access_token=...`, an
 * `Authorization: Bearer ...` header, a Telegram `bot<id>:<token>` path segment). Those strings are
 * persisted in `posts.last_error`, `platform_accounts.last_error` and `audit_log.payload`, where they
 * are readable by anyone with dashboard or DB access - so every such string goes through
 * `redactSecrets()` first.
 *
 * The rules are deliberately conservative about false positives: a long opaque token is only
 * redacted when it looks like one (pure hex, or mixed-case base64url with a digit), so ordinary
 * prose, identifiers and UUIDs survive intact.
 */

export const REDACTED = "[REDACTED]";

/**
 * Key names whose value is always a credential, in JSON bodies or query strings.
 * Sorted longest-first so the alternation prefers the most specific name.
 */
const SECRET_KEYS = [
  "connection_string",
  "refresh_token",
  "client_secret",
  "access_token",
  "authorization",
  "private_key",
  "privatekey",
  "credentials",
  "credential",
  "passphrase",
  "signature",
  "id_token",
  "password",
  "api_key",
  "apikey",
  "passwd",
  "secret",
  "cookie",
  "token",
] as const;

const KEYS_RE = SECRET_KEYS.join("|");

/**
 * Credential key names are almost never bare. They arrive prefixed (`app_password`,
 * `user_access_token`, `MIGADU_API_KEY`, `X_CLIENT_SECRET`) and `\b` cannot match between a word
 * character and `_`, so an anchor of `\b` left every prefixed form unredacted. A negative lookbehind
 * over the same character class anchors at the true start of the identifier instead, and the greedy
 * prefix then absorbs `app_`, `user_`, `MIGADU_` and so on.
 */
const KEY_CHAR = "A-Za-z0-9_.\\-";
const KEY_RE = `(?<![${KEY_CHAR}])[${KEY_CHAR}]*(?:${KEYS_RE})`;

/** `"access_token": "..."` / `"app_password": "..."` (JSON) - quoted key, quoted value. */
const JSON_VALUE_RE = new RegExp(`("${KEY_RE}"\\s*:\\s*)"[^"]*"`, "gi");

/**
 * `access_token=...` (query string / form body / `key: value` log lines / `KEY=value` env dumps).
 * The value runs to the next delimiter. `@` and `/` are deliberately *inside* the value now: URL
 * userinfo is handled by its own rule further up the chain, so excluding them here only ever cut a
 * redaction short (`api_key=abc/def` left `/def` in the clear).
 */
const QUERY_VALUE_RE = new RegExp(`(${KEY_RE})(\\s*[=:]\\s*)([^&\\s,;"'\`)\\]}]+)`, "gi");

/** `Authorization: Bearer <token>` / `Basic <base64>`. */
const AUTH_SCHEME_RE = /\b(bearer|basic)\s+[A-Za-z0-9\-._~+/]{8,}={0,2}/gi;

/** Telegram bot tokens, both in a URL path (`/bot123456:AA...`) and bare (`123456:AA...`). */
const TELEGRAM_BOT_RE = /\bbot\d+:[\w-]+/gi;
const TELEGRAM_BARE_RE = /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g;

/** Discord webhook URLs: keep the id, drop the token. */
const DISCORD_WEBHOOK_RE =
  /(https?:\/\/(?:[\w-]+\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/)[\w-]+/gi;

/**
 * Credentials in URL userinfo: `postgres://user:password@host`, `redis://:pass@host`,
 * `https://user:token@host`. Connection strings reach error messages far more often than headers do
 * (`DATABASE_URL` in a driver error), and no key-name rule catches them - the password has no key.
 * The password half may legitimately contain `/` and `+` (base64 passwords), so it runs to the `@`.
 */
const URL_USERINFO_RE = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]*):[^\s@]+@/gi;

/** JSON Web Tokens - three base64url segments. The payload alone can carry identifying claims. */
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

/** Slack-style `xoxb-`/`xoxp-` and GitHub `ghp_`/`gho_` prefixed tokens. */
const PREFIXED_TOKEN_RE = /\b(?:xox[abprs]-[A-Za-z0-9-]{10,}|gh[pousr]_[A-Za-z0-9]{20,})\b/g;

/**
 * AWS access key ids. They are fixed-shape, all-uppercase and 20 chars, so none of the entropy
 * rules below fire on them: `LONG_HEX_RE` needs hex, `LONG_B64URL_RE` needs 32+ chars and mixed
 * case. A leaked key id plus a leaked secret is a full credential pair, and the id is the half that
 * shows up in error messages.
 */
const AWS_KEY_ID_RE = /\b(?:AKIA|ASIA|AIDA|AROA|AGPA|ANPA|ANVA|APKA|ABIA|ACCA)[A-Z0-9]{16}\b/g;

/** PEM private key blocks - redact the whole block, header to footer, in one go. */
const PEM_BLOCK_RE = /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )*PRIVATE KEY-----/g;

/** A PEM header with no matching footer (a truncated error body): redact to end of input. */
const PEM_TRUNCATED_RE = /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----[\s\S]*/g;

/** Pure hex blobs of 32+ chars (AES keys, sha256 digests, many API keys). */
const LONG_HEX_RE = /\b[0-9a-fA-F]{32,}\b/g;

/** base64url-ish blobs of 32+ chars, only when they actually look random (see `looksRandom`). */
const LONG_B64URL_RE = /\b[A-Za-z0-9_-]{32,}={0,2}/g;

/**
 * All-uppercase alphanumeric blobs of 32+ chars containing at least one digit (base32 secrets, TOTP
 * seeds, some vendor keys). `looksRandom` requires mixed case, so these slipped through unredacted.
 * Requiring a digit keeps SCREAMING_SNAKE constants and long uppercase prose out of scope.
 */
const LONG_UPPER_RE = /\b(?=[A-Z0-9]*\d)[A-Z0-9]{32,}\b/g;

/**
 * True for a base64url candidate that looks like an opaque credential rather than a long
 * identifier: it must mix cases and contain a digit. `some_very_long_snake_case_identifier`
 * and `AVeryLongCamelCaseClassNameHere` therefore survive; `dGhpcyBpcyBhIHRva2VuIDEyMw` does not.
 */
function looksRandom(s: string): boolean {
  return /[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s);
}

/**
 * Replaces credentials in a free-form string with `[REDACTED]`.
 * Safe to call on `undefined`/`null` (returns an empty string) and on already-redacted text.
 */
export function redactSecrets(input: unknown): string {
  if (input === null || input === undefined) return "";
  const text = typeof input === "string" ? input : String(input);
  return (
    text
      // Before everything else: a PEM body is base64 that the entropy rules would shred into a
      // half-redacted mess, and the header/footer alone would survive.
      .replace(PEM_BLOCK_RE, REDACTED)
      .replace(PEM_TRUNCATED_RE, REDACTED)
      .replace(JSON_VALUE_RE, `$1"${REDACTED}"`)
      // Before the key=value rule, so `Authorization: Bearer <token>` keeps its scheme word.
      .replace(AUTH_SCHEME_RE, (m) => `${m.slice(0, m.indexOf(" "))} ${REDACTED}`)
      // Also before it, so `https://x-access-token:<secret>@host` is handled as userinfo.
      .replace(URL_USERINFO_RE, `$1:${REDACTED}@`)
      .replace(QUERY_VALUE_RE, (m, key: string, sep: string, value: string) =>
        /^(bearer|basic|\[REDACTED\])$/i.test(value) ? m : `${key}${sep}${REDACTED}`,
      )
      .replace(JWT_RE, REDACTED)
      .replace(DISCORD_WEBHOOK_RE, `$1${REDACTED}`)
      .replace(TELEGRAM_BOT_RE, `bot${REDACTED}`)
      .replace(TELEGRAM_BARE_RE, REDACTED)
      .replace(PREFIXED_TOKEN_RE, REDACTED)
      .replace(AWS_KEY_ID_RE, REDACTED)
      .replace(LONG_HEX_RE, REDACTED)
      .replace(LONG_UPPER_RE, REDACTED)
      .replace(LONG_B64URL_RE, (m) => (looksRandom(m) ? REDACTED : m))
  );
}

/**
 * Deep version for structured payloads (`audit_log.payload`, job results): redacts every string,
 * and blanks any value whose *key* is itself a secret name. Arrays and nested objects are walked;
 * non-JSON values (functions, symbols) are dropped by the caller's serializer as usual.
 */
export function redactDeep<T>(value: T): T {
  return redactUnknown(value) as T;
}

const SECRET_KEY_SET = new Set<string>(SECRET_KEYS);

function isSecretKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[^a-z]/g, "");
  return (
    SECRET_KEY_SET.has(key.toLowerCase()) ||
    k.endsWith("token") ||
    k.endsWith("secret") ||
    k.endsWith("password") ||
    k.endsWith("passwd") ||
    k.endsWith("apikey") ||
    k.endsWith("credential") ||
    k.endsWith("credentials") ||
    k.endsWith("passphrase") ||
    k.endsWith("privatekey")
  );
}

function redactUnknown(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(redactUnknown);
  if (value instanceof Error) return redactSecrets(value.message);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSecretKey(k) && v != null && typeof v !== "object" ? REDACTED : redactUnknown(v);
    }
    return out;
  }
  return value;
}
