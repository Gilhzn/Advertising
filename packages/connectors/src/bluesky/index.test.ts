import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectorError } from "../connector.js";
import { IMAGE_MEDIA, makeAccount, makePost } from "../testing.js";
import createRecordFixture from "./__fixtures__/createRecord.json";
import createSessionFixture from "./__fixtures__/createSession.json";
import errorAuthFixture from "./__fixtures__/error-auth.json";
import errorRateLimitFixture from "./__fixtures__/error-ratelimit.json";
import getAuthorFeedFixture from "./__fixtures__/getAuthorFeed.json";
import getPostThreadFixture from "./__fixtures__/getPostThread.json";
import getProfileFixture from "./__fixtures__/getProfile.json";
import refreshSessionFixture from "./__fixtures__/refreshSession.json";
import uploadBlobFixture from "./__fixtures__/uploadBlob.json";
import { blueskyConnector } from "./index.js";

const PDS = "https://bsky.social";
const server = setupServer();

const account = makeAccount("bluesky", {
  externalId: createSessionFixture.did,
  handle: createSessionFixture.handle,
  config: { did: createSessionFixture.did, pdsUrl: PDS, handle: createSessionFixture.handle },
  tokens: { accessToken: "access-jwt", refreshToken: "refresh-jwt" },
});

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  vi.stubEnv("CONNECTOR_RETRY_TIME_SCALE", "0");
});

describe("bluesky wizard", () => {
  it("returns account, configure, token and verify steps with brand prefills", () => {
    const steps = blueskyConnector.wizard(null, {
      businessName: "Acme Robotics",
      websiteUrl: "https://acme.test",
    });
    expect(steps.map((s) => s.kind)).toEqual(["create_account", "configure", "connect_token", "verify"]);
    for (const step of steps) {
      expect(step.title).toBeTruthy();
      expect(step.instructions).toBeTruthy();
    }
    const connect = steps.find((s) => s.kind === "connect_token");
    expect(connect?.inputs?.map((i) => i.name)).toContain("appPassword");
    expect(connect?.inputs?.find((i) => i.name === "appPassword")?.secret).toBe(true);
    expect(connect?.url).toBe("https://bsky.app/settings/app-passwords");
    // falls back to the business name when there is no brand kit
    const configure = steps.find((s) => s.kind === "configure");
    expect(configure?.prefill?.some((p) => p.value.includes("Acme Robotics"))).toBe(true);
  });
});

describe("connectWithInputs", () => {
  it("creates a session and stores the did + pds", async () => {
    let body: unknown;
    server.use(
      http.post(`${PDS}/xrpc/com.atproto.server.createSession`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(createSessionFixture);
      }),
    );
    const result = await blueskyConnector.connectWithInputs?.({
      handle: "@acme.bsky.social",
      appPassword: "abcd-efgh-ijkl-mnop",
    });
    expect(body).toEqual({ identifier: "acme.bsky.social", password: "abcd-efgh-ijkl-mnop" });
    expect(result?.tokens?.accessToken).toBe(createSessionFixture.accessJwt);
    expect(result?.tokens?.refreshToken).toBe(createSessionFixture.refreshJwt);
    expect(result?.account.externalId).toBe(createSessionFixture.did);
    expect(result?.account.config).toMatchObject({ pdsUrl: PDS });
  });

  it("maps a bad app password to auth_expired", async () => {
    server.use(
      http.post(`${PDS}/xrpc/com.atproto.server.createSession`, () =>
        HttpResponse.json(errorAuthFixture, { status: 401 }),
      ),
    );
    await expect(
      blueskyConnector.connectWithInputs?.({ handle: "acme.bsky.social", appPassword: "nope" }),
    ).rejects.toMatchObject({ name: "ConnectorError", code: "auth_expired", platform: "bluesky" });
  });

  it("rejects missing inputs without calling the API", async () => {
    await expect(blueskyConnector.connectWithInputs?.({ handle: "acme" })).rejects.toMatchObject({
      code: "not_configured",
    });
  });
});

describe("refresh", () => {
  it("uses the refreshJwt and returns the new pair", async () => {
    let auth: string | null = null;
    server.use(
      http.post(`${PDS}/xrpc/com.atproto.server.refreshSession`, ({ request }) => {
        auth = request.headers.get("authorization");
        return HttpResponse.json(refreshSessionFixture);
      }),
    );
    const result = await blueskyConnector.refreshForAccount?.(account);
    expect(auth).toBe("Bearer refresh-jwt");
    expect(result?.tokens.accessToken).toBe(refreshSessionFixture.accessJwt);
    expect(result?.tokens.refreshToken).toBe(refreshSessionFixture.refreshJwt);
  });
});

describe("publish", () => {
  it("posts text with facets and returns the bsky.app url", async () => {
    const records: Array<Record<string, unknown>> = [];
    server.use(
      http.post(`${PDS}/xrpc/com.atproto.repo.createRecord`, async ({ request }) => {
        const body = (await request.json()) as { record: Record<string, unknown> };
        records.push(body.record);
        return HttpResponse.json(createRecordFixture);
      }),
    );

    const result = await blueskyConnector.publish(account, makePost("bluesky"));

    expect(result.externalId).toBe(createRecordFixture.uri);
    expect(result.url).toBe("https://bsky.app/profile/acme.bsky.social/post/3kv7yqmrjkk2c");
    expect(records).toHaveLength(1);
    const record = records[0] as Record<string, unknown>;
    expect(record.$type).toBe("app.bsky.feed.post");
    expect(record.langs).toEqual(["en"]);
    expect(record.createdAt).toEqual(expect.any(String));
    // the link and both hashtags got facets
    const facets = record.facets as Array<{ features: Array<{ $type: string }> }>;
    const types = facets.flatMap((f) => f.features.map((x) => x.$type));
    expect(types).toContain("app.bsky.richtext.facet#link");
    expect(types).toContain("app.bsky.richtext.facet#tag");
  });

  it("uploads an image blob and embeds it", async () => {
    let uploadContentType: string | null = null;
    let record: Record<string, unknown> | undefined;
    server.use(
      http.get(IMAGE_MEDIA.url, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
          headers: { "content-type": "image/jpeg" },
        }),
      ),
      http.post(`${PDS}/xrpc/com.atproto.repo.uploadBlob`, ({ request }) => {
        uploadContentType = request.headers.get("content-type");
        return HttpResponse.json(uploadBlobFixture);
      }),
      http.post(`${PDS}/xrpc/com.atproto.repo.createRecord`, async ({ request }) => {
        record = ((await request.json()) as { record: Record<string, unknown> }).record;
        return HttpResponse.json(createRecordFixture);
      }),
    );

    await blueskyConnector.publish(account, makePost("bluesky", { media: [{ ...IMAGE_MEDIA }] }));

    expect(uploadContentType).toBe("image/jpeg");
    const embed = record?.embed as { $type: string; images: Array<Record<string, unknown>> };
    expect(embed.$type).toBe("app.bsky.embed.images");
    expect(embed.images[0]?.image).toEqual(uploadBlobFixture.blob);
    expect(embed.images[0]?.alt).toBe(IMAGE_MEDIA.altText);
    expect(embed.images[0]?.aspectRatio).toEqual({ width: 1200, height: 630 });
  });

  it("splits a long body into a reply thread", async () => {
    const records: Array<Record<string, unknown>> = [];
    let n = 0;
    server.use(
      http.post(`${PDS}/xrpc/com.atproto.repo.createRecord`, async ({ request }) => {
        records.push(((await request.json()) as { record: Record<string, unknown> }).record);
        n += 1;
        return HttpResponse.json({ uri: `at://did/app.bsky.feed.post/p${n}`, cid: `cid${n}` });
      }),
    );

    const body = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} about tiny robots.`).join(" ");
    const result = await blueskyConnector.publish(
      account,
      makePost("bluesky", { body, hashtags: [], linkUrl: null }),
    );

    expect(records.length).toBeGreaterThan(1);
    expect(records[0]?.reply).toBeUndefined();
    expect(records[1]?.reply).toEqual({
      root: { uri: "at://did/app.bsky.feed.post/p1", cid: "cid1" },
      parent: { uri: "at://did/app.bsky.feed.post/p1", cid: "cid1" },
    });
    expect(result.externalId).toBe("at://did/app.bsky.feed.post/p1");
  });

  it("retries after a 429 and then succeeds", async () => {
    let calls = 0;
    server.use(
      http.post(`${PDS}/xrpc/com.atproto.repo.createRecord`, () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(errorRateLimitFixture, {
            status: 429,
            headers: { "retry-after": "1", "ratelimit-remaining": "0" },
          });
        }
        return HttpResponse.json(createRecordFixture);
      }),
    );

    const result = await blueskyConnector.publish(account, makePost("bluesky", { hashtags: [] }));
    expect(calls).toBe(2);
    expect(result.externalId).toBe(createRecordFixture.uri);
  });

  it("is idempotent when the post already has an externalId", async () => {
    const result = await blueskyConnector.publish(
      account,
      makePost("bluesky", { externalId: createRecordFixture.uri }),
    );
    expect(result.externalId).toBe(createRecordFixture.uri);
    expect(result.url).toContain("3kv7yqmrjkk2c");
  });

  it("maps an expired session to auth_expired", async () => {
    server.use(
      http.post(`${PDS}/xrpc/com.atproto.repo.createRecord`, () =>
        HttpResponse.json({ error: "ExpiredToken", message: "Token has expired" }, { status: 400 }),
      ),
    );
    await expect(blueskyConnector.publish(account, makePost("bluesky"))).rejects.toMatchObject({
      code: "auth_expired",
      retryable: false,
    });
  });

  it("refuses video media", async () => {
    await expect(
      blueskyConnector.publish(
        account,
        makePost("bluesky", { media: [{ kind: "video", url: "https://media.acme.test/clip.mp4" }] }),
      ),
    ).rejects.toBeInstanceOf(ConnectorError);
  });
});

describe("fetchInsights", () => {
  it("maps thread counters and the follower count", async () => {
    server.use(
      http.get(`${PDS}/xrpc/app.bsky.actor.getProfile`, () => HttpResponse.json(getProfileFixture)),
      http.get(`${PDS}/xrpc/app.bsky.feed.getPostThread`, () => HttpResponse.json(getPostThreadFixture)),
    );

    const uri = getPostThreadFixture.thread.post.uri;
    const snapshots = await blueskyConnector.fetchInsights(account, "2026-09-01T00:00:00.000Z", [
      { id: "post_1", externalId: uri },
    ]);

    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "followers", value: 1284, capturedAt: expect.any(String) }),
    );
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "likes", value: 37, externalPostId: uri }),
    );
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "reposts", value: 11, externalPostId: uri }),
    );
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "replies", value: 4, externalPostId: uri }),
    );
  });

  it("falls back to the author feed and drops posts older than `since`", async () => {
    server.use(
      http.get(`${PDS}/xrpc/app.bsky.actor.getProfile`, () => HttpResponse.json(getProfileFixture)),
      http.get(`${PDS}/xrpc/app.bsky.feed.getAuthorFeed`, () => HttpResponse.json(getAuthorFeedFixture)),
    );
    const snapshots = await blueskyConnector.fetchInsights(account, "2026-09-01T00:00:00.000Z", []);
    const postIds = new Set(snapshots.filter((s) => s.externalPostId).map((s) => s.externalPostId));
    expect(postIds.size).toBe(1);
    expect([...postIds][0]).toContain("3kv7yqmrjkk2c");
  });
});

describe("verify", () => {
  it("reports ok with the handle and profile url", async () => {
    server.use(http.get(`${PDS}/xrpc/app.bsky.actor.getProfile`, () => HttpResponse.json(getProfileFixture)));
    await expect(blueskyConnector.verify(account)).resolves.toEqual({
      ok: true,
      handle: "acme.bsky.social",
      displayName: "Acme Robotics",
      profileUrl: "https://bsky.app/profile/acme.bsky.social",
    });
  });

  it("reports not ok instead of throwing", async () => {
    server.use(
      http.get(`${PDS}/xrpc/app.bsky.actor.getProfile`, () =>
        HttpResponse.json(errorAuthFixture, { status: 401 }),
      ),
    );
    const result = await blueskyConnector.verify(account);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Bluesky");
  });
});
