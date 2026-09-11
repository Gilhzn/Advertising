import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_MEDIA, makeAccount, makePost } from "../testing.js";
import containerFixture from "./__fixtures__/container.json";
import containerChild1 from "./__fixtures__/container-child-1.json";
import containerChild2 from "./__fixtures__/container-child-2.json";
import errorRateLimit from "./__fixtures__/error-rate-limit.json";
import errorTokenExpired from "./__fixtures__/error-token-expired.json";
import meFixture from "./__fixtures__/me.json";
import mediaInsightsFixture from "./__fixtures__/media-insights.json";
import mediaPermalinkFixture from "./__fixtures__/media-permalink.json";
import oauthLongToken from "./__fixtures__/oauth-long-token.json";
import oauthShortToken from "./__fixtures__/oauth-short-token.json";
import statusError from "./__fixtures__/status-error.json";
import statusFinished from "./__fixtures__/status-finished.json";
import threadsPublishFixture from "./__fixtures__/threads-publish.json";
import userInsightsFixture from "./__fixtures__/user-insights.json";
import { THREADS_SCOPES, threadsConnector } from "./index.js";

const API = "https://graph.threads.net/v1.0";
const ROOT = "https://graph.threads.net";
const USER_ID = meFixture.id;
const MEDIA_ID = threadsPublishFixture.id;
const server = setupServer();

const account = makeAccount("threads", {
  externalId: USER_ID,
  handle: "acmerobotics",
  config: { threadsUserId: USER_ID, username: "acmerobotics" },
  tokens: { accessToken: "THQVJlongLivedToken" },
});

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  vi.stubEnv("THREADS_APP_ID", "threads-app-id");
  vi.stubEnv("THREADS_APP_SECRET", "threads-app-secret");
  vi.stubEnv("CONNECTOR_RETRY_TIME_SCALE", "0");
});

function permalinkHandler() {
  return http.get(`${API}/${MEDIA_ID}`, () => HttpResponse.json(mediaPermalinkFixture));
}

describe("wizard", () => {
  it("explains the Instagram-derived profile and the separate authorization", () => {
    const steps = threadsConnector.wizard(null, { businessName: "Acme Robotics" });
    expect(steps.map((s) => s.kind)).toEqual(["create_account", "configure", "connect_oauth", "verify"]);
    expect(steps[2]?.instructions).toContain("threads_content_publish");
    expect(steps[2]?.caveat).toMatch(/Tech Provider/i);
    for (const step of steps) expect(step.instructions.length).toBeGreaterThan(10);
  });
});

describe("authUrl", () => {
  it("points at threads.net with the threads scopes", () => {
    const url = new URL(
      threadsConnector.authUrl?.({ businessId: "b", redirectUri: "https://app.test/cb", state: "st" }) ?? "",
    );
    expect(url.origin + url.pathname).toBe("https://threads.net/oauth/authorize");
    expect(url.searchParams.get("scope")).toBe(THREADS_SCOPES.join(","));
    expect(url.searchParams.get("state")).toBe("st");
  });
});

describe("exchangeCode", () => {
  it("does the short -> long-lived swap and reads /me", async () => {
    let shortBody = "";
    let longGrant: string | null = null;
    server.use(
      http.post(`${ROOT}/oauth/access_token`, async ({ request }) => {
        shortBody = await request.text();
        return HttpResponse.json(oauthShortToken);
      }),
      http.get(`${ROOT}/access_token`, ({ request }) => {
        longGrant = new URL(request.url).searchParams.get("grant_type");
        return HttpResponse.json(oauthLongToken);
      }),
      http.get(`${API}/me`, () => HttpResponse.json(meFixture)),
    );

    const result = await threadsConnector.exchangeCode?.("the-code", {
      businessId: "biz",
      redirectUri: "https://app.test/cb",
      state: "st",
    });

    expect(new URLSearchParams(shortBody).get("grant_type")).toBe("authorization_code");
    expect(longGrant).toBe("th_exchange_token");
    expect(result?.tokens.accessToken).toBe("THQVJlongLivedToken");
    expect(result?.tokens.scopes).toEqual(THREADS_SCOPES);
    expect(result?.account.externalId).toBe(USER_ID);
    expect(result?.account.config).toMatchObject({ threadsUserId: USER_ID, username: "acmerobotics" });
  });

  it("maps an invalid token to auth_expired", async () => {
    server.use(
      http.post(`${ROOT}/oauth/access_token`, () => HttpResponse.json(errorTokenExpired, { status: 400 })),
    );
    await expect(
      threadsConnector.exchangeCode?.("c", {
        businessId: "b",
        redirectUri: "https://app.test/cb",
        state: "s",
      }),
    ).rejects.toMatchObject({ code: "auth_expired", platform: "threads" });
  });
});

describe("refresh", () => {
  it("uses the th_refresh_token grant", async () => {
    let grant: string | null = null;
    server.use(
      http.get(`${ROOT}/refresh_access_token`, ({ request }) => {
        grant = new URL(request.url).searchParams.get("grant_type");
        return HttpResponse.json(oauthLongToken);
      }),
    );
    const tokens = await threadsConnector.refresh?.({ accessToken: "old" });
    expect(grant).toBe("th_refresh_token");
    expect(tokens?.accessToken).toBe("THQVJlongLivedToken");
    expect(tokens?.expiresAt).toEqual(expect.any(String));
  });
});

describe("publish", () => {
  it("creates a TEXT container then publishes it", async () => {
    let containerBody = "";
    let publishBody = "";
    server.use(
      http.post(`${API}/${USER_ID}/threads`, async ({ request }) => {
        containerBody = await request.text();
        return HttpResponse.json(containerFixture);
      }),
      http.post(`${API}/${USER_ID}/threads_publish`, async ({ request }) => {
        publishBody = await request.text();
        return HttpResponse.json(threadsPublishFixture);
      }),
      permalinkHandler(),
    );

    const result = await threadsConnector.publish(account, makePost("threads"));

    const params = new URLSearchParams(containerBody);
    expect(params.get("media_type")).toBe("TEXT");
    expect(params.get("text")).toContain("https://acme.test/launch");
    // Threads convention: at most one topic tag, inline
    expect((params.get("text")?.match(/#/g) ?? []).length).toBe(1);
    expect(new URLSearchParams(publishBody).get("creation_id")).toBe(containerFixture.id);
    expect(result.externalId).toBe(MEDIA_ID);
    expect(result.url).toBe(mediaPermalinkFixture.permalink);
  });

  it("polls the container status for an image post", async () => {
    let statusCalls = 0;
    server.use(
      http.post(`${API}/${USER_ID}/threads`, () => HttpResponse.json(containerFixture)),
      http.get(`${API}/${containerFixture.id}`, () => {
        statusCalls += 1;
        return HttpResponse.json(statusFinished);
      }),
      http.post(`${API}/${USER_ID}/threads_publish`, () => HttpResponse.json(threadsPublishFixture)),
      permalinkHandler(),
    );
    await threadsConnector.publish(account, makePost("threads", { media: [{ ...IMAGE_MEDIA }] }));
    expect(statusCalls).toBe(1);
  });

  it("builds a carousel", async () => {
    const bodies: string[] = [];
    let n = 0;
    server.use(
      http.post(`${API}/${USER_ID}/threads`, async ({ request }) => {
        bodies.push(await request.text());
        n += 1;
        if (n === 1) return HttpResponse.json(containerChild1);
        if (n === 2) return HttpResponse.json(containerChild2);
        return HttpResponse.json(containerFixture);
      }),
      http.get(`${API}/${containerChild1.id}`, () => HttpResponse.json(statusFinished)),
      http.get(`${API}/${containerChild2.id}`, () => HttpResponse.json(statusFinished)),
      http.get(`${API}/${containerFixture.id}`, () => HttpResponse.json(statusFinished)),
      http.post(`${API}/${USER_ID}/threads_publish`, () => HttpResponse.json(threadsPublishFixture)),
      permalinkHandler(),
    );
    await threadsConnector.publish(
      account,
      makePost("threads", {
        media: [{ ...IMAGE_MEDIA }, { ...IMAGE_MEDIA, url: "https://media.acme.test/two.jpg" }],
      }),
    );
    expect(new URLSearchParams(bodies[0]).get("is_carousel_item")).toBe("true");
    const wrapper = new URLSearchParams(bodies[2]);
    expect(wrapper.get("media_type")).toBe("CAROUSEL");
    expect(wrapper.get("children")).toBe(`${containerChild1.id},${containerChild2.id}`);
  });

  it("retries after a 429 and then succeeds", async () => {
    let calls = 0;
    server.use(
      http.post(`${API}/${USER_ID}/threads`, () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(errorRateLimit, { status: 429, headers: { "retry-after": "1" } });
        }
        return HttpResponse.json(containerFixture);
      }),
      http.post(`${API}/${USER_ID}/threads_publish`, () => HttpResponse.json(threadsPublishFixture)),
      permalinkHandler(),
    );
    const result = await threadsConnector.publish(account, makePost("threads"));
    expect(calls).toBe(2);
    expect(result.externalId).toBe(MEDIA_ID);
  });

  it("maps a container ERROR to invalid_media", async () => {
    server.use(
      http.post(`${API}/${USER_ID}/threads`, () => HttpResponse.json(containerFixture)),
      http.get(`${API}/${containerFixture.id}`, () => HttpResponse.json(statusError)),
    );
    await expect(
      threadsConnector.publish(account, makePost("threads", { media: [{ ...IMAGE_MEDIA }] })),
    ).rejects.toMatchObject({ code: "invalid_media" });
  });

  it("is idempotent when the post already has an externalId", async () => {
    server.use(permalinkHandler());
    const result = await threadsConnector.publish(account, makePost("threads", { externalId: MEDIA_ID }));
    expect(result.externalId).toBe(MEDIA_ID);
  });
});

describe("fetchInsights", () => {
  it("maps views/likes/replies/reposts/quotes and followers_count", async () => {
    server.use(
      http.get(`${API}/${USER_ID}/threads_insights`, () => HttpResponse.json(userInsightsFixture)),
      http.get(`${API}/${MEDIA_ID}/insights`, () => HttpResponse.json(mediaInsightsFixture)),
    );
    const snapshots = await threadsConnector.fetchInsights(account, "2026-09-01T00:00:00.000Z", [
      { id: "p1", externalId: MEDIA_ID },
    ]);

    expect(snapshots).toContainEqual(expect.objectContaining({ metric: "followers", value: 3140 }));
    expect(snapshots).toContainEqual(expect.objectContaining({ metric: "views", value: 41000 }));
    for (const [metric, value] of [
      ["views", 18420],
      ["likes", 412],
      ["replies", 37],
      ["reposts", 24],
      // quotes map onto `shares` - METRIC_NAMES has no "quotes"
      ["shares", 6],
    ] as const) {
      expect(snapshots).toContainEqual(expect.objectContaining({ metric, value, externalPostId: MEDIA_ID }));
    }
  });
});

describe("verify", () => {
  it("returns the threads.net profile url", async () => {
    server.use(http.get(`${API}/me`, () => HttpResponse.json(meFixture)));
    await expect(threadsConnector.verify(account)).resolves.toEqual({
      ok: true,
      handle: "acmerobotics",
      displayName: "Acme Robotics",
      profileUrl: "https://www.threads.net/@acmerobotics",
    });
  });
});
