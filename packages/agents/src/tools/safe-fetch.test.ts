import { describe, expect, it } from "vitest";
import {
  assertPublicUrl,
  blockedIpReason,
  htmlToText,
  type ResolveHost,
  safeFetch,
  UnsafeUrlError,
} from "./safe-fetch.js";

const publicResolver: ResolveHost = async () => [{ address: "93.184.216.34", family: 4 }];
const privateResolver: ResolveHost = async () => [{ address: "10.1.2.3", family: 4 }];
const mixedResolver: ResolveHost = async () => [
  { address: "93.184.216.34", family: 4 },
  { address: "127.0.0.1", family: 4 },
];

describe("blockedIpReason", () => {
  it("blocks the IPv4 ranges that matter", () => {
    expect(blockedIpReason("127.0.0.1")).toBe("loopback");
    expect(blockedIpReason("10.0.0.7")).toBe("private");
    expect(blockedIpReason("172.16.0.1")).toBe("private");
    expect(blockedIpReason("172.31.255.255")).toBe("private");
    expect(blockedIpReason("192.168.1.1")).toBe("private");
    expect(blockedIpReason("169.254.169.254")).toBe("link-local/metadata");
    expect(blockedIpReason("100.64.0.1")).toBe("cgnat");
    expect(blockedIpReason("0.0.0.0")).toBe("this-network");
    expect(blockedIpReason("224.0.0.1")).toBe("multicast");
    expect(blockedIpReason("255.255.255.255")).toBe("reserved");
  });

  it("allows public IPv4", () => {
    expect(blockedIpReason("93.184.216.34")).toBeNull();
    expect(blockedIpReason("8.8.8.8")).toBeNull();
    expect(blockedIpReason("172.32.0.1")).toBeNull();
  });

  it("blocks the IPv6 ranges that matter", () => {
    expect(blockedIpReason("::1")).toBe("loopback");
    expect(blockedIpReason("::")).toBe("unspecified");
    expect(blockedIpReason("fc00::1")).toBe("unique-local");
    expect(blockedIpReason("fd12:3456::1")).toBe("unique-local");
    expect(blockedIpReason("fe80::1")).toBe("link-local");
    expect(blockedIpReason("ff02::1")).toBe("multicast");
    expect(blockedIpReason("::ffff:169.254.169.254")).toBe("ipv4-mapped:link-local/metadata");
    expect(blockedIpReason("2002:7f00:0001::")).toBe("6to4:loopback");
  });

  it("allows public IPv6", () => {
    expect(blockedIpReason("2606:2800:220:1:248:1893:25c8:1946")).toBeNull();
  });
});

describe("assertPublicUrl", () => {
  it("refuses non-https schemes", async () => {
    await expect(assertPublicUrl("http://example.com", publicResolver)).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicUrl("file:///etc/passwd", publicResolver)).rejects.toThrow(/only https/);
  });

  it("refuses credentials in the URL", async () => {
    await expect(assertPublicUrl("https://user:pw@example.com", publicResolver)).rejects.toThrow(
      /credentials/,
    );
  });

  it("refuses local names and literal private addresses", async () => {
    await expect(assertPublicUrl("https://localhost/x", publicResolver)).rejects.toThrow(/local name/);
    await expect(assertPublicUrl("https://foo.internal/x", publicResolver)).rejects.toThrow(/local name/);
    await expect(assertPublicUrl("https://127.0.0.1/x")).rejects.toThrow(/loopback/);
    await expect(assertPublicUrl("https://169.254.169.254/latest/meta-data/")).rejects.toThrow(
      /link-local\/metadata/,
    );
    await expect(assertPublicUrl("https://[::1]/x")).rejects.toThrow(/loopback/);
  });

  it("refuses a public name that resolves to a private address", async () => {
    await expect(assertPublicUrl("https://evil.example/x", privateResolver)).rejects.toThrow(
      /resolves to 10\.1\.2\.3/,
    );
  });

  it("refuses when ANY answer is private", async () => {
    await expect(assertPublicUrl("https://evil.example/x", mixedResolver)).rejects.toThrow(/127\.0\.0\.1/);
  });

  it("accepts a public https URL", async () => {
    const { url, addresses } = await assertPublicUrl("https://example.com/page", publicResolver);
    expect(url.hostname).toBe("example.com");
    expect(addresses).toHaveLength(1);
  });
});

describe("htmlToText", () => {
  it("removes scripts, styles and tags", () => {
    const text = htmlToText(
      `<html><head><style>body{color:red}</style><script>alert("x")</script></head>
       <body><!-- hi --><h1>Title</h1><p>Hello &amp; welcome</p><script src="a.js"></script></body></html>`,
    );
    expect(text).toContain("Title");
    expect(text).toContain("Hello & welcome");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("<");
  });
});

function jsonFetch(pages: Record<string, Response>): typeof fetch {
  return (async (input: string | URL) => {
    const key = typeof input === "string" ? input : input.toString();
    const res = pages[key];
    if (!res) throw new Error(`unexpected fetch: ${key}`);
    return res.clone();
  }) as unknown as typeof fetch;
}

describe("safeFetch", () => {
  it("returns stripped text for an html page", async () => {
    const result = await safeFetch("https://example.com/a", {
      resolveHost: publicResolver,
      fetchImpl: jsonFetch({
        "https://example.com/a": new Response("<p>Hi <script>bad()</script>there</p>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      }),
    });
    expect(result.status).toBe(200);
    expect(result.text).toBe("Hi there");
    expect(result.truncated).toBe(false);
  });

  it("follows up to 3 redirects and re-validates each target", async () => {
    const pages: Record<string, Response> = {
      "https://example.com/1": new Response(null, { status: 302, headers: { location: "/2" } }),
      "https://example.com/2": new Response(null, { status: 302, headers: { location: "/3" } }),
      "https://example.com/3": new Response("final", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    };
    const result = await safeFetch("https://example.com/1", {
      resolveHost: publicResolver,
      fetchImpl: jsonFetch(pages),
    });
    expect(result.text).toBe("final");
    expect(result.redirects).toEqual(["https://example.com/2", "https://example.com/3"]);
  });

  it("refuses a redirect chain longer than the limit", async () => {
    const loop = jsonFetch({
      "https://example.com/loop": new Response(null, { status: 302, headers: { location: "/loop" } }),
    });
    await expect(
      safeFetch("https://example.com/loop", { resolveHost: publicResolver, fetchImpl: loop }),
    ).rejects.toThrow(/too many redirects/);
  });

  it("re-validates a redirect into a private address", async () => {
    const resolver: ResolveHost = async (host) =>
      host === "example.com"
        ? [{ address: "93.184.216.34", family: 4 }]
        : [{ address: "192.168.0.5", family: 4 }];
    const pages = jsonFetch({
      "https://example.com/x": new Response(null, {
        status: 302,
        headers: { location: "https://intranet.example/secret" },
      }),
    });
    await expect(
      safeFetch("https://example.com/x", { resolveHost: resolver, fetchImpl: pages }),
    ).rejects.toThrow(/192\.168\.0\.5/);
  });

  it("caps the body and reports truncation", async () => {
    const big = "x".repeat(5000);
    const result = await safeFetch("https://example.com/big", {
      resolveHost: publicResolver,
      maxBytes: 1024,
      fetchImpl: jsonFetch({
        "https://example.com/big": new Response(big, {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      }),
    });
    expect(result.truncated).toBe(true);
    expect(result.bytes).toBe(1024);
    expect(result.text.length).toBe(1024);
  });

  it("refuses an oversized declared content-length", async () => {
    await expect(
      safeFetch("https://example.com/huge", {
        resolveHost: publicResolver,
        maxBytes: 1024,
        fetchImpl: jsonFetch({
          "https://example.com/huge": new Response("x", {
            status: 200,
            headers: { "content-type": "text/plain", "content-length": "999999" },
          }),
        }),
      }),
    ).rejects.toThrow(/cap is 1024/);
  });
});
