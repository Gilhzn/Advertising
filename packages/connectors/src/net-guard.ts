import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { PlatformId } from "@adv/shared";
import { ConnectorError } from "./connector.js";

/**
 * SSRF guard for URLs that reach the worker/web tier from users or from model output
 * (media URLs, self-hosted PDS hosts). Rejects non-https schemes, credentials in the URL,
 * and any hostname whose DNS answers include a private, loopback, link-local, multicast or
 * cloud-metadata address. Callers must also fetch with `redirect: "manual"` and re-check hops.
 */

const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost", ".home.arpa", ".lan"];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

function inCidr4(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/") as [string, string];
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

const BLOCKED_V4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/3",
];

export function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return BLOCKED_V4.some((c) => inCidr4(ip, c));
  if (family === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    // IPv4-mapped / IPv4-compatible
    const mapped = lower.match(/^(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1] as string);
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA fc00::/7
    if (
      lower.startsWith("fe8") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb")
    )
      return true; // link-local
    if (lower.startsWith("ff")) return true; // multicast
    if (lower.startsWith("2002:")) return true; // 6to4 (embeds v4)
    if (lower.startsWith("64:ff9b:")) return true; // NAT64
    return false;
  }
  return true; // not an IP at all
}

export interface PublicUrlOptions {
  platform: PlatformId;
  /** allow http: in addition to https: (default false) */
  allowHttp?: boolean;
  /** injectable resolver for tests */
  resolve?: (host: string) => Promise<Array<{ address: string; family: number }>>;
}

/** Validates the URL and resolves the host; throws ConnectorError("rejected") on anything non-public. */
export async function assertPublicUrl(raw: string, opts: PublicUrlOptions): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConnectorError("URL is not valid", opts.platform, "rejected", false);
  }
  const okProtocol = url.protocol === "https:" || (opts.allowHttp && url.protocol === "http:");
  if (!okProtocol)
    throw new ConnectorError(`URL scheme ${url.protocol} is not allowed`, opts.platform, "rejected", false);
  if (url.username || url.password)
    throw new ConnectorError("URL must not contain credentials", opts.platform, "rejected", false);
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new ConnectorError("URL host is not public", opts.platform, "rejected", false);
  }
  if (isIP(host)) {
    if (isBlockedIp(host))
      throw new ConnectorError("URL host is not public", opts.platform, "rejected", false);
    return url;
  }
  // Unit tests use msw with fictional hostnames that never resolve. Only when no resolver is injected
  // and we are under Vitest, skip the DNS step (literal IPs and blocked suffixes are still enforced).
  if (!opts.resolve && process.env.NODE_ENV === "test" && process.env.ADV_NET_GUARD !== "strict") {
    return url;
  }
  const resolve = opts.resolve ?? ((h: string) => lookup(h, { all: true }));
  let answers: Array<{ address: string; family: number }>;
  try {
    answers = await resolve(host);
  } catch {
    throw new ConnectorError(`URL host ${host} does not resolve`, opts.platform, "rejected", false);
  }
  if (answers.length === 0 || answers.some((a) => isBlockedIp(a.address))) {
    throw new ConnectorError("URL host is not public", opts.platform, "rejected", false);
  }
  return url;
}
