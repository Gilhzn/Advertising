import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_MEDIA, makeAccount, makePost } from "../testing.js";
import containerFixture from "./__fixtures__/container.json";
import containerChild1 from "./__fixtures__/container-child-1.json";
import containerChild2 from "./__fixtures__/container-child-2.json";
import errorAppLimit from "./__fixtures__/error-app-limit.json";
import errorTokenExpired from "./__fixtures__/error-token-expired.json";
import meAccountsFixture from "./__fixtures__/me-accounts.json";
import mediaInsightsFixture from "./__fixtures__/media-insights.json";
import mediaPermalinkFixture from "./__fixtures__/media-permalink.json";
import mediaPublishFixture from "./__fixtures__/media-publish.json";
import oauthLongToken from "./__fixtures__/oauth-long-token.json";
import profileFixture from "./__fixtures__/profile.json";
import statusError from "./__fixtures__/status-error.json";
import statusFinished from "./__fixtures__/status-finished.json";
import statusInProgress from "./__fixtures__/status-in-progress.json";
import userInsightsFixture from "./__fixtures__/user-insights.json";
import { instagramConnector } from "./index.js";

const V = "v22.0";
const GRAPH = `https://graph.facebook.com/${V}`;
const IG_ID = "17841400000000001";
const MEDIA_ID = mediaPublishFixture.id;
const server = setupServer();

const account = makeAccount("instagram", {
  externalId: IG_ID,
  handle: "acmerobotics",
  config: { igUserId: IG_ID, igUsername: "acmerobotics", pageId: "104729384756102" },
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

/** The permalink lookup fires after every successful publish. */
function permalinkHandler() {
  return http.get(`${GRAPH}/${MEDIA_ID}`, () => HttpResponse.json(mediaPermalinkFixture));
}

describe("wizard", () => {
  it("insists on a Business account linked to a Page", () => {
    const steps = instagramConnector.wizard(null, { businessName: "Acme Robotics" });
    expect(steps.map((s) => s.kind)).toEqual(["create_account", "configure", "connect_oauth", "verify"]);
    expect(steps[1]?.instructions).toMatch(/professional account/i);
    expect(steps[1]?.caveat).toMatch(/personal Instagram account/i);
    expect(steps[0]?.prefill?.map((p) => p.label)).toContain("Bio (150 chars)");
  });
});

describe("exchangeCode", () => {
  it("resolves instagram_business_account from the Page", async () => {
    server.use(
      http.get(`${GRAPH}/oauth/access_token`, () => HttpResponse.json(oauthLongToken)),
      http.get(`${GRAPH}/me/accounts`, () => HttpResponse.json(meAccountsFixture)),
    );
    const result = await instagramConnector.exchangeCode?.("code", {
      businessId: "biz_1",
      redirectUri: "https://app.test/cb",
      state: "st",
    });
    expect(result?.account.externalId).toBe(IG_ID);
    expect(result?.account.config).toMatchObject({ igUserId: IG_ID, pageId: "104729384756102" });
    expect(result?.tokens.accessToken).toBe("EAAPageAccessToken");
  });

  it("fails with not_configured when no Page has a linked IG account", async () => {
    server.use(
      http.get(`${GRAPH}/oauth/access_token`, () => HttpResponse.json(oauthLongToken)),
      http.get(`${GRAPH}/me/accounts`, () =>
        HttpResponse.json({ data: [{ id: "1", name: "Page", access_token: "t" }] }),
      ),
    );
    await expect(
      instagramConnector.exchangeCode?.("code", {
        businessId: "b",
        redirectUri: "https://app.test/cb",
        state: "s",
      }),
    ).rejects.toMatchObject({ code: "not_configured" });
  });
});

describe("publish", () => {
  it("runs the container -> poll -> media_publish flow for a single image", async () => {
    let containerBody = "";
    let publishBody = "";
    let statusCalls = 0;
    server.use(
      http.post(`${GRAPH}/${IG_ID}/media`, async ({ request }) => {
        containerBody = await request.text();
        return HttpResponse.json(containerFixture);
      }),
      http.get(`${GRAPH}/${containerFixture.id}`, () => {
        statusCalls += 1;
        return HttpResponse.json(statusCalls === 1 ? statusInProgress : statusFinished);
      }),
      http.post(`${GRAPH}/${IG_ID}/media_publish`, async ({ request }) => {
        publishBody = await request.text();
        return HttpResponse.json(mediaPublishFixture);
      }),
      permalinkHandler(),
    );

    const result = await instagramConnector.publish(
      account,
      makePost("instagram", { media: [{ ...IMAGE_MEDIA }] }),
    );

    const params = new URLSearchParams(containerBody);
    expect(params.get("image_url")).toBe(IMAGE_MEDIA.url);
    expect(params.get("caption")).toContain("#robots");
    expect(statusCalls).toBe(2); // polled through IN_PROGRESS
    expect(new URLSearchParams(publishBody).get("creation_id")).toBe(containerFixture.id);
    expect(result.externalId).toBe(MEDIA_ID);
    expect(result.url).toBe(mediaPermalinkFixture.permalink);
  });

  it("publishes a video as a REELS container", async () => {
    let body = "";
    server.use(
      http.post(`${GRAPH}/${IG_ID}/media`, async ({ request }) => {
        body = await request.text();
        return HttpResponse.json(containerFixture);
      }),
      http.get(`${GRAPH}/${containerFixture.id}`, () => HttpResponse.json(statusFinished)),
      http.post(`${GRAPH}/${IG_ID}/media_publish`, () => HttpResponse.json(mediaPublishFixture)),
      permalinkHandler(),
    );
    await instagramConnector.publish(
      account,
      makePost("instagram", { media: [{ kind: "video", url: "https://media.acme.test/reel.mp4" }] }),
    );
    const params = new URLSearchParams(body);
    expect(params.get("media_type")).toBe("REELS");
    expect(params.get("video_url")).toBe("https://media.acme.test/reel.mp4");
  });

  it("builds a carousel from children", async () => {
    const bodies: string[] = [];
    let n = 0;
    server.use(
      http.post(`${GRAPH}/${IG_ID}/media`, async ({ request }) => {
        bodies.push(await request.text());
        n += 1;
        if (n === 1) return HttpResponse.json(containerChild1);
        if (n === 2) return HttpResponse.json(containerChild2);
        return HttpResponse.json(containerFixture);
      }),
      http.get(`${GRAPH}/${containerChild1.id}`, () => HttpResponse.json(statusFinished)),
      http.get(`${GRAPH}/${containerChild2.id}`, () => HttpResponse.json(statusFinished)),
      http.get(`${GRAPH}/${containerFixture.id}`, () => HttpResponse.json(statusFinished)),
      http.post(`${GRAPH}/${IG_ID}/media_publish`, () => HttpResponse.json(mediaPublishFixture)),
      permalinkHandler(),
    );

    await instagramConnector.publish(
      account,
      makePost("instagram", {
        media: [{ ...IMAGE_MEDIA }, { ...IMAGE_MEDIA, url: "https://media.acme.test/two.jpg" }],
      }),
    );

    expect(bodies).toHaveLength(3);
    expect(new URLSearchParams(bodies[0]).get("is_carousel_item")).toBe("true");
    const wrapper = new URLSearchParams(bodies[2]);
    expect(wrapper.get("media_type")).toBe("CAROUSEL");
    expect(wrapper.get("children")).toBe(`${containerChild1.id},${containerChild2.id}`);
  });

  it("retries after a 429 on the container call and then succeeds", async () => {
    let calls = 0;
    server.use(
      http.post(`${GRAPH}/${IG_ID}/media`, () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(errorAppLimit, { status: 429, headers: { "retry-after": "1" } });
        }
        return HttpResponse.json(containerFixture);
      }),
      http.get(`${GRAPH}/${containerFixture.id}`, () => HttpResponse.json(statusFinished)),
      http.post(`${GRAPH}/${IG_ID}/media_publish`, () => HttpResponse.json(mediaPublishFixture)),
      permalinkHandler(),
    );
    const result = await instagramConnector.publish(
      account,
      makePost("instagram", { media: [{ ...IMAGE_MEDIA }] }),
    );
    expect(calls).toBe(2);
    expect(result.externalId).toBe(MEDIA_ID);
  });

  it("maps a container ERROR to invalid_media", async () => {
    server.use(
      http.post(`${GRAPH}/${IG_ID}/media`, () => HttpResponse.json(containerFixture)),
      http.get(`${GRAPH}/${containerFixture.id}`, () => HttpResponse.json(statusError)),
    );
    await expect(
      instagramConnector.publish(account, makePost("instagram", { media: [{ ...IMAGE_MEDIA }] })),
    ).rejects.toMatchObject({ code: "invalid_media", retryable: false });
  });

  it("maps an expired token to auth_expired", async () => {
    server.use(
      http.post(`${GRAPH}/${IG_ID}/media`, () => HttpResponse.json(errorTokenExpired, { status: 400 })),
    );
    await expect(
      instagramConnector.publish(account, makePost("instagram", { media: [{ ...IMAGE_MEDIA }] })),
    ).rejects.toMatchObject({ code: "auth_expired" });
  });

  it("refuses a text-only post", async () => {
    await expect(instagramConnector.publish(account, makePost("instagram"))).rejects.toMatchObject({
      code: "invalid_media",
    });
    expect(instagramConnector.capabilities.text).toBe(false);
  });

  it("is idempotent when the post already has an externalId", async () => {
    server.use(permalinkHandler());
    const result = await instagramConnector.publish(
      account,
      makePost("instagram", { externalId: MEDIA_ID, media: [{ ...IMAGE_MEDIA }] }),
    );
    expect(result.externalId).toBe(MEDIA_ID);
    expect(result.url).toBe(mediaPermalinkFixture.permalink);
  });

  it("enforces the documented 100 posts / 24h ceiling in rateLimit", () => {
    expect(instagramConnector.rateLimit).toEqual({ limit: 100, windowMs: 86_400_000 });
  });
});

describe("fetchInsights", () => {
  it("maps user and media metrics onto METRIC_NAMES", async () => {
    server.use(
      http.get(`${GRAPH}/${IG_ID}/insights`, () => HttpResponse.json(userInsightsFixture)),
      http.get(`${GRAPH}/${MEDIA_ID}/insights`, () => HttpResponse.json(mediaInsightsFixture)),
    );
    const snapshots = await instagramConnector.fetchInsights(account, "2026-09-01T00:00:00.000Z", [
      { id: "p1", externalId: MEDIA_ID },
    ]);

    expect(snapshots).toContainEqual(expect.objectContaining({ metric: "reach", value: 5120 }));
    expect(snapshots).toContainEqual(expect.objectContaining({ metric: "followers", value: 54 }));
    expect(snapshots).toContainEqual(expect.objectContaining({ metric: "views", value: 311 }));
    for (const [metric, value] of [
      ["reach", 3021],
      ["likes", 284],
      ["comments", 31],
      ["saves", 46],
      ["shares", 19],
      ["views", 7410],
    ] as const) {
      expect(snapshots).toContainEqual(expect.objectContaining({ metric, value, externalPostId: MEDIA_ID }));
    }
  });

  it("keeps going when the user insights call fails", async () => {
    server.use(
      http.get(`${GRAPH}/${IG_ID}/insights`, () => HttpResponse.json(errorTokenExpired, { status: 400 })),
      http.get(`${GRAPH}/${MEDIA_ID}/insights`, () => HttpResponse.json(mediaInsightsFixture)),
    );
    const snapshots = await instagramConnector.fetchInsights(account, "2026-09-01T00:00:00.000Z", [
      { id: "p1", externalId: MEDIA_ID },
    ]);
    expect(snapshots.every((s) => s.externalPostId === MEDIA_ID)).toBe(true);
    expect(snapshots.length).toBe(6);
  });
});

describe("verify", () => {
  it("returns the instagram profile url", async () => {
    server.use(http.get(`${GRAPH}/${IG_ID}`, () => HttpResponse.json(profileFixture)));
    await expect(instagramConnector.verify(account)).resolves.toEqual({
      ok: true,
      handle: "acmerobotics",
      displayName: "Acme Robotics",
      profileUrl: "https://www.instagram.com/acmerobotics/",
    });
  });
});
