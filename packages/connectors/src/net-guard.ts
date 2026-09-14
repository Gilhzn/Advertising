import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { BLOCKED_HOST_SUFFIXES, blockedIpReason, type PlatformId } from "@adv/shared";
import { type PinnedAddress, pinnedFetch } from "@adv/shared/pinned-fetch";
import { ConnectorError } from "./connector.js";

/**
 * SSRF guard for URLs that reach the worker/web tier from users or from model output
 * (media URLs, self-hosted PDS hosts). Rejects non-https schemes, credentials in the URL,
 * and any hostname whose DNS answers include a private, loopback, link-local, multicast or
 * cloud-metadata address. Callers must also fetch with `redirect: "manual"` and re-check hops.
 */

/**
 * The IP-range classifier used to live here as a second, hand-rolled implementation. It classified
 * IPv6 by string prefix and only matched IPv4-mapped addresses spelled with a dotted quad, so
 * `https://[::ffff:a9fe:a9fe]/` - the cloud metadata endpoint written in hex - passed the guard.
 * There is now one shared implementation in `@adv/shared` that both SSRF guards call.
 */
export { blockedIpReason } from "@adv/shared";

/** Kept as a named export because callers and tests import it from here. */
export function isBlockedIp(ip: string): boolean {
  return blockedIpReason(ip) !== null;
}

export interface PublicUrlOptions {
  platform: PlatformId;
  /** allow http: in addition to https: (default false) */
  allowHttp?: boolean;
  /** injectable resolver for tests */
  resolve?: (host: string) => Promise<Array<{ address: string; family: number }>>;
}

/**
 * Validates the URL and resolves the host, returning the addresses it validated so the caller can
 * pin the connection to them. Throws ConnectorError("rejected") on anything non-public.
 *
 * Returning the addresses matters: validating a name and then calling bare `fetch()` re-resolves it,
 * which a DNS-rebinding host defeats. `pinnedFetchFor` below turns this result into a fetch that
 * can only reach the address that was actually checked.
 */
export async function assertPublicUrlWithAddresses(
  raw: string,
  opts: PublicUrlOptions,
): Promise<{ url: URL; addresses: PinnedAddress[] }> {
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
    return { url, addresses: [{ address: host, family: isIP(host) as 4 | 6 }] };
  }
  // Unit tests drive msw with fictional hostnames that never resolve, so the DNS step has to be
  // skippable. That skip is opt-IN and fails closed: it needs this one explicit variable, which only
  // the test setup sets. Keying it off NODE_ENV instead would silently disable the guard on any host
  // that happens to run with NODE_ENV=test. Literal IPs and blocked suffixes are enforced either way.
  if (!opts.resolve && process.env.ADV_NET_GUARD_ALLOW_UNRESOLVABLE === "1") {
    return { url, addresses: [] };
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
  const first = answers[0] as { address: string; family: number };
  return { url, addresses: [{ address: first.address, family: first.family === 6 ? 6 : 4 }] };
}

/** Back-compat wrapper for the many call sites that only need the validated URL. */
export async function assertPublicUrl(raw: string, opts: PublicUrlOptions): Promise<URL> {
  return (await assertPublicUrlWithAddresses(raw, opts)).url;
}

/**
 * A `fetch` bound to the addresses `assertPublicUrlWithAddresses` validated, so the request cannot
 * be re-pointed at a private address between the check and the connection. Falls back to global
 * `fetch` only when there is nothing to pin (the test-only unresolvable path), which is the same
 * risk posture that path already carries.
 */
export function pinnedFetchFor(addresses: PinnedAddress[]): typeof fetch {
  const first = addresses[0];
  return first ? pinnedFetch(first) : fetch;
}

/**
 * Returns `raw` when it is an http(s) URL, otherwise null.
 *
 * Used at every boundary where a URL we did not construct gets STORED and later rendered as an
 * `href`: `PublishResult.url` comes straight out of a third-party API response, and the assisted
 * connectors take whatever the user pastes. `new URL()` happily parses `javascript:alert(1)`, so
 * parsing was never the check - the scheme is. This is a cheap syntactic filter, not the SSRF
 * guard: nothing is fetched from these URLs.
 */
export function safeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
