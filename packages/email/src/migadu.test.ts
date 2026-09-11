import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MigaduClient, requiredDnsRecords } from "./migadu.js";

const BASE = "https://migadu.test/v1";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function client() {
  return new MigaduClient({ adminEmail: "admin@example.com", apiKey: "secret-key", baseUrl: BASE });
}

describe("MigaduClient", () => {
  it("throws when admin email or API key is missing", () => {
    const prevEmail = process.env.MIGADU_ADMIN_EMAIL;
    const prevKey = process.env.MIGADU_API_KEY;
    delete process.env.MIGADU_ADMIN_EMAIL;
    delete process.env.MIGADU_API_KEY;
    try {
      expect(() => new MigaduClient({ baseUrl: BASE })).toThrow(/MIGADU_ADMIN_EMAIL/);
    } finally {
      if (prevEmail !== undefined) process.env.MIGADU_ADMIN_EMAIL = prevEmail;
      if (prevKey !== undefined) process.env.MIGADU_API_KEY = prevKey;
    }
  });

  it("sends HTTP basic auth built from admin email + API key", async () => {
    let seenAuth: string | null = null;
    server.use(
      http.get(`${BASE}/domains/example.com/mailboxes/hello`, ({ request }) => {
        seenAuth = request.headers.get("authorization");
        return HttpResponse.json({
          local_part: "hello",
          domain_name: "example.com",
          address: "hello@example.com",
          name: "Hello",
        });
      }),
    );
    await client().getMailbox("example.com", "hello");
    expect(seenAuth).toBe(`Basic ${Buffer.from("admin@example.com:secret-key").toString("base64")}`);
  });

  it("getMailbox returns null on 404", async () => {
    server.use(
      http.get(
        `${BASE}/domains/example.com/mailboxes/missing`,
        () => new HttpResponse("not found", { status: 404 }),
      ),
    );
    const mailbox = await client().getMailbox("example.com", "missing");
    expect(mailbox).toBeNull();
  });

  it("createMailbox POSTs local_part/name/password", async () => {
    let body: unknown;
    server.use(
      http.post(`${BASE}/domains/example.com/mailboxes`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { local_part: "hello", domain_name: "example.com", address: "hello@example.com", name: "Hello" },
          { status: 201 },
        );
      }),
    );
    const mailbox = await client().createMailbox("example.com", {
      localPart: "hello",
      name: "Hello",
      password: "s3cret-pw",
    });
    expect(mailbox.address).toBe("hello@example.com");
    expect(body).toEqual({ local_part: "hello", name: "Hello", password: "s3cret-pw" });
  });

  it("createMailbox is idempotent: falls back to the existing mailbox when create fails because it already exists", async () => {
    server.use(
      http.post(`${BASE}/domains/example.com/mailboxes`, () =>
        HttpResponse.json({ error: "mailbox already exists" }, { status: 422 }),
      ),
      http.get(`${BASE}/domains/example.com/mailboxes/hello`, () =>
        HttpResponse.json({
          local_part: "hello",
          domain_name: "example.com",
          address: "hello@example.com",
          name: "Hello",
        }),
      ),
    );
    const mailbox = await client().createMailbox("example.com", {
      localPart: "hello",
      name: "Hello",
      password: "s3cret-pw",
    });
    expect(mailbox.address).toBe("hello@example.com");
  });

  it("createMailbox rethrows when the mailbox truly doesn't exist after a failed create", async () => {
    server.use(
      http.post(`${BASE}/domains/example.com/mailboxes`, () =>
        HttpResponse.json({ error: "bad request" }, { status: 400 }),
      ),
      http.get(
        `${BASE}/domains/example.com/mailboxes/hello`,
        () => new HttpResponse("not found", { status: 404 }),
      ),
    );
    await expect(
      client().createMailbox("example.com", { localPart: "hello", name: "Hello", password: "s3cret-pw" }),
    ).rejects.toMatchObject({ provider: "migadu" });
  });

  it("deleteMailbox is idempotent on 404", async () => {
    server.use(
      http.delete(
        `${BASE}/domains/example.com/mailboxes/hello`,
        () => new HttpResponse("not found", { status: 404 }),
      ),
    );
    await expect(client().deleteMailbox("example.com", "hello")).resolves.toBeUndefined();
  });
});

describe("requiredDnsRecords", () => {
  it("returns MX/SPF/DKIM/DMARC records without a verification TXT when no code is given", () => {
    const records = requiredDnsRecords("example.com");
    expect(records.filter((r) => r.type === "MX")).toEqual([
      { type: "MX", name: "@", content: "aspmx1.migadu.com", priority: 10, ttl: 3600 },
      { type: "MX", name: "@", content: "aspmx2.migadu.com", priority: 20, ttl: 3600 },
    ]);
    expect(records.find((r) => r.name === "@" && r.type === "TXT")?.content).toBe(
      "v=spf1 include:spf.migadu.com -all",
    );
    expect(records.find((r) => r.name === "key1._domainkey")?.content).toBe(
      "key1.example.com._domainkey.migadu.com",
    );
    expect(records.find((r) => r.name === "_dmarc")).toBeTruthy();
    expect(records.some((r) => String(r.content).startsWith("hosted-email-verify="))).toBe(false);
  });

  it("includes the hosted-email-verify TXT record when a verify code is supplied", () => {
    const records = requiredDnsRecords("example.com", "abc123");
    expect(records.find((r) => r.content === "hosted-email-verify=abc123")).toBeTruthy();
  });
});
