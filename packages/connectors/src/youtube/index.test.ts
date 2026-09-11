import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { makeAccount, makePost } from "../testing.js";
import channelFixture from "./__fixtures__/channel.json";
import error401Fixture from "./__fixtures__/error-401.json";
import errorQuotaFixture from "./__fixtures__/error-quota.json";
import oauthTokenFixture from "./__fixtures__/oauth-token.json";
import videoInsertedFixture from "./__fixtures__/video-inserted.json";
import videosStatisticsFixture from "./__fixtures__/videos-statistics.json";
import { buildVideoMetadata, tagsFromHashtags, YOUTUBE_SCOPES, youtubeConnector } from "./index.js";

const DATA_API = "https://www.googleapis.com/youtube/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3/videos";
const RESUMABLE_URL = "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=session-123";
const server = setupServer();

const VIDEO = {
  kind: "video",
  url: "https://media.acme.test/clip.mp4",
  mimeType: "video/mp4",
  width: 1080,
  height: 1920,
} as const;

const account = (config: Record<string, unknown> = {}) =>
  makeAccount("youtube", {
    externalId: channelFixture.items[0]?.id,
    handle: "@acmerobotics",
    config: { channelId: channelFixture.items[0]?.id, audited: false, ...config },
    tokens: { accessToken: "google-access-token", refreshToken: "google-refresh-token" },
  });

const videoPost = (overrides = {}) => makePost("youtube", { media: [{ ...VIDEO }], ...overrides });

function mediaHandler() {
  return http.get(VIDEO.url, () =>
    HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
      headers: { "content-type": "video/mp4" },
    }),
  );
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  vi.stubEnv("CONNECTOR_RETRY_TIME_SCALE", "0");
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
});

describe("youtube wizard", () => {
  it("explains the compliance audit and the upload quota", () => {
    const steps = youtubeConnector.wizard(null, {
      businessName: "Acme Robotics",
      websiteUrl: "https://acme.test",
    });
    expect(steps.map((s) => s.kind)).toEqual(["create_account", "configure", "connect_oauth", "verify"]);
    const configure = steps.find((s) => s.kind === "configure");
    expect(configure?.instructions).toMatch(/compliance audit/i);
    expect(configure?.instructions).toContain("100 calls/day");
    expect(configure?.caveat).toMatch(/private/i);
  });

  it("asks Google for offline access so a refresh token is issued", () => {
    const url = new URL(
      youtubeConnector.authUrl?.({
        businessId: "biz_1",
        redirectUri: "https://app.test/cb",
        state: "st",
      }) as string,
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toBe(YOUTUBE_SCOPES.join(" "));
  });
});

describe("buildVideoMetadata", () => {
  it("truncates the title to 100 chars and appends #Shorts for vertical video", () => {
    const meta = buildVideoMetadata(account(), videoPost({ title: "x".repeat(200) }));
    expect((meta.snippet.title as string).length).toBeLessThanOrEqual(100);
    expect(meta.snippet.title).toMatch(/#Shorts$/);
  });

  it("does not append #Shorts for landscape video", () => {
    const meta = buildVideoMetadata(
      account(),
      makePost("youtube", { title: "Launch film", media: [{ ...VIDEO, width: 1920, height: 1080 }] }),
    );
    expect(meta.snippet.title).toBe("Launch film");
  });

  it("keeps the upload private until the audit is recorded", () => {
    expect(buildVideoMetadata(account(), videoPost()).status.privacyStatus).toBe("private");
    expect(buildVideoMetadata(account({ audited: true }), videoPost()).status.privacyStatus).toBe("public");
  });

  it("uses status.publishAt for a scheduled post and keeps it private until then", () => {
    const meta = buildVideoMetadata(
      account({ audited: true }),
      videoPost({ scheduledAt: "2026-10-01T09:00:00.000Z" }),
    );
    expect(meta.status.privacyStatus).toBe("private");
    expect(meta.status.publishAt).toBe("2026-10-01T09:00:00.000Z");
  });

  it("maps hashtags onto tags within the 500 char budget", () => {
    expect(tagsFromHashtags(["#robots", "launch", "  "])).toEqual(["robots", "launch"]);
    expect(tagsFromHashtags([`#${"a".repeat(600)}`])).toEqual([]);
  });
});

describe("publish", () => {
  it("runs the resumable upload and returns a private video", async () => {
    let initBody: Record<string, unknown> | undefined;
    let uploadedBytes = 0;
    server.use(
      mediaHandler(),
      http.post(UPLOAD_API, async ({ request }) => {
        expect(new URL(request.url).searchParams.get("uploadType")).toBe("resumable");
        expect(new URL(request.url).searchParams.get("part")).toBe("snippet,status");
        expect(request.headers.get("x-upload-content-type")).toBe("video/mp4");
        expect(request.headers.get("x-upload-content-length")).toBe("4");
        initBody = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 200, headers: { location: RESUMABLE_URL } });
      }),
      http.put(UPLOAD_API, async ({ request }) => {
        uploadedBytes = (await request.arrayBuffer()).byteLength;
        return HttpResponse.json(videoInsertedFixture);
      }),
    );

    const result = await youtubeConnector.publish(account(), videoPost());

    expect(uploadedBytes).toBe(4);
    expect((initBody?.status as Record<string, unknown>)?.privacyStatus).toBe("private");
    expect(result.externalId).toBe("dQw4w9WgXcQ");
    expect(result.url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result.visibility).toBe("private");
  });

  it("retries after a 429 on the resumable init and then succeeds", async () => {
    let calls = 0;
    server.use(
      mediaHandler(),
      http.post(UPLOAD_API, () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(errorQuotaFixture, { status: 429, headers: { "retry-after": "1" } });
        }
        return new HttpResponse(null, { status: 200, headers: { location: RESUMABLE_URL } });
      }),
      http.put(UPLOAD_API, () => HttpResponse.json(videoInsertedFixture)),
    );

    const result = await youtubeConnector.publish(account(), videoPost());
    expect(calls).toBe(2);
    expect(result.externalId).toBe("dQw4w9WgXcQ");
  });

  it("maps a 401 to auth_expired", async () => {
    server.use(
      mediaHandler(),
      http.post(UPLOAD_API, () => HttpResponse.json(error401Fixture, { status: 401 })),
    );
    await expect(youtubeConnector.publish(account(), videoPost())).rejects.toMatchObject({
      name: "ConnectorError",
      code: "auth_expired",
      retryable: false,
    });
  });

  it("maps a quotaExceeded 403 to rate_limited", async () => {
    server.use(
      mediaHandler(),
      http.post(UPLOAD_API, () => HttpResponse.json(errorQuotaFixture, { status: 403 })),
    );
    await expect(youtubeConnector.publish(account(), videoPost())).rejects.toMatchObject({
      code: "rate_limited",
      retryable: true,
    });
  });

  it("refuses a post without a video", async () => {
    await expect(youtubeConnector.publish(account(), makePost("youtube"))).rejects.toMatchObject({
      code: "invalid_media",
    });
  });

  it("is idempotent when the post already has an externalId", async () => {
    const result = await youtubeConnector.publish(account(), videoPost({ externalId: "abc123" }));
    expect(result.externalId).toBe("abc123");
    expect(result.url).toBe("https://www.youtube.com/watch?v=abc123");
    expect(result.visibility).toBe("private");
  });
});

describe("exchangeCode", () => {
  it("stores the channel id and marks the project unaudited", async () => {
    server.use(
      http.post("https://oauth2.googleapis.com/token", () => HttpResponse.json(oauthTokenFixture)),
      http.get(`${DATA_API}/channels`, () => HttpResponse.json(channelFixture)),
    );
    const result = await youtubeConnector.exchangeCode?.("code", {
      businessId: "biz_1",
      redirectUri: "https://app.test/cb",
      state: "st",
    });
    expect(result?.tokens.refreshToken).toBe("google-refresh-token");
    expect(result?.account.externalId).toBe("UCq3lRcRkFkBtQ5bnLzPa0Rw");
    expect(result?.account.config).toMatchObject({ audited: false });
  });
});

describe("fetchInsights", () => {
  it("maps channel and video statistics", async () => {
    server.use(
      http.get(`${DATA_API}/channels`, () => HttpResponse.json(channelFixture)),
      http.get(`${DATA_API}/videos`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("part")).toBe("statistics");
        return HttpResponse.json(videosStatisticsFixture);
      }),
    );

    const snapshots = await youtubeConnector.fetchInsights(account(), "2026-09-01T00:00:00.000Z", [
      { id: "post_1", externalId: "dQw4w9WgXcQ" },
    ]);

    expect(snapshots).toContainEqual(expect.objectContaining({ metric: "followers", value: 5210 }));
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "views", value: 20481, externalPostId: "dQw4w9WgXcQ" }),
    );
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "likes", value: 1342, externalPostId: "dQw4w9WgXcQ" }),
    );
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "comments", value: 96, externalPostId: "dQw4w9WgXcQ" }),
    );
  });
});

describe("verify", () => {
  it("reports ok and warns while the project is unaudited", async () => {
    server.use(http.get(`${DATA_API}/channels`, () => HttpResponse.json(channelFixture)));
    const result = await youtubeConnector.verify(account());
    expect(result).toMatchObject({ ok: true, handle: "@acmerobotics", displayName: "Acme Robotics" });
    expect(result.warning).toMatch(/audit/i);
  });

  it("reports not ok instead of throwing", async () => {
    server.use(http.get(`${DATA_API}/channels`, () => HttpResponse.json(error401Fixture, { status: 401 })));
    const result = await youtubeConnector.verify(account());
    expect(result.ok).toBe(false);
    expect(result.error).toContain("youtube");
  });
});
