import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { requestJson } from "./http.js";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("error bodies are redacted before they reach mailboxes.last_error", () => {
  // `provisionMailbox` writes EmailProviderError.message into `mailboxes.last_error`, which the
  // dashboard renders. 300 raw characters of a provider's error body were being embedded there, and
  // both Migadu and Cloudflare echo request context back in theirs.
  it("redacts a credential echoed back in a provider error body", async () => {
    server.use(
      http.get("https://api.migadu.test/v1/boom", () =>
        HttpResponse.json(
          {
            error: "invalid request",
            echoed: { api_key: "mgd_live_9f2b7c1a4e", password: "s3cret-pw" },
          },
          { status: 400 },
        ),
      ),
    );

    const err = await requestJson("https://api.migadu.test/v1/boom", {
      provider: "migadu",
      retries: 0,
    }).catch((e: Error) => e);

    expect(String(err)).not.toContain("mgd_live_9f2b7c1a4e");
    expect(String(err)).not.toContain("s3cret-pw");
    // Still diagnostic: the status and the path survive.
    expect(String(err)).toMatch(/400/);
    expect(String(err)).toContain("api.migadu.test/v1/boom");
  });

  it("keeps an ordinary provider error message readable", async () => {
    server.use(
      http.get("https://api.migadu.test/v1/nope", () =>
        HttpResponse.json({ error: "mailbox already exists" }, { status: 409 }),
      ),
    );

    const err = await requestJson("https://api.migadu.test/v1/nope", {
      provider: "migadu",
      retries: 0,
    }).catch((e: Error) => e);

    expect(String(err)).toContain("mailbox already exists");
  });
});
