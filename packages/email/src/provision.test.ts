import { randomUUID } from "node:crypto";
import { businesses, eq, getDb, mailboxes, users } from "@adv/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CloudflareClient, CloudflareZone, DnsRecordInput } from "./cloudflare.js";
import type { MigaduClient } from "./migadu.js";
import { requiredDnsRecords } from "./migadu.js";
import type { DnsResolver } from "./provision.js";
import { provisionMailbox, verifyMailboxDns } from "./provision.js";

process.env.DATABASE_URL ??= "postgres://adv:adv@localhost:5432/adv";
process.env.TOKEN_ENCRYPTION_KEY ??= "1".repeat(64);

const db = getDb();
const testEmail = `email-pkg-test-${randomUUID()}@example.com`;
let businessId = "";

beforeAll(async () => {
  const [user] = await db
    .insert(users)
    .values({ email: testEmail, name: "Email Pkg Test" })
    .returning({ id: users.id });
  if (!user) throw new Error("failed to create test user");
  const [business] = await db
    .insert(businesses)
    .values({
      userId: user.id,
      name: "Email Pkg Test Biz",
      slug: `email-pkg-test-${randomUUID()}`,
      description:
        "A test business created by packages/email's provision.test.ts to exercise provisionMailbox.",
      // provisionMailbox refuses a domain that is not the one recorded on the business.
      domain: "example.com",
    })
    .returning({ id: businesses.id });
  if (!business) throw new Error("failed to create test business");
  businessId = business.id;
});

afterAll(async () => {
  if (businessId) {
    await db.delete(mailboxes).where(eq(mailboxes.businessId, businessId));
    await db.delete(businesses).where(eq(businesses.id, businessId));
  }
  await db.delete(users).where(eq(users.email, testEmail));
});

const zone: CloudflareZone = {
  id: "zone_1",
  name: "example.com",
  status: "active",
  account: { id: "acc_1", name: "Acme" },
};

function fakeCloudflare(overrides: Partial<CloudflareClient> = {}): CloudflareClient {
  const base = {
    findZoneForDomain: async (_domain: string) => zone,
    enableEmailRouting: async () => ({ enabled: true }),
    getRoutingDnsRequirements: async (): Promise<DnsRecordInput[]> => [
      { type: "MX", name: "example.com", content: "route1.mx.cloudflare.net", priority: 41, ttl: 3600 },
      { type: "TXT", name: "example.com", content: "v=spf1 include:_spf.mx.cloudflare.net ~all", ttl: 3600 },
    ],
    upsertDnsRecord: async (_zoneId: string, record: DnsRecordInput) => ({
      id: `rec_${record.type}`,
      ...record,
    }),
    createDestinationAddress: async () => ({
      id: "dst_1",
      email: "owner@gmail.com",
      verified: null as string | null,
    }),
    createRoutingRule: async () => ({ id: "rule_1", enabled: true, matchers: [], actions: [] }),
    ...overrides,
  };
  return base as unknown as CloudflareClient;
}

function fakeMigadu(overrides: Partial<MigaduClient> = {}): MigaduClient {
  const base = {
    createMailbox: async (_domain: string, input: { localPart: string; name: string; password: string }) => ({
      local_part: input.localPart,
      domain_name: "example.com",
      address: `${input.localPart}@example.com`,
      name: input.name,
    }),
    ...overrides,
  };
  return base as unknown as MigaduClient;
}

async function findRow(address: string) {
  const rows = await db.select().from(mailboxes).where(eq(mailboxes.address, address));
  return rows[0];
}

describe("provisionMailbox (cloudflare_routing)", () => {
  it("provisions a routing rule, upserts DNS, and is 'provisioning' while the destination address is unverified", async () => {
    const address = `hello-${randomUUID().slice(0, 8)}@example.com`;
    const [localPart] = address.split("@");
    const result = await provisionMailbox(
      {
        businessId,
        domain: "example.com",
        localPart: localPart ?? "hello",
        forwardTo: "owner@gmail.com",
        provider: "cloudflare_routing",
      },
      { db, cloudflare: fakeCloudflare() },
    );
    expect(result.address).toBe(address);
    expect(result.status).toBe("provisioning");
    expect(result.dnsRecords).toHaveLength(2);
    expect(result.credentialsOnce).toBeUndefined();

    const row = await findRow(address);
    expect(row?.status).toBe("provisioning");
    expect(row?.provider).toBe("cloudflare_routing");
    expect(row?.forwardTo).toBe("owner@gmail.com");
  });

  it("is 'active' once the destination address is verified", async () => {
    const address = `hello-${randomUUID().slice(0, 8)}@example.com`;
    const [localPart] = address.split("@");
    const result = await provisionMailbox(
      {
        businessId,
        domain: "example.com",
        localPart: localPart ?? "hello",
        forwardTo: "owner@gmail.com",
        provider: "cloudflare_routing",
      },
      {
        db,
        cloudflare: fakeCloudflare({
          createDestinationAddress: async () => ({
            id: "dst_1",
            email: "owner@gmail.com",
            verified: "2024-01-01T00:00:00Z",
          }),
        }),
      },
    );
    expect(result.status).toBe("active");
  });

  it("re-running with the same address updates the existing row instead of inserting a duplicate", async () => {
    const address = `hello-${randomUUID().slice(0, 8)}@example.com`;
    const [localPart] = address.split("@");
    const input = {
      businessId,
      domain: "example.com",
      localPart: localPart ?? "hello",
      forwardTo: "owner@gmail.com",
      provider: "cloudflare_routing" as const,
    };
    const first = await provisionMailbox(input, { db, cloudflare: fakeCloudflare() });
    const second = await provisionMailbox(input, { db, cloudflare: fakeCloudflare() });
    expect(second.mailboxId).toBe(first.mailboxId);

    const rows = await db.select().from(mailboxes).where(eq(mailboxes.address, address));
    expect(rows).toHaveLength(1);
  });

  it("records last_error and status 'error' when no Cloudflare zone is found for the domain", async () => {
    // The business's own domain, so this exercises the zone lookup rather than the ownership gate.
    const address = `hello-${randomUUID().slice(0, 8)}@example.com`;
    const [localPart] = address.split("@");
    await expect(
      provisionMailbox(
        {
          businessId,
          domain: "example.com",
          localPart: localPart ?? "hello",
          forwardTo: "owner@gmail.com",
          provider: "cloudflare_routing",
        },
        { db, cloudflare: fakeCloudflare({ findZoneForDomain: async () => null }) },
      ),
    ).rejects.toMatchObject({ provider: "provision" });

    const row = await findRow(address);
    expect(row?.status).toBe("error");
    expect(row?.lastError).toMatch(/no Cloudflare zone found/);
  });
});

describe("provisionMailbox (migadu)", () => {
  it("creates the mailbox, encrypts the generated password, and returns it once", async () => {
    const address = `hello-${randomUUID().slice(0, 8)}@example.com`;
    const [localPart] = address.split("@");
    const result = await provisionMailbox(
      { businessId, domain: "example.com", localPart: localPart ?? "hello", provider: "migadu" },
      { db, cloudflare: fakeCloudflare(), migadu: fakeMigadu() },
    );
    expect(result.status).toBe("pending_dns");
    expect(result.credentialsOnce?.password).toBeTruthy();
    expect(result.dnsRecords.some((r) => r.type === "MX")).toBe(true);

    const row = await findRow(address);
    expect(row?.provider).toBe("migadu");
    expect(row?.passwordEnc).toBeTruthy();
    expect(row?.passwordEnc).not.toBe(result.credentialsOnce?.password);
  });
});

describe("verifyMailboxDns", () => {
  /** Builds a resolver whose answers exactly match `requiredDnsRecords(domain)`, keyed by FQDN — never touches real DNS. */
  function dnsResolverFor(domain: string): DnsResolver {
    const records = requiredDnsRecords(domain);
    const fqdnOf = (name: string) => (name === "@" ? domain : `${name}.${domain}`);
    return {
      resolveMx: (async (host: string) =>
        records
          .filter((r) => r.type === "MX" && fqdnOf(r.name) === host)
          .map((r) => ({ exchange: r.content, priority: r.priority ?? 0 }))) as DnsResolver["resolveMx"],
      resolveTxt: (async (host: string) =>
        records
          .filter((r) => r.type === "TXT" && fqdnOf(r.name) === host)
          .map((r) => [r.content])) as DnsResolver["resolveTxt"],
      resolveCname: (async (host: string) => {
        const match = records.find((r) => r.type === "CNAME" && fqdnOf(r.name) === host);
        return match ? [match.content] : [];
      }) as DnsResolver["resolveCname"],
    };
  }

  it("marks the mailbox active once every stored record resolves live", async () => {
    const address = `verify-${randomUUID().slice(0, 8)}@example.com`;
    const [localPart] = address.split("@");
    const provisioned = await provisionMailbox(
      { businessId, domain: "example.com", localPart: localPart ?? "hello", provider: "migadu" },
      { db, cloudflare: fakeCloudflare(), migadu: fakeMigadu() },
    );

    const result = await verifyMailboxDns(provisioned.mailboxId, { db, dns: dnsResolverFor("example.com") });
    expect(result.status).toBe("active");
    expect(result.missing).toEqual([]);

    const row = await findRow(address);
    expect(row?.status).toBe("active");
    expect(row?.lastError).toBeNull();
  });

  it("stays pending_dns and lists what's missing when a record hasn't propagated yet", async () => {
    const address = `verify-${randomUUID().slice(0, 8)}@example.com`;
    const [localPart] = address.split("@");
    const provisioned = await provisionMailbox(
      { businessId, domain: "example.com", localPart: localPart ?? "hello", provider: "migadu" },
      { db, cloudflare: fakeCloudflare(), migadu: fakeMigadu() },
    );

    const dns = dnsResolverFor("example.com");
    const originalResolveTxt = dns.resolveTxt;
    // Break only the SPF record (name "@" -> fqdn "example.com"); _dmarc.example.com still resolves correctly.
    dns.resolveTxt = (async (host: string) =>
      host === "example.com" ? [["wrong record"]] : originalResolveTxt(host)) as DnsResolver["resolveTxt"];

    const result = await verifyMailboxDns(provisioned.mailboxId, { db, dns });
    expect(result.status).toBe("pending_dns");
    expect(result.missing).toEqual(["TXT @"]);

    const row = await findRow(address);
    expect(row?.status).toBe("pending_dns");
    expect(row?.lastError).toMatch(/waiting on DNS/);
  });

  it("throws when the mailbox id doesn't exist", async () => {
    await expect(
      verifyMailboxDns(randomUUID(), { db, dns: dnsResolverFor("example.com") }),
    ).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("refuses a domain that does not belong to the requesting business", async () => {
    // "a Cloudflare zone exists for it" only proves the OPERATOR controls the domain. Without a
    // per-business binding, one tenant could provision a mailbox on another tenant's domain (or on
    // the operator's own apex) and point forwardTo wherever it liked.
    await expect(
      provisionMailbox(
        {
          businessId,
          domain: "someone-elses-domain.com",
          localPart: "hello",
          provider: "migadu",
        },
        { db },
      ),
    ).rejects.toThrow(/not the domain recorded for this business/);
  });

  it("allows a subdomain of the business's own domain", async () => {
    // mail.example.com is still the business's domain; only a different registrable domain is not.
    const parsedOk = await provisionMailbox(
      {
        businessId,
        domain: "mail.example.com",
        localPart: `sub-${randomUUID().slice(0, 8)}`,
        provider: "migadu",
      },
      { db, cloudflare: fakeCloudflare(), migadu: fakeMigadu() },
    ).catch((err: Error) => err);
    expect(String(parsedOk)).not.toMatch(/not the domain recorded/);
  });
});
