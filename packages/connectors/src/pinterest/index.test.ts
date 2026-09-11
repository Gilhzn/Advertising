import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_MEDIA, makeAccount, makePost } from "../testing.js";
import accountAnalyticsFixture from "./__fixtures__/account-analytics.json";
import boardsFixture from "./__fixtures__/boards.json";
import error401Fixture from "./__fixtures__/error-401.json";
import error429Fixture from "./__fixtures__/error-429.json";
import oauthTokenFixture from "./__fixtures__/oauth-token.json";
import pinAnalyticsFixture from "./__fixtures__/pin-analytics.json";
import pinCreatedFixture from "./__fixtures__/pin-created.json";
import userAccountFixture from "./__fixtures__/user-account.json";
import { apiHost, collectSummaryMetrics, PINTEREST_SCOPES, pinterestConnector } from "./index.js";

const API = "https://api.pinterest.com";
const SANDBOX = "https://api-sandbox.pinterest.com";
const server = setupServer();

const account = (config: Record<string, unknown> = {}) =>
  makeAccount("pinterest", {
    externalId: userAccountFixture.id,
    handle: userAccountFixture.username,
    config: { username: userAccountFixture.username, boardId: "813024577647344201", ...config },
    tokens: { accessToken: "pina_access_token", refreshToken: "pinr_refresh_token" },
  });

const pinPost = (overrides = {}) => makePost("pinterest", { media: [{ ...IMAGE_MEDIA }], ...overrides });

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  vi.stubEnv("CONNECTOR_RETRY_TIME_SCALE", "0");
  vi.stubEnv("PINTEREST_APP_ID", "test-app-id");
  vi.stubEnv("PINTEREST_APP_SECRET", "test-app-secret");
  vi.stubEnv("PINTEREST_SANDBOX", "");
});

describe("pinterest wizard", () => {
  it("has a board step and warns that trial access is sandbox-only", () => {
    const steps = pinterestConnector.wizard(null, {
      businessName: "Acme Robotics",
      websiteUrl: "https://acme.test",
    });
    expect(steps.map((s) => s.kind)).toEqual(["create_account", "configure", "connect_oauth", "verify"]);
    const configure = steps.find((s) => s.kind === "configure");
    expect(configure?.instructions).toMatch(/board/i);
    expect(configure?.caveat).toMatch(/sandbox/i);
    expect(configure?.prefill?.some((p) => p.label === "Board name")).toBe(true);
  });

  it("builds an authorize url with comma-separated scopes", () => {
    const url = new URL(
      pinterestConnector.authUrl?.({
        businessId: "biz_1",
        redirectUri: "https://app.test/cb",
        state: "st",
      }) as string,
    );
    expect(url.origin + url.pathname).toBe("https://www.pinterest.com/oauth/");
    expect(url.searchParams.get("scope")).toBe(PINTEREST_SCOPES.join(","));
  });
});

describe("apiHost", () => {
  it("switches to the sandbox host when config.sandbox is set", () => {
    expect(apiHost({})).toBe(API);
    expect(apiHost({ sandbox: true })).toBe(SANDBOX);
  });
});

describe("exchangeCode", () => {
  it("uses basic auth and stores the first board as the default", async () => {
    let authorization: string | null = null;
    server.use(
      http.post(`${API}/v5/oauth/token`, ({ request }) => {
        authorization = request.headers.get("authorization");
        return HttpResponse.json(oauthTokenFixture);
      }),
      http.get(`${API}/v5/user_account`, () => HttpResponse.json(userAccountFixture)),
      http.get(`${API}/v5/boards`, () => HttpResponse.json(boardsFixture)),
    );

    const result = await pinterestConnector.exchangeCode?.("code", {
      businessId: "biz_1",
      redirectUri: "https://app.test/cb",
      state: "st",
    });

    expect(authorization).toMatch(/^Basic /);
    expect(result?.account.handle).toBe("acmerobotics");
    expect(result?.account.config).toMatchObject({ boardId: "813024577647344201", sandbox: false });
    expect(result?.account.config?.boards as unknown[]).toHaveLength(2);
  });
});

describe("publish", () => {
  it("creates a pin with image_url media_source and the configured board", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API}/v5/pins`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(pinCreatedFixture, { status: 201 });
      }),
    );

    const result = await pinterestConnector.publish(account(), pinPost());

    expect(body?.board_id).toBe("813024577647344201");
    expect(body?.media_source).toEqual({ source_type: "image_url", url: IMAGE_MEDIA.url });
    expect(body?.link).toBe("https://acme.test/launch");
    expect(body?.alt_text).toBe(IMAGE_MEDIA.altText);
    expect(String(body?.title).length).toBeLessThanOrEqual(100);
    expect(result.externalId).toBe(pinCreatedFixture.id);
    expect(result.url).toBe(`https://www.pinterest.com/pin/${pinCreatedFixture.id}/`);
    expect(result.visibility).toBe("public");
  });

  it("uses the sandbox host and reports private visibility in sandbox mode", async () => {
    let hit = false;
    server.use(
      http.post(`${SANDBOX}/v5/pins`, () => {
        hit = true;
        return HttpResponse.json(pinCreatedFixture, { status: 201 });
      }),
    );

    const result = await pinterestConnector.publish(account({ sandbox: true }), pinPost());
    expect(hit).toBe(true);
    expect(result.visibility).toBe("private");
  });

  it("retries after a 429 and then succeeds", async () => {
    let calls = 0;
    server.use(
      http.post(`${API}/v5/pins`, () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(error429Fixture, { status: 429, headers: { "retry-after": "1" } });
        }
        return HttpResponse.json(pinCreatedFixture, { status: 201 });
      }),
    );
    const result = await pinterestConnector.publish(account(), pinPost());
    expect(calls).toBe(2);
    expect(result.externalId).toBe(pinCreatedFixture.id);
  });

  it("maps a 401 to auth_expired", async () => {
    server.use(http.post(`${API}/v5/pins`, () => HttpResponse.json(error401Fixture, { status: 401 })));
    await expect(pinterestConnector.publish(account(), pinPost())).rejects.toMatchObject({
      name: "ConnectorError",
      code: "auth_expired",
      retryable: false,
    });
  });

  it("refuses to publish without a board or without an image", async () => {
    await expect(pinterestConnector.publish(account({ boardId: null }), pinPost())).rejects.toMatchObject({
      code: "not_configured",
    });
    await expect(pinterestConnector.publish(account(), makePost("pinterest"))).rejects.toMatchObject({
      code: "invalid_media",
    });
  });

  it("is idempotent when the post already has an externalId", async () => {
    const result = await pinterestConnector.publish(account(), pinPost({ externalId: "12345" }));
    expect(result.externalId).toBe("12345");
    expect(result.url).toBe("https://www.pinterest.com/pin/12345/");
  });
});

describe("collectSummaryMetrics", () => {
  it("finds summary_metrics wherever the split puts it", () => {
    expect(collectSummaryMetrics(pinAnalyticsFixture)).toMatchObject({ IMPRESSION: 18420, SAVE: 312 });
    expect(collectSummaryMetrics({ ALL: { summary_metrics: { IMPRESSION: 1 } } })).toEqual({ IMPRESSION: 1 });
    expect(collectSummaryMetrics(null)).toEqual({});
  });
});

describe("fetchInsights", () => {
  it("maps IMPRESSION, SAVE and PIN_CLICK for the account and the pin", async () => {
    server.use(
      http.get(`${API}/v5/user_account/analytics`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        expect(params.get("metric_types")).toBe("IMPRESSION,SAVE,PIN_CLICK");
        expect(params.get("start_date")).toBe("2026-09-01");
        return HttpResponse.json(accountAnalyticsFixture);
      }),
      http.get(`${API}/v5/pins/:pinId/analytics`, () => HttpResponse.json(pinAnalyticsFixture)),
    );

    const snapshots = await pinterestConnector.fetchInsights(account(), "2026-09-01T00:00:00.000Z", [
      { id: "post_1", externalId: pinCreatedFixture.id },
    ]);

    expect(snapshots).toContainEqual(expect.objectContaining({ metric: "impressions", value: 112004 }));
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "impressions", value: 18420, externalPostId: pinCreatedFixture.id }),
    );
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "saves", value: 312, externalPostId: pinCreatedFixture.id }),
    );
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "clicks", value: 940, externalPostId: pinCreatedFixture.id }),
    );
    // OUTBOUND_CLICK is present in the payload but is not one of the metrics we map.
    expect(snapshots.some((s) => s.value === 221)).toBe(false);
  });
});

describe("verify", () => {
  it("reports ok and warns in sandbox mode", async () => {
    server.use(http.get(`${SANDBOX}/v5/user_account`, () => HttpResponse.json(userAccountFixture)));
    const result = await pinterestConnector.verify(account({ sandbox: true }));
    expect(result).toMatchObject({
      ok: true,
      handle: "acmerobotics",
      profileUrl: "https://www.pinterest.com/acmerobotics/",
    });
    expect(result.warning).toMatch(/Trial access/);
  });

  it("reports not ok instead of throwing", async () => {
    server.use(http.get(`${API}/v5/user_account`, () => HttpResponse.json(error401Fixture, { status: 401 })));
    const result = await pinterestConnector.verify(account());
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Pinterest");
  });
});
