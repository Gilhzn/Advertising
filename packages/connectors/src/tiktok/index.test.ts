import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { makeAccount, makePost } from "../testing.js";
import errorRatelimitFixture from "./__fixtures__/error-ratelimit.json";
import errorTokenFixture from "./__fixtures__/error-token.json";
import errorUrlOwnershipFixture from "./__fixtures__/error-url-ownership.json";
import oauthTokenFixture from "./__fixtures__/oauth-token.json";
import publishInitFixture from "./__fixtures__/publish-init.json";
import publishStatusCompleteFixture from "./__fixtures__/publish-status-complete.json";
import userInfoFixture from "./__fixtures__/user-info.json";
import videoQueryFixture from "./__fixtures__/video-query.json";
import { resolvePrivacyLevel, TIKTOK_SCOPES, tiktokConnector } from "./index.js";

const API = "https://open.tiktokapis.com";
const server = setupServer();

const VIDEO = { kind: "video", url: "https://media.acme.test/clip.mp4", mimeType: "video/mp4" } as const;
const IMAGE = { kind: "image", url: "https://media.acme.test/hero.jpg", mimeType: "image/jpeg" } as const;

const account = (config: Record<string, unknown> = {}) =>
  makeAccount("tiktok", {
    externalId: "7101234567890123456",
    handle: "acmerobotics",
    config: { openId: "7101234567890123456", username: "acmerobotics", audited: false, ...config },
    tokens: { accessToken: "tiktok-access-token", refreshToken: "tiktok-refresh-token" },
  });

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  vi.stubEnv("CONNECTOR_RETRY_TIME_SCALE", "0");
  vi.stubEnv("TIKTOK_CLIENT_KEY", "test-client-key");
  vi.stubEnv("TIKTOK_CLIENT_SECRET", "test-client-secret");
});

describe("tiktok wizard", () => {
  it("explains the audit gate and the verified-domain requirement", () => {
    const steps = tiktokConnector.wizard(null, {
      businessName: "Acme Robotics",
      websiteUrl: "https://acme.test",
    });
    expect(steps.map((s) => s.kind)).toEqual(["create_account", "configure", "connect_oauth", "verify"]);
    const configure = steps.find((s) => s.kind === "configure");
    expect(configure?.instructions).toContain("PULL_FROM_URL");
    expect(configure?.caveat).toMatch(/SELF_ONLY|private/i);
    expect(tiktokConnector.capabilities.privateUntilReview).toBe(true);
  });

  it("builds an authorize url with client_key and comma-separated scopes", () => {
    const url = new URL(
      tiktokConnector.authUrl?.({
        businessId: "biz_1",
        redirectUri: "https://app.test/cb",
        state: "st",
        codeVerifier: "verifier-value",
      }) as string,
    );
    expect(url.origin + url.pathname).toBe(
      `${API.replace("open.tiktokapis.com", "www.tiktok.com")}/v2/auth/authorize/`,
    );
    expect(url.searchParams.get("client_key")).toBe("test-client-key");
    expect(url.searchParams.get("scope")).toBe(TIKTOK_SCOPES.join(","));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("resolvePrivacyLevel", () => {
  it("forces SELF_ONLY until the audit is recorded", () => {
    expect(resolvePrivacyLevel({})).toBe("SELF_ONLY");
    expect(resolvePrivacyLevel({ privacyLevel: "PUBLIC_TO_EVERYONE" })).toBe("SELF_ONLY");
    expect(resolvePrivacyLevel({ audited: true })).toBe("PUBLIC_TO_EVERYONE");
    expect(resolvePrivacyLevel({ audited: true, privacyLevel: "FOLLOWER_OF_CREATOR" })).toBe(
      "FOLLOWER_OF_CREATOR",
    );
  });
});

describe("exchangeCode", () => {
  it("posts client_key + code_verifier and stores the open id", async () => {
    let body = "";
    server.use(
      http.post(`${API}/v2/oauth/token/`, async ({ request }) => {
        body = await request.text();
        return HttpResponse.json(oauthTokenFixture);
      }),
      http.get(`${API}/v2/user/info/`, () => HttpResponse.json(userInfoFixture)),
    );

    const result = await tiktokConnector.exchangeCode?.("code", {
      businessId: "biz_1",
      redirectUri: "https://app.test/cb",
      state: "st",
      codeVerifier: "verifier-value",
    });

    const form = new URLSearchParams(body);
    expect(form.get("client_key")).toBe("test-client-key");
    expect(form.get("code_verifier")).toBe("verifier-value");
    expect(result?.tokens.accessToken).toBe("tiktok-access-token");
    expect(result?.account.externalId).toBe("7101234567890123456");
    expect(result?.account.config).toMatchObject({ audited: false, privacyLevel: "SELF_ONLY" });
  });
});

describe("publish", () => {
  it("direct-posts a video with PULL_FROM_URL and forces SELF_ONLY when unaudited", async () => {
    let init: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API}/v2/post/publish/video/init/`, async ({ request }) => {
        init = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(publishInitFixture);
      }),
      http.post(`${API}/v2/post/publish/status/fetch/`, () =>
        HttpResponse.json(publishStatusCompleteFixture),
      ),
    );

    const result = await tiktokConnector.publish(account(), makePost("tiktok", { media: [{ ...VIDEO }] }));

    expect((init?.source_info as Record<string, unknown>)?.source).toBe("PULL_FROM_URL");
    expect((init?.source_info as Record<string, unknown>)?.video_url).toBe(VIDEO.url);
    expect((init?.post_info as Record<string, unknown>)?.privacy_level).toBe("SELF_ONLY");
    expect(result.externalId).toBe(publishInitFixture.data.publish_id);
    expect(result.visibility).toBe("private");
    expect(result.url).toBe("https://www.tiktok.com/@acmerobotics/video/7412345678901234567");
  });

  it("uses the audited privacy level once the audit is recorded", async () => {
    let init: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API}/v2/post/publish/video/init/`, async ({ request }) => {
        init = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(publishInitFixture);
      }),
      http.post(`${API}/v2/post/publish/status/fetch/`, () =>
        HttpResponse.json(publishStatusCompleteFixture),
      ),
    );

    const result = await tiktokConnector.publish(
      account({ audited: true, privacyLevel: "PUBLIC_TO_EVERYONE" }),
      makePost("tiktok", { media: [{ ...VIDEO }] }),
    );
    expect((init?.post_info as Record<string, unknown>)?.privacy_level).toBe("PUBLIC_TO_EVERYONE");
    expect(result.visibility).toBe("public");
  });

  it("posts photos through the content init endpoint", async () => {
    let init: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API}/v2/post/publish/content/init/`, async ({ request }) => {
        init = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(publishInitFixture);
      }),
      http.post(`${API}/v2/post/publish/status/fetch/`, () =>
        HttpResponse.json(publishStatusCompleteFixture),
      ),
    );

    await tiktokConnector.publish(account(), makePost("tiktok", { media: [{ ...IMAGE }] }));
    expect(init?.media_type).toBe("PHOTO");
    expect(init?.post_mode).toBe("DIRECT_POST");
    expect((init?.source_info as Record<string, unknown>)?.photo_images).toEqual([IMAGE.url]);
  });

  it("retries after a 429 and then succeeds", async () => {
    let calls = 0;
    server.use(
      http.post(`${API}/v2/post/publish/video/init/`, () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(errorRatelimitFixture, { status: 429, headers: { "retry-after": "1" } });
        }
        return HttpResponse.json(publishInitFixture);
      }),
      http.post(`${API}/v2/post/publish/status/fetch/`, () =>
        HttpResponse.json(publishStatusCompleteFixture),
      ),
    );

    const result = await tiktokConnector.publish(account(), makePost("tiktok", { media: [{ ...VIDEO }] }));
    expect(calls).toBe(2);
    expect(result.externalId).toBe(publishInitFixture.data.publish_id);
  });

  it("maps an invalid token envelope on HTTP 200 to auth_expired", async () => {
    server.use(http.post(`${API}/v2/post/publish/video/init/`, () => HttpResponse.json(errorTokenFixture)));
    await expect(
      tiktokConnector.publish(account(), makePost("tiktok", { media: [{ ...VIDEO }] })),
    ).rejects.toMatchObject({ name: "ConnectorError", code: "auth_expired", retryable: false });
  });

  it("maps url_ownership_unverified to invalid_media", async () => {
    server.use(
      http.post(`${API}/v2/post/publish/video/init/`, () =>
        HttpResponse.json(errorUrlOwnershipFixture, { status: 400 }),
      ),
    );
    await expect(
      tiktokConnector.publish(account(), makePost("tiktok", { media: [{ ...VIDEO }] })),
    ).rejects.toMatchObject({ code: "invalid_media" });
  });

  it("refuses a caption-only post", async () => {
    await expect(tiktokConnector.publish(account(), makePost("tiktok"))).rejects.toMatchObject({
      code: "invalid_media",
    });
  });

  it("is idempotent when the post already has an externalId", async () => {
    const result = await tiktokConnector.publish(
      account(),
      makePost("tiktok", { externalId: "v_pub_url~already", media: [{ ...VIDEO }] }),
    );
    expect(result.externalId).toBe("v_pub_url~already");
    expect(result.visibility).toBe("private");
  });
});

describe("fetchInsights", () => {
  it("maps account and video counters", async () => {
    server.use(
      http.get(`${API}/v2/user/info/`, () => HttpResponse.json(userInfoFixture)),
      http.post(`${API}/v2/video/query/`, async ({ request }) => {
        const body = (await request.json()) as { filters?: { video_ids?: string[] } };
        expect(body.filters?.video_ids).toEqual(["7412345678901234567"]);
        return HttpResponse.json(videoQueryFixture);
      }),
    );

    const snapshots = await tiktokConnector.fetchInsights(account(), "2026-09-01T00:00:00.000Z", [
      { id: "post_1", externalId: "7412345678901234567" },
    ]);

    expect(snapshots).toContainEqual(expect.objectContaining({ metric: "followers", value: 12840 }));
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "views", value: 48210, externalPostId: "7412345678901234567" }),
    );
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "likes", value: 3120, externalPostId: "7412345678901234567" }),
    );
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "comments", value: 184, externalPostId: "7412345678901234567" }),
    );
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "shares", value: 297, externalPostId: "7412345678901234567" }),
    );
  });
});

describe("verify", () => {
  it("reports ok and warns while the app is unaudited", async () => {
    server.use(http.get(`${API}/v2/user/info/`, () => HttpResponse.json(userInfoFixture)));
    const result = await tiktokConnector.verify(account());
    expect(result.ok).toBe(true);
    expect(result.handle).toBe("acmerobotics");
    expect(result.warning).toMatch(/SELF_ONLY/);
  });

  it("drops the warning once audited", async () => {
    server.use(http.get(`${API}/v2/user/info/`, () => HttpResponse.json(userInfoFixture)));
    const result = await tiktokConnector.verify(account({ audited: true }));
    expect(result.warning).toBeUndefined();
  });

  it("reports not ok instead of throwing", async () => {
    server.use(http.get(`${API}/v2/user/info/`, () => HttpResponse.json(errorTokenFixture, { status: 401 })));
    const result = await tiktokConnector.verify(account());
    expect(result.ok).toBe(false);
    expect(result.error).toContain("TikTok");
  });
});
