import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ResendClient } from "./resend.js";

const BASE = "https://resend.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function client() {
  return new ResendClient({ apiKey: "re_test_key", baseUrl: BASE });
}

describe("ResendClient", () => {
  it("verifyDomainSetup creates a domain and returns its DNS records", async () => {
    let body: unknown;
    server.use(
      http.get(`${BASE}/domains`, () => HttpResponse.json({ data: [] })),
      http.post(`${BASE}/domains`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          id: "dom_1",
          name: "example.com",
          status: "not_started",
          records: [
            { record: "SPF", name: "example.com", type: "TXT", value: "v=spf1 include:amazonses.com ~all" },
          ],
        });
      }),
    );
    const domain = await client().verifyDomainSetup("example.com");
    expect(body).toEqual({ name: "example.com" });
    expect(domain.id).toBe("dom_1");
    expect(domain.records).toHaveLength(1);
  });

  it("verifyDomainSetup is idempotent: returns the existing domain instead of creating a duplicate", async () => {
    let postCalled = false;
    server.use(
      http.get(`${BASE}/domains`, () =>
        HttpResponse.json({
          data: [{ id: "dom_existing", name: "example.com", status: "verified", records: [] }],
        }),
      ),
      http.post(`${BASE}/domains`, () => {
        postCalled = true;
        return HttpResponse.json({ id: "dom_new" });
      }),
    );
    const domain = await client().verifyDomainSetup("example.com");
    expect(domain.id).toBe("dom_existing");
    expect(postCalled).toBe(false);
  });

  it("sendMail maps replyTo to reply_to and posts to /emails with a bearer token", async () => {
    let body: unknown;
    let auth: string | null = null;
    server.use(
      http.post(`${BASE}/emails`, async ({ request }) => {
        auth = request.headers.get("authorization");
        body = await request.json();
        return HttpResponse.json({ id: "email_1" });
      }),
    );
    const result = await client().sendMail({
      from: "hello@example.com",
      to: "owner@gmail.com",
      subject: "Hi",
      text: "Hello there",
      replyTo: "hello@example.com",
    });
    expect(auth).toBe("Bearer re_test_key");
    expect(result.id).toBe("email_1");
    expect(body).toEqual({
      from: "hello@example.com",
      to: "owner@gmail.com",
      subject: "Hi",
      text: "Hello there",
      reply_to: "hello@example.com",
    });
  });
});
