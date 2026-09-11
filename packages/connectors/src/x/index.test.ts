import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_MEDIA, makeAccount, makePost } from "../testing.js";
import error401Fixture from "./__fixtures__/error-401.json";
import error429Fixture from "./__fixtures__/error-429.json";
import mediaFinalizeFixture from "./__fixtures__/media-finalize.json";
import mediaInitFixture from "./__fixtures__/media-init.json";
import oauthTokenFixture from "./__fixtures__/oauth-token.json";
import tweetFixture from "./__fixtures__/tweet.json";
import tweetsMetricsFixture from "./__fixtures__/tweets-metrics.json";
import usersMeFixture from "./__fixtures__/users-me.json";
import { COST_PER_LINK_POST_USD, COST_PER_POST_USD, X_SCOPES, xConnector } from "./index.js";

const API = "https://api.x.com";
const server = setupServer();

const account = makeAccount("x", {
  externalId: usersMeFixture.data.id,
  handle: usersMeFixture.data.username,
  config: { userId: usersMeFixture.data.id, username: usersMeFixture.data.username },
  tokens: { accessToken: "x-access-token", refreshToken: "x-refresh-token" },
});

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  vi.stubEnv("CONNECTOR_RETRY_TIME_SCALE", "0");
  vi.stubEnv("X_CLIENT_ID", "test-client-id");
  vi.stubEnv("X_CLIENT_SECRET", "test-client-secret");
});

describe("x wizard", () => {
  it("returns create/configure/oauth/verify steps and warns about the per-post cost", () => {
    const steps = xConnector.wizard(null, { businessName: "Acme Robotics", websiteUrl: "https://acme.test" });
    expect(steps.map((s) => s.kind)).toEqual(["create_account", "configure", "connect_oauth", "verify"]);
    const configure = steps.find((s) => s.kind === "configure");
    expect(configure?.caveat).toContain("0.2");
    const connect = steps.find((s) => s.kind === "connect_oauth");
    expect(connect?.instructions).toContain("offline.access");
    for (const step of steps) {
      expect(step.title.length).toBeGreaterThan(3);
      expect(step.instructions.length).toBeGreaterThan(10);
    }
  });

  it("builds a PKCE authorize url with the S256 challenge", () => {
    const url = new URL(
      xConnector.authUrl?.({
        businessId: "biz_1",
        redirectUri: "https://app.test/cb",
        state: "st",
        codeVerifier: "verifier-value",
      }) as string,
    );
    expect(url.origin + url.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).not.toBe("verifier-value");
    expect(url.searchParams.get("scope")).toBe(X_SCOPES.join(" "));
    expect(url.searchParams.get("state")).toBe("st");
  });
});

describe("exchangeCode", () => {
  it("posts the verifier with basic auth and stores the user id", async () => {
    let authorization: string | null = null;
    let body = "";
    server.use(
      http.post(`${API}/2/oauth2/token`, async ({ request }) => {
        authorization = request.headers.get("authorization");
        body = await request.text();
        return HttpResponse.json(oauthTokenFixture);
      }),
      http.get(`${API}/2/users/me`, () => HttpResponse.json(usersMeFixture)),
    );

    const result = await xConnector.exchangeCode?.("the-code", {
      businessId: "biz_1",
      redirectUri: "https://app.test/cb",
      state: "st",
      codeVerifier: "verifier-value",
    });

    expect(authorization).toMatch(/^Basic /);
    expect(body).toContain("code_verifier=verifier-value");
    expect(result?.tokens.accessToken).toBe("x-access-token");
    expect(result?.tokens.refreshToken).toBe("x-refresh-token");
    expect(result?.account.externalId).toBe(usersMeFixture.data.id);
    expect(result?.account.handle).toBe("acmerobotics");
  });
});

describe("publish", () => {
  it("creates a post and returns the x.com url", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.post(`${API}/2/tweets`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(tweetFixture);
      }),
    );

    const result = await xConnector.publish(account, makePost("x"));

    expect(result.externalId).toBe(tweetFixture.data.id);
    expect(result.url).toBe(`https://x.com/acmerobotics/status/${tweetFixture.data.id}`);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.text).toContain("Tiny robots");
    expect(bodies[0]?.reply).toBeUndefined();
  });

  it("threads long bodies with reply.in_reply_to_tweet_id", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let n = 0;
    server.use(
      http.post(`${API}/2/tweets`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        n += 1;
        return HttpResponse.json({ data: { id: `id${n}` } });
      }),
    );

    const body = Array.from({ length: 14 }, (_, i) => `Sentence number ${i} about tiny desk robots.`).join(
      " ",
    );
    const result = await xConnector.publish(account, makePost("x", { body, hashtags: [], linkUrl: null }));

    expect(bodies.length).toBeGreaterThan(1);
    expect(bodies[0]?.reply).toBeUndefined();
    expect(bodies[1]?.reply).toEqual({ in_reply_to_tweet_id: "id1" });
    expect(result.externalId).toBe("id1");
  });

  it("uploads an image with the chunked v2 flow and attaches the media id", async () => {
    const commands: string[] = [];
    let tweetBody: Record<string, unknown> | undefined;
    server.use(
      http.get(IMAGE_MEDIA.url, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
          headers: { "content-type": "image/jpeg" },
        }),
      ),
      http.post(`${API}/2/media/upload`, async ({ request }) => {
        const url = new URL(request.url);
        const command = url.searchParams.get("command");
        if (command) {
          commands.push(command);
          if (command === "INIT") {
            expect(url.searchParams.get("media_category")).toBe("tweet_image");
            expect(url.searchParams.get("total_bytes")).toBe("4");
            return HttpResponse.json(mediaInitFixture);
          }
          return HttpResponse.json(mediaFinalizeFixture);
        }
        const form = await request.formData();
        commands.push(String(form.get("command")));
        expect(form.get("media_id")).toBe(mediaInitFixture.data.id);
        expect(form.get("segment_index")).toBe("0");
        return HttpResponse.json({ data: {} });
      }),
      http.post(`${API}/2/tweets`, async ({ request }) => {
        tweetBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(tweetFixture);
      }),
    );

    await xConnector.publish(account, makePost("x", { media: [{ ...IMAGE_MEDIA }] }));

    expect(commands).toEqual(["INIT", "APPEND", "FINALIZE"]);
    expect(tweetBody?.media).toEqual({ media_ids: [mediaInitFixture.data.id] });
  });

  it("retries after a 429 and then succeeds", async () => {
    let calls = 0;
    server.use(
      http.post(`${API}/2/tweets`, () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(error429Fixture, { status: 429, headers: { "retry-after": "1" } });
        }
        return HttpResponse.json(tweetFixture);
      }),
    );

    const result = await xConnector.publish(account, makePost("x", { linkUrl: null }));
    expect(calls).toBe(2);
    expect(result.externalId).toBe(tweetFixture.data.id);
  });

  it("is idempotent when the post already has an externalId", async () => {
    const result = await xConnector.publish(account, makePost("x", { externalId: "999" }));
    expect(result.externalId).toBe("999");
    expect(result.url).toBe("https://x.com/acmerobotics/status/999");
  });

  it("maps a 401 to auth_expired and does not retry", async () => {
    let calls = 0;
    server.use(
      http.post(`${API}/2/tweets`, () => {
        calls += 1;
        return HttpResponse.json(error401Fixture, { status: 401 });
      }),
    );
    await expect(xConnector.publish(account, makePost("x"))).rejects.toMatchObject({
      name: "ConnectorError",
      code: "auth_expired",
      retryable: false,
      platform: "x",
    });
    expect(calls).toBe(1);
  });

  it("throws not_configured when the client id is missing", async () => {
    vi.stubEnv("X_CLIENT_ID", "");
    expect(() =>
      xConnector.authUrl?.({
        businessId: "biz_1",
        redirectUri: "https://app.test/cb",
        state: "st",
        codeVerifier: "v",
      }),
    ).toThrowError(/not set/);
  });
});

describe("estimatedCostUsd", () => {
  it("charges the link price for the post carrying the link", () => {
    const cost = xConnector.estimatedCostUsd?.(makePost("x"));
    expect(cost).toBe(COST_PER_LINK_POST_USD);
  });

  it("charges the plain price when there is no link", () => {
    const cost = xConnector.estimatedCostUsd?.(makePost("x", { linkUrl: null, hashtags: [] }));
    expect(cost).toBe(COST_PER_POST_USD);
  });

  it("multiplies by the number of thread parts", () => {
    const body = Array.from({ length: 14 }, (_, i) => `Sentence number ${i} about tiny desk robots.`).join(
      " ",
    );
    const cost = xConnector.estimatedCostUsd?.(makePost("x", { body, linkUrl: null, hashtags: [] })) ?? 0;
    expect(cost).toBeGreaterThan(COST_PER_POST_USD);
    expect(xConnector.capabilities.costPerPostUsd).toBe(COST_PER_POST_USD);
  });
});

describe("fetchInsights", () => {
  it("maps public and non-public metrics plus the follower count", async () => {
    server.use(
      http.get(`${API}/2/users/me`, () => HttpResponse.json(usersMeFixture)),
      http.get(`${API}/2/tweets`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("tweet.fields")).toContain("non_public_metrics");
        return HttpResponse.json(tweetsMetricsFixture);
      }),
    );

    const id = tweetsMetricsFixture.data[0]?.id as string;
    const snapshots = await xConnector.fetchInsights(account, "2026-09-01T00:00:00.000Z", [
      { id: "post_1", externalId: id },
    ]);

    expect(snapshots).toContainEqual(expect.objectContaining({ metric: "followers", value: 4821 }));
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "impressions", value: 15411, externalPostId: id }),
    );
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "likes", value: 212, externalPostId: id }),
    );
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "reposts", value: 44, externalPostId: id }),
    );
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "replies", value: 18, externalPostId: id }),
    );
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "clicks", value: 268, externalPostId: id }),
    );
  });

  it("falls back to public metrics when non_public_metrics is refused", async () => {
    let attempts = 0;
    server.use(
      http.get(`${API}/2/users/me`, () => HttpResponse.json(usersMeFixture)),
      http.get(`${API}/2/tweets`, ({ request }) => {
        attempts += 1;
        const fields = new URL(request.url).searchParams.get("tweet.fields") ?? "";
        if (fields.includes("non_public_metrics")) {
          return HttpResponse.json({ title: "Invalid Request", detail: "not allowed" }, { status: 400 });
        }
        return HttpResponse.json({
          data: [{ id: "1", public_metrics: { like_count: 3, impression_count: 10 } }],
        });
      }),
    );

    const snapshots = await xConnector.fetchInsights(account, "2026-09-01T00:00:00.000Z", [
      { id: "post_1", externalId: "1" },
    ]);
    expect(attempts).toBe(2);
    expect(snapshots).toContainEqual(expect.objectContaining({ metric: "likes", value: 3 }));
    expect(snapshots).toContainEqual(expect.objectContaining({ metric: "impressions", value: 10 }));
  });
});

describe("verify", () => {
  it("reports ok with handle and profile url", async () => {
    server.use(http.get(`${API}/2/users/me`, () => HttpResponse.json(usersMeFixture)));
    await expect(xConnector.verify(account)).resolves.toMatchObject({
      ok: true,
      handle: "acmerobotics",
      profileUrl: "https://x.com/acmerobotics",
    });
  });

  it("reports not ok instead of throwing", async () => {
    server.use(http.get(`${API}/2/users/me`, () => HttpResponse.json(error401Fixture, { status: 401 })));
    const result = await xConnector.verify(account);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("X");
  });
});
