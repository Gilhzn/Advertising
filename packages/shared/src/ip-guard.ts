import { isIP } from "node:net";

/**
 * Canonical IP-range classifier, shared by every SSRF guard in the repo.
 *
 * It lives here rather than in either guard because there were two hand-rolled copies and they did
 * not agree: the connector guard classified IPv6 by string prefix and only recognised IPv4-mapped
 * addresses written with a dotted quad, so `https://[::ffff:a9fe:a9fe]/` - which is
 * 169.254.169.254, the cloud metadata endpoint - passed straight through it. Expanding the address
 * into its eight groups before classifying is the only way to get this right, so there is now one
 * implementation and both guards call it.
 *
 * Behind the `@adv/shared/ip-guard` subpath rather than the package root: it imports `node:net`, and
 * the root index reaches client components in the dashboard, where bundling a node builtin fails.
 */

/** Host suffixes that never belong to a public host, whatever DNS says. */
export const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost", ".home.arpa", ".lan"];

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
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d. Both spellings of the same address
  // (`::ffff:169.254.169.254` and `::ffff:a9fe:a9fe`) expand to identical groups here, which is the
  // whole point of expanding before classifying.
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    const v4 = `${(g[6]! >> 8) & 0xff}.${g[6]! & 0xff}.${(g[7]! >> 8) & 0xff}.${g[7]! & 0xff}`;
    return blockedV4(v4) ? `ipv4-mapped:${blockedV4(v4)}` : null;
  }
  // IPv4-translated ::ffff:0:a.b.c.d (RFC 2765, ::ffff:0:0/96). Linux does not route it to IPv4, so
  // this is hardening rather than a live bypass - but it costs one branch to close.
  if (g.slice(0, 4).every((x) => x === 0) && g[4] === 0xffff && g[5] === 0) {
    const v4 = `${(g[6]! >> 8) & 0xff}.${g[6]! & 0xff}.${(g[7]! >> 8) & 0xff}.${g[7]! & 0xff}`;
    const r = blockedV4(v4);
    return r ? `ipv4-translated:${r}` : null;
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
