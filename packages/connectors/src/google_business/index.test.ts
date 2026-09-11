import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_MEDIA, makeAccount, makePost } from "../testing.js";
import accountsFixture from "./__fixtures__/accounts.json";
import error401Fixture from "./__fixtures__/error-401.json";
import error429Fixture from "./__fixtures__/error-429.json";
import errorZeroQuotaFixture from "./__fixtures__/error-zero-quota.json";
import localPostFixture from "./__fixtures__/local-post.json";
import locationFixture from "./__fixtures__/location.json";
import locationsFixture from "./__fixtures__/locations.json";
import oauthTokenFixture from "./__fixtures__/oauth-token.json";
import performanceFixture from "./__fixtures__/performance.json";
import { GOOGLE_BUSINESS_SCOPES, googleBusinessConnector, localPostsParent } from "./index.js";

const ACCOUNTS_API = "https://mybusinessaccountmanagement.googleapis.com/v1";
const INFO_API = "https://mybusinessbusinessinformation.googleapis.com/v1";
const V4_API = "https://mybusiness.googleapis.com/v4";
const PERFORMANCE_API = "https://businessprofileperformance.googleapis.com/v1";
const server = setupServer();

const ACCOUNT_NAME = "accounts/106123456789012345678";
const LOCATION_NAME = "locations/12345678901234567890";

const account = (config: Record<string, unknown> = {}) =>
  makeAccount("google_business", {
    externalId: LOCATION_NAME,
    handle: "Acme Robotics",
    config: {
      accountName: ACCOUNT_NAME,
      locationName: LOCATION_NAME,
      mapsUri: "https://maps.google.com/maps?cid=12345678901234567890",
      ...config,
    },
    tokens: { accessToken: "google-access-token", refreshToken: "google-refresh-token" },
  });

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  vi.stubEnv("CONNECTOR_RETRY_TIME_SCALE", "0");
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
});

describe("google_business wizard", () => {
  it("explains the zero-quota-until-approved gate", () => {
    const steps = googleBusinessConnector.wizard(null, {
      businessName: "Acme Robotics",
      websiteUrl: "https://acme.test",
    });
    expect(steps.map((s) => s.kind)).toEqual(["create_account", "configure", "connect_oauth", "verify"]);
    const configure = steps.find((s) => s.kind === "configure");
    expect(configure?.instructions).toContain("0 QPM");
    expect(configure?.instructions).toMatch(/access request/i);
    expect(configure?.caveat).toMatch(/approval|approved/i);
  });

  it("requests the single business.manage scope", () => {
    const url = new URL(
      googleBusinessConnector.authUrl?.({
        businessId: "biz_1",
        redirectUri: "https://app.test/cb",
        state: "st",
      }) as string,
    );
    expect(url.searchParams.get("scope")).toBe(GOOGLE_BUSINESS_SCOPES.join(" "));
    expect(url.searchParams.get("access_type")).toBe("offline");
  });
});

describe("localPostsParent", () => {
  it("re-joins the v1 location name onto the v4 account parent", () => {
    expect(localPostsParent(account())).toBe(`${ACCOUNT_NAME}/${LOCATION_NAME}`);
    expect(localPostsParent(account({ locationName: "12345678901234567890" }))).toBe(
      `${ACCOUNT_NAME}/${LOCATION_NAME}`,
    );
  });

  it("throws not_configured when nothing is selected", () => {
    expect(() => localPostsParent(account({ locationName: null }))).toThrowError(/no account\/location/i);
  });
});

describe("exchangeCode", () => {
  it("lists accounts and locations and stores the first of each", async () => {
    server.use(
      http.post("https://oauth2.googleapis.com/token", () => HttpResponse.json(oauthTokenFixture)),
      http.get(`${ACCOUNTS_API}/accounts`, () => HttpResponse.json(accountsFixture)),
      http.get(`${INFO_API}/${ACCOUNT_NAME}/locations`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("readMask")).toContain("title");
        return HttpResponse.json(locationsFixture);
      }),
    );

    const result = await googleBusinessConnector.exchangeCode?.("code", {
      businessId: "biz_1",
      redirectUri: "https://app.test/cb",
      state: "st",
    });

    expect(result?.account.config).toMatchObject({
      accountName: ACCOUNT_NAME,
      locationName: LOCATION_NAME,
      locationTitle: "Acme Robotics",
    });
    expect(result?.account.externalId).toBe(LOCATION_NAME);
  });

  it("fails with not_configured when the Google account manages no profile", async () => {
    server.use(
      http.post("https://oauth2.googleapis.com/token", () => HttpResponse.json(oauthTokenFixture)),
      http.get(`${ACCOUNTS_API}/accounts`, () => HttpResponse.json({ accounts: [] })),
    );
    await expect(
      googleBusinessConnector.exchangeCode?.("code", {
        businessId: "biz_1",
        redirectUri: "https://app.test/cb",
        state: "st",
      }),
    ).rejects.toMatchObject({ code: "not_configured" });
  });
});

describe("publish", () => {
  it("creates a STANDARD local post with a call to action and media", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${V4_API}/${ACCOUNT_NAME}/${LOCATION_NAME}/localPosts`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(localPostFixture);
      }),
    );

    const result = await googleBusinessConnector.publish(
      account(),
      makePost("google_business", { media: [{ ...IMAGE_MEDIA }] }),
    );

    expect(body?.topicType).toBe("STANDARD");
    expect(body?.languageCode).toBe("en");
    expect(body?.summary).toContain("Tiny robots");
    expect(body?.callToAction).toEqual({ actionType: "LEARN_MORE", url: "https://acme.test/launch" });
    expect(body?.media).toEqual([{ mediaFormat: "PHOTO", sourceUrl: IMAGE_MEDIA.url }]);
    expect(result.externalId).toBe(localPostFixture.name);
    expect(result.url).toBe(localPostFixture.searchUrl);
    expect(result.visibility).toBe("public");
  });

  it("retries after a 429 and then succeeds", async () => {
    let calls = 0;
    server.use(
      http.post(`${V4_API}/${ACCOUNT_NAME}/${LOCATION_NAME}/localPosts`, () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(error429Fixture, { status: 429, headers: { "retry-after": "1" } });
        }
        return HttpResponse.json(localPostFixture);
      }),
    );
    const result = await googleBusinessConnector.publish(account(), makePost("google_business"));
    expect(calls).toBe(2);
    expect(result.externalId).toBe(localPostFixture.name);
  });

  it("maps the zero-quota 403 to not_configured with an explanation", async () => {
    server.use(
      http.post(`${V4_API}/${ACCOUNT_NAME}/${LOCATION_NAME}/localPosts`, () =>
        HttpResponse.json(errorZeroQuotaFixture, { status: 403 }),
      ),
    );
    await expect(
      googleBusinessConnector.publish(account(), makePost("google_business")),
    ).rejects.toMatchObject({ name: "ConnectorError", code: "not_configured", retryable: false });
  });

  it("maps a 401 to auth_expired", async () => {
    server.use(
      http.post(`${V4_API}/${ACCOUNT_NAME}/${LOCATION_NAME}/localPosts`, () =>
        HttpResponse.json(error401Fixture, { status: 401 }),
      ),
    );
    await expect(
      googleBusinessConnector.publish(account(), makePost("google_business")),
    ).rejects.toMatchObject({ code: "auth_expired" });
  });

  it("is idempotent when the post already has an externalId", async () => {
    const result = await googleBusinessConnector.publish(
      account(),
      makePost("google_business", { externalId: localPostFixture.name }),
    );
    expect(result.externalId).toBe(localPostFixture.name);
  });
});

describe("fetchInsights", () => {
  it("sums the impression surfaces and the click metrics for the location", async () => {
    server.use(
      http.get(`${PERFORMANCE_API}/${LOCATION_NAME}:fetchMultiDailyMetricsTimeSeries`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        expect(params.getAll("dailyMetrics")).toContain("BUSINESS_IMPRESSIONS_MOBILE_SEARCH");
        expect(params.get("dailyRange.startDate.year")).toBe("2026");
        return HttpResponse.json(performanceFixture);
      }),
    );

    const snapshots = await googleBusinessConnector.fetchInsights(account(), "2026-09-01T00:00:00.000Z", []);

    // 120 + 140 + 300 (the fourth datapoint has no value, i.e. zero)
    expect(snapshots).toContainEqual(expect.objectContaining({ metric: "impressions", value: 560 }));
    expect(snapshots).toContainEqual(expect.objectContaining({ metric: "clicks", value: 42 }));
    expect(snapshots.every((s) => s.externalPostId === undefined)).toBe(true);
  });

  it("returns [] when no location is selected", async () => {
    await expect(
      googleBusinessConnector.fetchInsights(account({ locationName: null }), "2026-09-01T00:00:00.000Z", []),
    ).resolves.toEqual([]);
  });
});

describe("verify", () => {
  it("reports ok with the location title and maps url", async () => {
    server.use(http.get(`${INFO_API}/${LOCATION_NAME}`, () => HttpResponse.json(locationFixture)));
    const result = await googleBusinessConnector.verify(account());
    expect(result).toMatchObject({
      ok: true,
      handle: "Acme Robotics",
      profileUrl: "https://maps.google.com/maps?cid=12345678901234567890",
    });
    expect(result.warning).toBeUndefined();
  });

  it("warns when the profile has lost Voice of Merchant", async () => {
    server.use(
      http.get(`${INFO_API}/${LOCATION_NAME}`, () =>
        HttpResponse.json({ ...locationFixture, metadata: { hasVoiceOfMerchant: false } }),
      ),
    );
    const result = await googleBusinessConnector.verify(account());
    expect(result.warning).toMatch(/Voice of Merchant/);
  });

  it("reports not ok instead of throwing", async () => {
    server.use(
      http.get(`${INFO_API}/${LOCATION_NAME}`, () => HttpResponse.json(error401Fixture, { status: 401 })),
    );
    const result = await googleBusinessConnector.verify(account());
    expect(result.ok).toBe(false);
    expect(result.error).toContain("google_business");
  });
});
