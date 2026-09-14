import { describe, expect, it, vi } from "vitest";
import { assertPublicUrl, assertPublicUrlWithAddresses, isBlockedIp } from "./net-guard.js";

const pub = async () => [{ address: "93.184.216.34", family: 4 }];
const priv = async () => [
  { address: "93.184.216.34", family: 4 },
  { address: "169.254.169.254", family: 4 },
];

describe("net-guard", () => {
  it("blocks private, loopback, link-local, metadata and mapped v6", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.5.5",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "::ffff:127.0.0.1",
      "fd00::1",
      "fe80::1",
      "2002:7f00:1::",
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
    expect(isBlockedIp("93.184.216.34")).toBe(false);
    expect(isBlockedIp("2606:2800:220:1:248:1893:25c8:1946")).toBe(false);
  });
  it("accepts a public https host", async () => {
    const u = await assertPublicUrl("https://example.com/a.png", { platform: "bluesky", resolve: pub });
    expect(u.hostname).toBe("example.com");
  });
  it("rejects http by default, credentials, literal private IPs and blocked suffixes", async () => {
    await expect(
      assertPublicUrl("http://example.com/", { platform: "bluesky", resolve: pub }),
    ).rejects.toThrow(/scheme/);
    await expect(
      assertPublicUrl("https://u:p@example.com/", { platform: "bluesky", resolve: pub }),
    ).rejects.toThrow(/credentials/);
    await expect(assertPublicUrl("https://169.254.169.254/latest", { platform: "bluesky" })).rejects.toThrow(
      /not public/,
    );
    await expect(
      assertPublicUrl("https://db.internal/", { platform: "bluesky", resolve: pub }),
    ).rejects.toThrow(/not public/);
  });
  it("rejects a host with any private DNS answer (rebinding)", async () => {
    await expect(
      assertPublicUrl("https://rebind.example/", { platform: "bluesky", resolve: priv }),
    ).rejects.toThrow(/not public/);
  });
});

describe("net-guard fails closed", () => {
  it("still resolves DNS when the test opt-in is absent, whatever NODE_ENV says", async () => {
    vi.stubEnv("ADV_NET_GUARD_ALLOW_UNRESOLVABLE", "");
    vi.stubEnv("NODE_ENV", "test");
    // A host that resolves to a private address must be rejected even under NODE_ENV=test: the skip
    // is opt-in, so a deployment that happens to run with NODE_ENV=test keeps full protection.
    await expect(
      assertPublicUrl("https://internal.example/", {
        platform: "bluesky",
        resolve: async () => [{ address: "10.0.0.5", family: 4 }],
      }),
    ).rejects.toThrow(/not public/);
    vi.unstubAllEnvs();
  });

  it("only skips DNS when the opt-in is set and no resolver was injected", async () => {
    vi.stubEnv("ADV_NET_GUARD_ALLOW_UNRESOLVABLE", "1");
    const u = await assertPublicUrl("https://does-not-exist.invalid/x.png", { platform: "bluesky" });
    expect(u.hostname).toBe("does-not-exist.invalid");
    // An injected resolver always wins: the opt-in never bypasses an explicit check.
    await expect(
      assertPublicUrl("https://does-not-exist.invalid/x.png", {
        platform: "bluesky",
        resolve: async () => [{ address: "127.0.0.1", family: 4 }],
      }),
    ).rejects.toThrow(/not public/);
    vi.unstubAllEnvs();
  });
});

describe("IPv6 forms that previously bypassed the guard", () => {
  // `::ffff:a9fe:a9fe` IS 169.254.169.254 - the cloud metadata endpoint. The old classifier matched
  // IPv4-mapped addresses only when they were written with a dotted quad, and WHATWG `URL`
  // normalises the readable spelling INTO the hex one, so the human-readable form also escaped.
  it.each([
    "::ffff:a9fe:a9fe",
    "::ffff:7f00:1",
    "::ffff:169.254.169.254",
    "::ffff:0:7f00:1",
    "::0.0.0.0",
    "2002:a9fe:a9fe::",
    "64:ff9b::a9fe:a9fe",
    "fd00::1",
    "fe80::1",
    "ff02::1",
    "::1",
    "::",
  ])("blocks %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111"])("still allows %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });

  it("rejects a URL whose host is the metadata endpoint written as hex IPv6", async () => {
    await expect(
      assertPublicUrl("https://[::ffff:a9fe:a9fe]/latest/meta-data/", { platform: "reddit" }),
    ).rejects.toThrow(/not public/);
  });
});

describe("address pinning", () => {
  it("returns the validated address so the caller can pin the connection to it", async () => {
    const { url, addresses } = await assertPublicUrlWithAddresses("https://cdn.example.com/a.png", {
      platform: "reddit",
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
    });
    expect(url.hostname).toBe("cdn.example.com");
    expect(addresses).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });

  it("rejects before returning any address when a DNS answer is private", async () => {
    await expect(
      assertPublicUrlWithAddresses("https://rebind.example.com/a.png", {
        platform: "reddit",
        resolve: async () => [
          { address: "93.184.216.34", family: 4 },
          { address: "169.254.169.254", family: 4 },
        ],
      }),
    ).rejects.toThrow(/not public/);
  });
});
