import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

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

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out = out * 256 + n;
  }
  return out >>> 0;
}

const V4_BLOCKS: Array<[string, number, string]> = [
  ["0.0.0.0", 8, "this-network"],
  ["10.0.0.0", 8, "private"],
  ["100.64.0.0", 10, "cgnat"],
  ["127.0.0.0", 8, "loopback"],
  ["169.254.0.0", 16, "link-local/metadata"],
  ["172.16.0.0", 12, "private"],
  ["192.0.0.0", 24, "ietf-protocol"],
  ["192.0.2.0", 24, "documentation"],
  ["192.168.0.0", 16, "private"],
  ["198.18.0.0", 15, "benchmark"],
  ["198.51.100.0", 24, "documentation"],
  ["203.0.113.0", 24, "documentation"],
  ["224.0.0.0", 4, "multicast"],
  ["240.0.0.0", 4, "reserved"],
];

function blockedV4(ip: string): string | null {
  const n = ipv4ToInt(ip);
  if (n === null) return "malformed-ipv4";
  for (const [base, bits, reason] of V4_BLOCKS) {
    const b = ipv4ToInt(base);
    if (b === null) continue;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((n & mask) >>> 0 === (b & mask) >>> 0) return reason;
  }
  return null;
}

function expandV6(ip: string): number[] | null {
  const zone = ip.indexOf("%");
  const clean = (zone === -1 ? ip : ip.slice(0, zone)).toLowerCase();
  const [headRaw, tailRaw] = clean.includes("::") ? clean.split("::") : [clean, undefined];
  const parseGroups = (s: string | undefined): number[] | null => {
    if (!s) return [];
    const out: number[] = [];
    for (const g of s.split(":")) {
      if (g === "") continue;
      if (g.includes(".")) {
        const n = ipv4ToInt(g);
        if (n === null) return null;
        out.push((n >>> 16) & 0xffff, n & 0xffff);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(Number.parseInt(g, 16));
    }
    return out;
  };
  const head = parseGroups(headRaw);
  const tail = parseGroups(tailRaw);
  if (head === null || tail === null) return null;
  if (tailRaw === undefined) return head.length === 8 ? head : null;
  const fill = 8 - head.length - tail.length;
  if (fill < 0) return null;
  return [...head, ...Array<number>(fill).fill(0), ...tail];
}

function blockedV6(ip: string): string | null {
  const g = expandV6(ip);
  if (!g) return "malformed-ipv6";
  const isZero = g.every((x) => x === 0);
  if (isZero) return "unspecified";
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return "loopback";
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    const v4 = `${(g[6]! >> 8) & 0xff}.${g[6]! & 0xff}.${(g[7]! >> 8) & 0xff}.${g[7]! & 0xff}`;
    return blockedV4(v4) ? `ipv4-mapped:${blockedV4(v4)}` : null;
  }
  const first = g[0]!;
  if ((first & 0xfe00) === 0xfc00) return "unique-local";
  if ((first & 0xffc0) === 0xfe80) return "link-local";
  if ((first & 0xff00) === 0xff00) return "multicast";
  if (first === 0x0064 && g[1] === 0xff9b) return "nat64";
  if (first === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return "discard";
  if (first === 0x2002) {
    // 6to4 wraps an IPv4 address in the next 32 bits
    const v4 = `${(g[1]! >> 8) & 0xff}.${g[1]! & 0xff}.${(g[2]! >> 8) & 0xff}.${g[2]! & 0xff}`;
    const r = blockedV4(v4);
    return r ? `6to4:${r}` : null;
  }
  return null;
}

/** Returns a reason string when the literal IP is in a blocked range, otherwise null. */
export function blockedIpReason(ip: string): string | null {
  const fam = isIP(ip);
  if (fam === 4) return blockedV4(ip);
  if (fam === 6) return blockedV6(ip);
  return "not-an-ip";
}

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

/** Fetches a public https URL and returns its readable text. Throws `UnsafeUrlError` when blocked. */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  const doFetch = opts.fetchImpl ?? fetch;
  const resolveHost = opts.resolveHost ?? defaultResolveHost;
  const redirects: string[] = [];

  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const { url } = await assertPublicUrl(current, resolveHost);
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
