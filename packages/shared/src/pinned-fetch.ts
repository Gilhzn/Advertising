import { Agent as UndiciAgent, fetch as undiciFetch } from "undici";

/**
 * Address pinning for SSRF guards.
 *
 * Validating a hostname and then calling bare `fetch()` resolves the name a *second* time, so a
 * host serving a 0-TTL record that answers public-then-private wins the race and the guard is
 * bypassed (DNS rebinding). Pinning forces the connection to the exact address that was validated.
 * TLS still verifies the original hostname, so this does not weaken certificate checking.
 *
 * Lives behind the `@adv/shared/pinned-fetch` subpath rather than the package root so the Next.js
 * dashboard, which only imports the root, never pulls `undici` into its bundle.
 */

export interface PinnedAddress {
  address: string;
  family: 4 | 6;
}

export function createPinnedDispatcher(pinned: PinnedAddress): UndiciAgent {
  // node's dns.lookup callback shape; undici types it as the `net.LookupFunction`
  const lookup = (_host: string, options: unknown, cb: (...args: unknown[]) => void) => {
    const all = typeof options === "object" && options !== null && (options as { all?: boolean }).all;
    if (all) cb(null, [{ address: pinned.address, family: pinned.family }]);
    else cb(null, pinned.address, pinned.family);
  };
  return new UndiciAgent({ connect: { lookup: lookup as unknown as undefined } });
}

/** A `fetch` that will only ever connect to `pinned`, whatever DNS says at request time. */
export function pinnedFetch(pinned: PinnedAddress): typeof fetch {
  const dispatcher = createPinnedDispatcher(pinned);
  return ((input: string | URL | Request, init?: RequestInit) =>
    undiciFetch(input as string, { ...(init as object), dispatcher } as never) as unknown as Promise<Response>) as typeof fetch;
}
