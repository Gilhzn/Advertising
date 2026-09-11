import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CloudflareClient } from "./cloudflare.js";

const BASE = "https://cf.test/client/v4";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function ok<T>(result: T, extra: Record<string, unknown> = {}) {
  return HttpResponse.json({ success: true, errors: [], messages: [], result, ...extra });
}

function client() {
  return new CloudflareClient({ apiToken: "test-token", baseUrl: BASE });
}

describe("CloudflareClient", () => {
  it("throws when no token is configured", () => {
    const prev = process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_API_TOKEN;
    try {
      expect(() => new CloudflareClient({ baseUrl: BASE })).toThrow(/CLOUDFLARE_API_TOKEN/);
    } finally {
      if (prev !== undefined) process.env.CLOUDFLARE_API_TOKEN = prev;
    }
  });

  it("sends the bearer token on every request", async () => {
    let seenAuth: string | null = null;
    server.use(
      http.get(`${BASE}/zones`, ({ request }) => {
        seenAuth = request.headers.get("authorization");
        return ok([]);
      }),
    );
    await client().listZones();
    expect(seenAuth).toBe("Bearer test-token");
  });

  it("findZoneForDomain walks up to the parent zone for a subdomain", async () => {
    const seenNames: string[] = [];
    server.use(
      http.get(`${BASE}/zones`, ({ request }) => {
        const name = new URL(request.url).searchParams.get("name") ?? "";
        seenNames.push(name);
        if (name === "example.com") {
          return ok([
            { id: "zone_1", name: "example.com", status: "active", account: { id: "acc_1", name: "Acme" } },
          ]);
        }
        return ok([]);
      }),
    );
    const zone = await client().findZoneForDomain("mail.example.com");
    expect(zone?.id).toBe("zone_1");
    expect(seenNames).toEqual(["mail.example.com", "example.com"]);
  });

  it("findZoneForDomain returns null when nothing matches", async () => {
    server.use(http.get(`${BASE}/zones`, () => ok([])));
    const zone = await client().findZoneForDomain("nowhere.example.com");
    expect(zone).toBeNull();
  });

  it("upsertDnsRecord creates a new CNAME when none exists", async () => {
    let created: unknown;
    server.use(
      http.get(`${BASE}/zones/z1/dns_records`, () => ok([])),
      http.post(`${BASE}/zones/z1/dns_records`, async ({ request }) => {
        created = await request.json();
        return ok({ id: "rec_1", ...(created as object) }, {});
      }),
    );
    const rec = await client().upsertDnsRecord("z1", {
      type: "CNAME",
      name: "key1._domainkey",
      content: "target.example.com",
    });
    expect(rec.id).toBe("rec_1");
    expect(created).toMatchObject({ type: "CNAME", name: "key1._domainkey", content: "target.example.com" });
  });

  it("upsertDnsRecord is a no-op when an identical record already exists", async () => {
    let postCalled = false;
    server.use(
      http.get(`${BASE}/zones/z1/dns_records`, () =>
        ok([{ id: "rec_1", type: "CNAME", name: "key1._domainkey", content: "target.example.com", ttl: 1 }]),
      ),
      http.post(`${BASE}/zones/z1/dns_records`, () => {
        postCalled = true;
        return ok({});
      }),
    );
    const rec = await client().upsertDnsRecord("z1", {
      type: "CNAME",
      name: "key1._domainkey",
      content: "target.example.com",
    });
    expect(rec.id).toBe("rec_1");
    expect(postCalled).toBe(false);
  });

  it("upsertDnsRecord allows multiple TXT records under the same name (matches by content too)", async () => {
    let postCount = 0;
    server.use(
      http.get(`${BASE}/zones/z1/dns_records`, () =>
        ok([{ id: "rec_spf", type: "TXT", name: "@", content: "v=spf1 include:spf.migadu.com -all" }]),
      ),
      http.post(`${BASE}/zones/z1/dns_records`, async ({ request }) => {
        postCount++;
        const body = (await request.json()) as object;
        return ok({ id: "rec_verify", ...body });
      }),
    );
    const rec = await client().upsertDnsRecord("z1", {
      type: "TXT",
      name: "@",
      content: "hosted-email-verify=abc",
    });
    expect(rec.id).toBe("rec_verify");
    expect(postCount).toBe(1);
  });

  it("enableEmailRouting skips the enable call when already enabled", async () => {
    let enableCalled = false;
    server.use(
      http.get(`${BASE}/zones/z1/email/routing`, () => ok({ enabled: true, status: "ready" })),
      http.post(`${BASE}/zones/z1/email/routing/enable`, () => {
        enableCalled = true;
        return ok({ enabled: true });
      }),
    );
    const settings = await client().enableEmailRouting("z1");
    expect(settings.enabled).toBe(true);
    expect(enableCalled).toBe(false);
  });

  it("createDestinationAddress is idempotent", async () => {
    let postCount = 0;
    server.use(
      http.get(`${BASE}/accounts/acc1/email/routing/addresses`, () =>
        ok([{ id: "dst_1", email: "owner@gmail.com", verified: "2024-01-01T00:00:00Z" }]),
      ),
      http.post(`${BASE}/accounts/acc1/email/routing/addresses`, () => {
        postCount++;
        return ok({ id: "dst_new", email: "owner@gmail.com" });
      }),
    );
    const dest = await client().createDestinationAddress("acc1", "owner@gmail.com");
    expect(dest.id).toBe("dst_1");
    expect(postCount).toBe(0);
  });

  it("createRoutingRule creates a rule matching the address to the destination", async () => {
    let createdBody: unknown;
    server.use(
      http.get(`${BASE}/zones/z1/email/routing/rules`, () => ok([])),
      http.post(`${BASE}/zones/z1/email/routing/rules`, async ({ request }) => {
        createdBody = await request.json();
        return ok({ id: "rule_1", enabled: true, matchers: [], actions: [] });
      }),
    );
    const rule = await client().createRoutingRule("z1", {
      matcherEmail: "hello@example.com",
      forwardTo: "owner@gmail.com",
    });
    expect(rule.id).toBe("rule_1");
    expect(createdBody).toMatchObject({
      matchers: [{ type: "literal", field: "to", value: "hello@example.com" }],
      actions: [{ type: "forward", value: ["owner@gmail.com"] }],
    });
  });

  it("createRoutingRule returns the existing rule instead of duplicating it", async () => {
    let postCalled = false;
    server.use(
      http.get(`${BASE}/zones/z1/email/routing/rules`, () =>
        ok([
          {
            id: "rule_existing",
            enabled: true,
            matchers: [{ type: "literal", field: "to", value: "hello@example.com" }],
            actions: [{ type: "forward", value: ["owner@gmail.com"] }],
          },
        ]),
      ),
      http.post(`${BASE}/zones/z1/email/routing/rules`, () => {
        postCalled = true;
        return ok({ id: "rule_new" });
      }),
    );
    const rule = await client().createRoutingRule("z1", {
      matcherEmail: "hello@example.com",
      forwardTo: "owner@gmail.com",
    });
    expect(rule.id).toBe("rule_existing");
    expect(postCalled).toBe(false);
  });

  it("getRoutingDnsRequirements returns the required MX/TXT records", async () => {
    server.use(
      http.get(`${BASE}/zones/z1/email/routing/dns`, () =>
        ok([
          { type: "MX", name: "example.com", content: "route1.mx.cloudflare.net", priority: 41 },
          { type: "TXT", name: "example.com", content: "v=spf1 include:_spf.mx.cloudflare.net ~all" },
        ]),
      ),
    );
    const records = await client().getRoutingDnsRequirements("z1");
    expect(records).toHaveLength(2);
    expect(records[0]?.type).toBe("MX");
  });

  it("throws EmailProviderError on a Cloudflare API error envelope", async () => {
    server.use(
      http.get(`${BASE}/zones/bad/dns_records`, () =>
        HttpResponse.json(
          { success: false, errors: [{ code: 1003, message: "Invalid zone" }], messages: [] },
          { status: 400 },
        ),
      ),
    );
    const err = await client()
      .listDnsRecords("bad")
      .catch((e) => e);
    expect(err.name).toBe("EmailProviderError");
    expect(err.provider).toBe("cloudflare");
  });
});
