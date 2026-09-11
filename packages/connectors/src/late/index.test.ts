import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_MEDIA, makeAccount, makePost } from "../testing.js";
import accountHealthFixture from "./__fixtures__/account-health.json";
import accountNeedsReconnectFixture from "./__fixtures__/account-needs-reconnect.json";
import error401Fixture from "./__fixtures__/error-401.json";
import error429Fixture from "./__fixtures__/error-429.json";
import postCreatedFixture from "./__fixtures__/post-created.json";
import {
  createLateConnector,
  isLateEnabled,
  LATE_PLATFORM_NAMES,
  LATE_ROUTABLE_PLATFORMS,
  lateConnectors,
  latePlatformName,
} from "./index.js";

const LATE = "https://getlate.dev/api/v1";
const LATE_ACCOUNT_ID = "68b1f4e20000000000000000";
const server = setupServer();

const connector = createLateConnector("x");
const account = makeAccount("x", {
  externalId: LATE_ACCOUNT_ID,
  handle: "acmerobotics",
  config: { via: "late", lateAccountId: LATE_ACCOUNT_ID, latePlatform: "twitter" },
  tokens: null,
});

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  vi.stubEnv("CONNECTOR_RETRY_TIME_SCALE", "0");
  vi.stubEnv("LATE_API_KEY", "sk_test_key");
});

describe("feature flag", () => {
  it("is only enabled when LATE_API_KEY is set", () => {
    expect(isLateEnabled()).toBe(true);
    expect(
      lateConnectors()
        .map((c) => c.id)
        .sort(),
    ).toEqual([...LATE_ROUTABLE_PLATFORMS].sort());
    vi.stubEnv("LATE_API_KEY", "");
    expect(isLateEnabled()).toBe(false);
    expect(lateConnectors()).toEqual([]);
  });

  it("keeps our platform id and maps it onto Late's name", () => {
    expect(connector.id).toBe("x");
    expect(latePlatformName("x")).toBe("twitter");
    expect(LATE_PLATFORM_NAMES.hacker_news).toBeUndefined();
    expect(() => createLateConnector("hacker_news")).toThrowError(/does not support/);
  });

  it("declares no insights and no native scheduling", () => {
    expect(connector.capabilities.insights).toBe(false);
    expect(connector.capabilities.nativeSchedule).toBe(false);
    expect(connector.capabilities.maxChars).toBe(280);
  });
});

describe("wizard", () => {
  it("explains the third-party trade-off and asks only for the account id", () => {
    const steps = connector.wizard(null, { businessName: "Acme Robotics" });
    expect(steps.map((s) => s.kind)).toEqual(["info", "configure", "connect_token", "verify"]);
    expect(steps[0]?.caveat).toMatch(/third party/i);
    const connect = steps.find((s) => s.kind === "connect_token");
    expect(connect?.inputs?.map((i) => i.name)).toEqual(["lateAccountId"]);
    expect(connect?.instructions).toContain("LATE_API_KEY");
  });
});

describe("connectWithInputs", () => {
  it("checks the account health and stores via=late", async () => {
    let authorization: string | null = null;
    server.use(
      http.get(`${LATE}/accounts/${LATE_ACCOUNT_ID}/health`, ({ request }) => {
        authorization = request.headers.get("authorization");
        return HttpResponse.json(accountHealthFixture);
      }),
    );

    const result = await connector.connectWithInputs?.({ lateAccountId: LATE_ACCOUNT_ID });
    expect(authorization).toBe("Bearer sk_test_key");
    expect(result?.account.config).toMatchObject({ via: "late", lateAccountId: LATE_ACCOUNT_ID });
    expect(result?.account.handle).toBe("acmerobotics");
  });

  it("rejects a missing account id without calling Late", async () => {
    await expect(connector.connectWithInputs?.({})).rejects.toMatchObject({ code: "not_configured" });
  });

  it("fails with not_configured when the API key is absent", async () => {
    vi.stubEnv("LATE_API_KEY", "");
    await expect(connector.connectWithInputs?.({ lateAccountId: LATE_ACCOUNT_ID })).rejects.toMatchObject({
      code: "not_configured",
    });
  });
});

describe("publish", () => {
  it("maps our post onto Late's POST /v1/posts shape", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${LATE}/posts`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(postCreatedFixture, { status: 201 });
      }),
    );

    const result = await connector.publish(account, makePost("x", { media: [{ ...IMAGE_MEDIA }] }));

    expect(body?.content).toContain("Tiny robots");
    expect(body?.platforms).toEqual([{ platform: "twitter", accountId: LATE_ACCOUNT_ID }]);
    expect(body?.publishNow).toBe(true);
    expect(body?.mediaItems).toEqual([{ type: "image", url: IMAGE_MEDIA.url }]);
    expect(result.externalId).toBe("68c2a1f40000000000000001");
    expect(result.url).toBe("https://x.com/acmerobotics/status/1866432118754529361");
  });

  it("retries after a 429 and then succeeds", async () => {
    let calls = 0;
    server.use(
      http.post(`${LATE}/posts`, () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(error429Fixture, { status: 429, headers: { "retry-after": "1" } });
        }
        return HttpResponse.json(postCreatedFixture, { status: 201 });
      }),
    );
    const result = await connector.publish(account, makePost("x"));
    expect(calls).toBe(2);
    expect(result.externalId).toBe("68c2a1f40000000000000001");
  });

  it("maps a bad API key to auth_expired", async () => {
    server.use(http.post(`${LATE}/posts`, () => HttpResponse.json(error401Fixture, { status: 401 })));
    await expect(connector.publish(account, makePost("x"))).rejects.toMatchObject({
      name: "ConnectorError",
      code: "auth_expired",
      retryable: false,
      platform: "x",
    });
  });

  it("refuses to publish without a stored Late account id", async () => {
    await expect(
      connector.publish(makeAccount("x", { config: { via: "late" } }), makePost("x")),
    ).rejects.toMatchObject({ code: "not_configured" });
  });

  it("is idempotent when the post already has an externalId", async () => {
    const result = await connector.publish(account, makePost("x", { externalId: "late_1" }));
    expect(result.externalId).toBe("late_1");
  });
});

describe("verify", () => {
  it("reports ok with a no-insights warning", async () => {
    server.use(
      http.get(`${LATE}/accounts/${LATE_ACCOUNT_ID}/health`, () => HttpResponse.json(accountHealthFixture)),
    );
    const result = await connector.verify(account);
    expect(result.ok).toBe(true);
    expect(result.handle).toBe("acmerobotics");
    expect(result.warning).toMatch(/insights/i);
  });

  it("reports not ok when Late says the connection needs reconnecting", async () => {
    server.use(
      http.get(`${LATE}/accounts/${LATE_ACCOUNT_ID}/health`, () =>
        HttpResponse.json(accountNeedsReconnectFixture),
      ),
    );
    const result = await connector.verify(account);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/reconnect/i);
  });
});

describe("fetchInsights", () => {
  it("returns [] - Late is a publishing route only", async () => {
    await expect(connector.fetchInsights(account, "2026-09-01T00:00:00.000Z", [])).resolves.toEqual([]);
  });
});
