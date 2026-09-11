import { describe, expect, it } from "vitest";
import { assertPublicUrl, isBlockedIp } from "./net-guard.js";

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
