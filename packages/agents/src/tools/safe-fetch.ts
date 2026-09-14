import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { blockedIpReason } from "@adv/shared";

// Re-exported so the existing tests and callers keep importing it from here; the implementation
// now lives in @adv/shared so the connector SSRF guard uses the exact same classifier.
export { blockedIpReason };
import { Agent as UndiciAgent, fetch as undiciFetch } from "undici";

/**
 * SSRF-safe URL fetcher for the `fetch_url` engine tool.
 *
 * Guarantees:
 * - https only (no http, file, gopher, data...)
 * - every DNS answer for the host is checked against private/loopback/link-local/metadata ranges
 * - at most 3 redirects, each re-validated with the same rules
 * - hard 2 MB body cap (the stream is aborted once the cap is hit)
 * - scripts/styles/comments stripped; plain text is returned, never HTML
 */

export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_REDIRECTS = 3;

export class UnsafeUrlError extends Error {
  readonly name = "UnsafeUrlError";
  constructor(
    message: string,
    readonly reason: string,
  ) {
    super(message);
  }
}

type Family = 4 | 6;
export interface ResolvedAddress {
  address: string;
  family: Family;
}
export type ResolveHost = (hostname: string) => Promise<ResolvedAddress[]>;

const defaultResolveHost: ResolveHost = async (hostname) => {
  const answers = await dnsLookup(hostname, { all: true, verbatim: true });
  return answers.map((a) => ({ address: a.address, family: a.family as Family }));
};

/**
 * Validates scheme/host and resolves every DNS answer, rejecting when any of them is private.
 * Returns the addresses so a caller can log them.
 */
export async function assertPublicUrl(
  raw: string,
  resolveHost: ResolveHost = defaultResolveHost,
): Promise<{ url: URL; addresses: ResolvedAddress[] }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError(`not a valid URL: ${raw}`, "invalid-url");
  }
  if (url.protocol !== "https:") {
    throw new UnsafeUrlError(`only https is allowed, got ${url.protocol}`, "scheme");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("credentials in URL are not allowed", "userinfo");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host) throw new UnsafeUrlError("missing host", "host");
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.home\.arpa)$/i.test(host)) {
    throw new UnsafeUrlError(`host ${host} is a local name`, "local-name");
  }

  if (isIP(host)) {
    const reason = blockedIpReason(host);
    if (reason) throw new UnsafeUrlError(`address ${host} is blocked (${reason})`, reason);
    return { url, addresses: [{ address: host, family: isIP(host) as Family }] };
  }

  let addresses: ResolvedAddress[];
  try {
    addresses = await resolveHost(host);
  } catch (err) {
    throw new UnsafeUrlError(
      `DNS lookup failed for ${host}: ${err instanceof Error ? err.message : String(err)}`,
      "dns",
    );
  }
  if (addresses.length === 0) throw new UnsafeUrlError(`no DNS answer for ${host}`, "dns-empty");
  for (const a of addresses) {
    const reason = blockedIpReason(a.address);
    if (reason) {
      throw new UnsafeUrlError(`${host} resolves to ${a.address} which is blocked (${reason})`, reason);
    }
  }
  return { url, addresses };
}

/** Removes scripts, styles, comments and tags; collapses whitespace. */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|iframe|svg)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(script|style|noscript|template|iframe|svg)\b[^>]*\/?>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

export interface SafeFetchOptions {
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
  resolveHost?: ResolveHost;
  fetchImpl?: typeof fetch;
  /** extra request headers (never credentials) */
  userAgent?: string;
}

export interface SafeFetchResult {
  /** final URL after redirects */
  url: string;
  status: number;
  contentType: string;
  /** plain text, scripts stripped */
  text: string;
  bytes: number;
  truncated: boolean;
  redirects: string[];
}

async function readCapped(
  res: Response,
  maxBytes: number,
): Promise<{ text: string; bytes: number; truncated: boolean }> {
  const body = res.body;
  if (!body) {
    const t = await res.text();
    const buf = Buffer.from(t, "utf8");
    if (buf.byteLength > maxBytes) {
      return { text: buf.subarray(0, maxBytes).toString("utf8"), bytes: maxBytes, truncated: true };
    }
    return { text: t, bytes: buf.byteLength, truncated: false };
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (total + value.byteLength > maxBytes) {
      chunks.push(value.subarray(0, maxBytes - total));
      total = maxBytes;
      truncated = true;
      void reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  return { text: Buffer.concat(chunks).toString("utf8"), bytes: total, truncated };
}

/**
 * Builds a fetch whose TCP connection is pinned to the address we validated, closing the
 * resolve-then-connect (DNS rebinding) window. TLS still verifies against the original hostname.
 */
export function createPinnedDispatcher(pinned: ResolvedAddress): UndiciAgent {
  // node's dns.lookup callback shape; undici types it as the `net.LookupFunction`
  const lookup = (_host: string, options: unknown, cb: (...args: unknown[]) => void) => {
    const all = typeof options === "object" && options !== null && (options as { all?: boolean }).all;
    if (all) cb(null, [{ address: pinned.address, family: pinned.family }]);
    else cb(null, pinned.address, pinned.family);
  };
  return new UndiciAgent({ connect: { lookup: lookup as unknown as undefined } });
}

function pinnedFetch(pinned: ResolvedAddress): typeof fetch {
  const dispatcher = createPinnedDispatcher(pinned);
  return ((input: string | URL | Request, init?: RequestInit) =>
    undiciFetch(
      input as string,
      { ...(init as object), dispatcher } as never,
    ) as unknown as Promise<Response>) as typeof fetch;
}

/** Fetches a public https URL and returns its readable text. Throws `UnsafeUrlError` when blocked. */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  const resolveHost = opts.resolveHost ?? defaultResolveHost;
  const redirects: string[] = [];

  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const { url, addresses } = await assertPublicUrl(current, resolveHost);
    // Pin every hop to the address that passed validation (re-pinned after each redirect).
    const doFetch = opts.fetchImpl ?? pinnedFetch(addresses[0] as ResolvedAddress);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
    let res: Response;
    try {
      res = await doFetch(url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.5",
          "user-agent": opts.userAgent ?? "adv-engine/0.1 (+https://example.com/bot)",
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new UnsafeUrlError(`redirect ${res.status} without Location`, "redirect");
      if (hop === maxRedirects) {
        throw new UnsafeUrlError(`too many redirects (>${maxRedirects})`, "redirect-limit");
      }
      const next = new URL(location, url).toString();
      redirects.push(next);
      current = next;
      continue;
    }

    const contentType = res.headers.get("content-type") ?? "";
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new UnsafeUrlError(`response is ${declared} bytes, cap is ${maxBytes}`, "too-large");
    }
    const { text, bytes, truncated } = await readCapped(res, maxBytes);
    const isHtml = /html|xml/i.test(contentType) || /^\s*<(!doctype|html)/i.test(text);
    return {
      url: url.toString(),
      status: res.status,
      contentType,
      text: isHtml ? htmlToText(text) : text.trim(),
      bytes,
      truncated,
      redirects,
    };
  }
  throw new UnsafeUrlError(`too many redirects (>${maxRedirects})`, "redirect-limit");
}
