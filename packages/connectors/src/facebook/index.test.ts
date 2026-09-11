import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_MEDIA, makeAccount, makePost } from "../testing.js";
import errorDeprecatedMetric from "./__fixtures__/error-deprecated-metric.json";
import errorRateLimit from "./__fixtures__/error-rate-limit.json";
import errorTokenExpired from "./__fixtures__/error-token-expired.json";
import feedPostFixture from "./__fixtures__/feed-post.json";
import meAccountsFixture from "./__fixtures__/me-accounts.json";
import oauthLongToken from "./__fixtures__/oauth-long-token.json";
import oauthShortToken from "./__fixtures__/oauth-short-token.json";
import pageFixture from "./__fixtures__/page.json";
import pageInsightsFixture from "./__fixtures__/page-insights.json";
import photoPostFixture from "./__fixtures__/photo-post.json";
import photoUnpublishedFixture from "./__fixtures__/photo-unpublished.json";
import postEngagementFixture from "./__fixtures__/post-engagement.json";
import postInsightsFixture from "./__fixtures__/post-insights.json";
import videoPostFixture from "./__fixtures__/video-post.json";
import { facebookConnector } from "./index.js";

const V = "v22.0";
const GRAPH = `https://graph.facebook.com/${V}`;
const PAGE_ID = "104729384756102";
const POST_ID = feedPostFixture.id;
const server = setupServer();

const account = makeAccount("facebook", {
  externalId: PAGE_ID,
  handle: "acmerobotics",
  config: { pageId: PAGE_ID, pageName: "Acme Robotics" },
  tokens: { accessToken: "EAAPageAccessToken", refreshToken: "EAAlongLivedUserToken", tokenType: "page" },
});

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  vi.stubEnv("META_APP_ID", "1234567890");
  vi.stubEnv("META_APP_SECRET", "meta-app-secret");
  vi.stubEnv("META_GRAPH_VERSION", V);
  vi.stubEnv("CONNECTOR_RETRY_TIME_SCALE", "0");
});

describe("wizard", () => {
  it("returns create/configure/oauth/verify steps and warns about App Review", () => {
    const steps = facebookConnector.wizard(null, {
      businessName: "Acme Robotics",
      websiteUrl: "https://acme.test",
      contactEmail: "hi@acme.test",
    });
    expect(steps.map((s) => s.kind)).toEqual(["create_account", "configure", "connect_oauth", "verify"]);
    expect(steps[0]?.url).toBe("https://www.facebook.com/pages/create");
    expect(steps[0]?.prefill?.map((p) => p.label)).toContain("Website");
    expect(steps[2]?.caveat).toMatch(/App Review/i);
    expect(steps[2]?.instructions).toContain("pages_manage_posts");
  });
});

describe("authUrl", () => {
  it("includes every scope and the state", () => {
    vi.stubEnv("META_LOGIN_CONFIG_ID", "");
    const url = new URL(
      facebookConnector.authUrl?.({
        businessId: "biz_1",
        redirectUri: "https://app.test/cb",
        state: "st_1",
      }) ?? "",
    );
    expect(url.origin + url.pathname).toBe(`https://www.facebook.com/${V}/dialog/oauth`);
    expect(url.searchParams.get("state")).toBe("st_1");
    expect(url.searchParams.get("response_type")).toBe("code");
    const scope = url.searchParams.get("scope") ?? "";
    for (const s of [
      "pages_show_list",
      "pages_manage_posts",
      "pages_read_engagement",
      "read_insights",
      "business_management",
      "instagram_basic",
      "instagram_content_publish",
      "instagram_manage_insights",
    ]) {
      expect(scope).toContain(s);
    }
  });
});

describe("exchangeCode", () => {
  it("swaps code -> short -> long-lived token and stores the first Page", async () => {
    const grantTypes: Array<string | null> = [];
    server.use(
      http.get(`${GRAPH}/oauth/access_token`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        grantTypes.push(params.get("grant_type"));
        return HttpResponse.json(params.get("grant_type") ? oauthLongToken : oauthShortToken);
      }),
      http.get(`${GRAPH}/me/accounts`, () => HttpResponse.json(meAccountsFixture)),
    );

    const result = await facebookConnector.exchangeCode?.("the-code", {
      businessId: "biz_1",
      redirectUri: "https://app.test/cb",
      state: "st_1",
    });

    expect(grantTypes).toEqual([null, "fb_exchange_token"]);
    expect(result?.tokens.accessToken).toBe("EAAPageAccessToken");
    expect(result?.tokens.refreshToken).toBe("EAAlongLivedUserToken");
    expect(result?.tokens.expiresAt).toEqual(expect.any(String));
    expect(result?.account.externalId).toBe(PAGE_ID);
    expect(result?.account.config).toMatchObject({ pageId: PAGE_ID, pageUsername: "acmerobotics" });
  });

  it("fails with not_configured when the login administers no Page", async () => {
    server.use(
      http.get(`${GRAPH}/oauth/access_token`, () => HttpResponse.json(oauthLongToken)),
      http.get(`${GRAPH}/me/accounts`, () => HttpResponse.json({ data: [] })),
    );
    await expect(
      facebookConnector.exchangeCode?.("c", {
        businessId: "b",
        redirectUri: "https://app.test/cb",
        state: "s",
      }),
    ).rejects.toMatchObject({ code: "not_configured" });
  });

  it("maps an expired token to auth_expired", async () => {
    server.use(
      http.get(`${GRAPH}/oauth/access_token`, () => HttpResponse.json(errorTokenExpired, { status: 400 })),
    );
    await expect(
      facebookConnector.exchangeCode?.("c", {
        businessId: "b",
        redirectUri: "https://app.test/cb",
        state: "s",
      }),
    ).rejects.toMatchObject({ code: "auth_expired", platform: "facebook" });
  });
});

describe("refreshForAccount", () => {
  it("re-mints the user token and re-reads the Page token", async () => {
    server.use(
      http.get(`${GRAPH}/oauth/access_token`, () => HttpResponse.json(oauthLongToken)),
      http.get(`${GRAPH}/me/accounts`, () => HttpResponse.json(meAccountsFixture)),
    );
    const result = await facebookConnector.refreshForAccount?.(account);
    expect(result?.tokens.accessToken).toBe("EAAPageAccessToken");
    expect(result?.tokens.refreshToken).toBe("EAAlongLivedUserToken");
  });
});

describe("publish", () => {
  it("posts a link to /feed", async () => {
    let body = "";
    server.use(
      http.post(`${GRAPH}/${PAGE_ID}/feed`, async ({ request }) => {
        body = await request.text();
        return HttpResponse.json(feedPostFixture);
      }),
    );
    const result = await facebookConnector.publish(account, makePost("facebook"));
    const params = new URLSearchParams(body);
    expect(params.get("link")).toBe("https://acme.test/launch");
    expect(params.get("message")).toContain("Tiny robots");
    expect(params.get("access_token")).toBe("EAAPageAccessToken");
    expect(result.externalId).toBe(POST_ID);
    expect(result.url).toBe(`https://www.facebook.com/${POST_ID}`);
  });

  it("posts a single image to /photos with published=true and returns post_id", async () => {
    let body = "";
    server.use(
      http.post(`${GRAPH}/${PAGE_ID}/photos`, async ({ request }) => {
        body = await request.text();
        return HttpResponse.json(photoPostFixture);
      }),
    );
    const result = await facebookConnector.publish(
      account,
      makePost("facebook", { media: [{ ...IMAGE_MEDIA }] }),
    );
    const params = new URLSearchParams(body);
    expect(params.get("url")).toBe(IMAGE_MEDIA.url);
    expect(params.get("published")).toBe("true");
    expect(params.get("alt_text_custom")).toBe(IMAGE_MEDIA.altText);
    expect(result.externalId).toBe(photoPostFixture.post_id);
  });

  it("uploads unpublished photos then attaches them to one feed post", async () => {
    const photoBodies: string[] = [];
    let feedBody = "";
    server.use(
      http.post(`${GRAPH}/${PAGE_ID}/photos`, async ({ request }) => {
        photoBodies.push(await request.text());
        return HttpResponse.json(photoUnpublishedFixture);
      }),
      http.post(`${GRAPH}/${PAGE_ID}/feed`, async ({ request }) => {
        feedBody = await request.text();
        return HttpResponse.json(feedPostFixture);
      }),
    );

    await facebookConnector.publish(
      account,
      makePost("facebook", {
        media: [{ ...IMAGE_MEDIA }, { ...IMAGE_MEDIA, url: "https://media.acme.test/two.jpg" }],
      }),
    );

    expect(photoBodies).toHaveLength(2);
    expect(new URLSearchParams(photoBodies[0]).get("published")).toBe("false");
    const attached = JSON.parse(new URLSearchParams(feedBody).get("attached_media") ?? "[]");
    expect(attached).toEqual([
      { media_fbid: photoUnpublishedFixture.id },
      { media_fbid: photoUnpublishedFixture.id },
    ]);
  });

  it("posts a video to /videos", async () => {
    let body = "";
    server.use(
      http.post(`${GRAPH}/${PAGE_ID}/videos`, async ({ request }) => {
        body = await request.text();
        return HttpResponse.json(videoPostFixture);
      }),
    );
    const result = await facebookConnector.publish(
      account,
      makePost("facebook", { media: [{ kind: "video", url: "https://media.acme.test/clip.mp4" }] }),
    );
    expect(new URLSearchParams(body).get("file_url")).toBe("https://media.acme.test/clip.mp4");
    expect(result.externalId).toBe(videoPostFixture.id);
  });

  it("uses scheduled_publish_time when scheduledAt is far enough ahead", async () => {
    let body = "";
    server.use(
      http.post(`${GRAPH}/${PAGE_ID}/feed`, async ({ request }) => {
        body = await request.text();
        return HttpResponse.json(feedPostFixture);
      }),
    );
    const at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await facebookConnector.publish(account, makePost("facebook", { scheduledAt: at }));
    const params = new URLSearchParams(body);
    expect(params.get("published")).toBe("false");
    expect(Number(params.get("scheduled_publish_time"))).toBe(Math.floor(Date.parse(at) / 1000));
  });

  it("publishes immediately when scheduledAt is inside the 10 minute window", async () => {
    let body = "";
    server.use(
      http.post(`${GRAPH}/${PAGE_ID}/feed`, async ({ request }) => {
        body = await request.text();
        return HttpResponse.json(feedPostFixture);
      }),
    );
    await facebookConnector.publish(
      account,
      makePost("facebook", { scheduledAt: new Date(Date.now() + 60_000).toISOString() }),
    );
    expect(new URLSearchParams(body).get("scheduled_publish_time")).toBeNull();
  });

  it("retries after a 429 and then succeeds", async () => {
    let calls = 0;
    server.use(
      http.post(`${GRAPH}/${PAGE_ID}/feed`, () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(errorRateLimit, { status: 429, headers: { "retry-after": "1" } });
        }
        return HttpResponse.json(feedPostFixture);
      }),
    );
    const result = await facebookConnector.publish(account, makePost("facebook"));
    expect(calls).toBe(2);
    expect(result.externalId).toBe(POST_ID);
  });

  it("maps an expired page token to auth_expired without retrying", async () => {
    let calls = 0;
    server.use(
      http.post(`${GRAPH}/${PAGE_ID}/feed`, () => {
        calls += 1;
        return HttpResponse.json(errorTokenExpired, { status: 400 });
      }),
    );
    await expect(facebookConnector.publish(account, makePost("facebook"))).rejects.toMatchObject({
      code: "auth_expired",
      retryable: false,
    });
    expect(calls).toBe(1);
  });

  it("is idempotent when the post already has an externalId", async () => {
    const result = await facebookConnector.publish(account, makePost("facebook", { externalId: POST_ID }));
    expect(result.externalId).toBe(POST_ID);
  });
});

describe("fetchInsights", () => {
  it("maps page and post metrics onto METRIC_NAMES", async () => {
    server.use(
      http.get(`${GRAPH}/${PAGE_ID}/insights`, ({ request }) => {
        const metric = new URL(request.url).searchParams.get("metric") ?? "";
        // the second (new-name) batch is not mocked with data
        if (metric.includes("page_total_media_view_unique")) return HttpResponse.json({ data: [] });
        return HttpResponse.json(pageInsightsFixture);
      }),
      http.get(`${GRAPH}/${POST_ID}/insights`, () => HttpResponse.json(postInsightsFixture)),
      http.get(`${GRAPH}/${POST_ID}`, () => HttpResponse.json(postEngagementFixture)),
    );

    const snapshots = await facebookConnector.fetchInsights(account, "2026-09-01T00:00:00.000Z", [
      { id: "post_1", externalId: POST_ID },
    ]);

    expect(snapshots).toContainEqual(expect.objectContaining({ metric: "reach", value: 4210 }));
    expect(snapshots).toContainEqual(expect.objectContaining({ metric: "followers", value: 8123 }));
    expect(snapshots).toContainEqual(expect.objectContaining({ metric: "score", value: 312 }));
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "reach", value: 1840, externalPostId: POST_ID }),
    );
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "clicks", value: 97, externalPostId: POST_ID }),
    );
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "likes", value: 145, externalPostId: POST_ID }),
    );
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "comments", value: 23, externalPostId: POST_ID }),
    );
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "shares", value: 12, externalPostId: POST_ID }),
    );
  });

  it("survives a deprecated metric name and still returns the engagement counters", async () => {
    server.use(
      http.get(`${GRAPH}/${PAGE_ID}/insights`, () =>
        HttpResponse.json(errorDeprecatedMetric, { status: 400 }),
      ),
      http.get(`${GRAPH}/${POST_ID}/insights`, () =>
        HttpResponse.json(errorDeprecatedMetric, { status: 400 }),
      ),
      http.get(`${GRAPH}/${POST_ID}`, () => HttpResponse.json(postEngagementFixture)),
    );

    const snapshots = await facebookConnector.fetchInsights(account, "2026-09-01T00:00:00.000Z", [
      { id: "post_1", externalId: POST_ID },
    ]);
    expect(snapshots.map((s) => s.metric).sort()).toEqual(["comments", "likes", "shares"]);
  });
});

describe("verify", () => {
  it("returns the page link", async () => {
    server.use(http.get(`${GRAPH}/${PAGE_ID}`, () => HttpResponse.json(pageFixture)));
    await expect(facebookConnector.verify(account)).resolves.toEqual({
      ok: true,
      handle: "acmerobotics",
      displayName: "Acme Robotics",
      profileUrl: "https://www.facebook.com/acmerobotics",
    });
  });
});
