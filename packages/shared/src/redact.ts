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

/** Key names whose value is always a credential, in JSON bodies or query strings. */
const SECRET_KEYS = [
  "access_token",
  "refresh_token",
  "id_token",
  "client_secret",
  "api_key",
  "apikey",
  "token",
  "secret",
  "password",
  "passwd",
  "authorization",
] as const;

const KEYS_RE = SECRET_KEYS.join("|");

/** `"access_token": "..."` (JSON) — quoted key, quoted value. */
const JSON_VALUE_RE = new RegExp(`("(?:${KEYS_RE})"\\s*:\\s*)"[^"]*"`, "gi");

/** `access_token=...` (query string / form body / `key: value` log lines). */
const QUERY_VALUE_RE = new RegExp(`\\b(${KEYS_RE})(\\s*[=:]\\s*)([^&\\s,"'\`)\\]}]+)`, "gi");

/** `Authorization: Bearer <token>` / `Basic <base64>`. */
const AUTH_SCHEME_RE = /\b(bearer|basic)\s+[A-Za-z0-9\-._~+/]{8,}={0,2}/gi;

/** Telegram bot tokens, both in a URL path (`/bot123456:AA...`) and bare (`123456:AA...`). */
const TELEGRAM_BOT_RE = /\bbot\d+:[\w-]+/gi;
const TELEGRAM_BARE_RE = /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g;

/** Discord webhook URLs: keep the id, drop the token. */
const DISCORD_WEBHOOK_RE =
  /(https?:\/\/(?:[\w-]+\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/)[\w-]+/gi;

/** Slack-style `xoxb-`/`xoxp-` and GitHub `ghp_`/`gho_` prefixed tokens. */
const PREFIXED_TOKEN_RE = /\b(?:xox[abprs]-[A-Za-z0-9-]{10,}|gh[pousr]_[A-Za-z0-9]{20,})\b/g;

/** Pure hex blobs of 32+ chars (AES keys, sha256 digests, many API keys). */
const LONG_HEX_RE = /\b[0-9a-fA-F]{32,}\b/g;

/** base64url-ish blobs of 32+ chars, only when they actually look random (see `looksRandom`). */
const LONG_B64URL_RE = /\b[A-Za-z0-9_-]{32,}={0,2}/g;

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
      .replace(JSON_VALUE_RE, `$1"${REDACTED}"`)
      // Before the key=value rule, so `Authorization: Bearer <token>` keeps its scheme word.
      .replace(AUTH_SCHEME_RE, (m) => `${m.slice(0, m.indexOf(" "))} ${REDACTED}`)
      .replace(QUERY_VALUE_RE, (m, key: string, sep: string, value: string) =>
        /^(bearer|basic|\[REDACTED\])$/i.test(value) ? m : `${key}${sep}${REDACTED}`,
      )
      .replace(DISCORD_WEBHOOK_RE, `$1${REDACTED}`)
      .replace(TELEGRAM_BOT_RE, `bot${REDACTED}`)
      .replace(TELEGRAM_BARE_RE, REDACTED)
      .replace(PREFIXED_TOKEN_RE, REDACTED)
      .replace(LONG_HEX_RE, REDACTED)
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
    k.endsWith("apikey")
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
