import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_MEDIA, makeAccount, makePost } from "../testing.js";
import error401 from "./__fixtures__/error-401.json";
import error422 from "./__fixtures__/error-422.json";
import error429 from "./__fixtures__/error-429.json";
import initializeUploadFixture from "./__fixtures__/images-initialize-upload.json";
import tokenFixture from "./__fixtures__/token.json";
import userinfoFixture from "./__fixtures__/userinfo.json";
import { escapeCommentary, LINKEDIN_SCOPES, linkedinConnector } from "./index.js";

const API = "https://api.linkedin.com";
const AUTH = "https://www.linkedin.com";
const POST_URN = "urn:li:share:7239999999999999999";
const server = setupServer();

const account = makeAccount("linkedin", {
  externalId: userinfoFixture.sub,
  handle: "Dana Cohen",
  config: { memberUrn: `urn:li:person:${userinfoFixture.sub}`, authorType: "member" },
  tokens: { accessToken: "AQV8lIaccessToken", refreshToken: "AQW3xRrefreshToken" },
});

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  vi.stubEnv("LINKEDIN_CLIENT_ID", "li-client-id");
  vi.stubEnv("LINKEDIN_CLIENT_SECRET", "li-client-secret");
  vi.stubEnv("LINKEDIN_API_VERSION", "202505");
  vi.stubEnv("CONNECTOR_RETRY_TIME_SCALE", "0");
});

describe("escapeCommentary", () => {
  it("backslash-escapes every reserved little-text character", () => {
    expect(escapeCommentary("Ship (v2) now #launch @acme ~ok~ 50%")).toBe(
      "Ship \\(v2\\) now \\#launch \\@acme \\~ok\\~ 50%",
    );
    expect(escapeCommentary("a|b{c}d[e]f<g>h*i_j\\k")).toBe("a\\|b\\{c\\}d\\[e\\]f\\<g\\>h\\*i\\_j\\\\k");
  });
});

describe("wizard", () => {
  it("explains personal-profile-only posting and asks for the right scopes", () => {
    const steps = linkedinConnector.wizard(null, {
      businessName: "Acme Robotics",
      websiteUrl: "https://acme.test",
    });
    expect(steps.map((s) => s.kind)).toEqual(["create_account", "configure", "connect_oauth", "verify"]);
    expect(steps[0]?.instructions).toMatch(/personal profile/i);
    expect(steps[1]?.caveat).toMatch(/wave 2/i);
    expect(steps[2]?.instructions).toContain("w_member_social");
    for (const step of steps) expect(step.title).toBeTruthy();
  });
});

describe("authUrl", () => {
  it("uses space separated scopes", () => {
    const url = new URL(
      linkedinConnector.authUrl?.({ businessId: "b", redirectUri: "https://app.test/cb", state: "st" }) ?? "",
    );
    expect(url.origin + url.pathname).toBe(`${AUTH}/oauth/v2/authorization`);
    expect(url.searchParams.get("scope")).toBe(LINKEDIN_SCOPES.join(" "));
    expect(url.searchParams.get("response_type")).toBe("code");
  });
});

describe("exchangeCode", () => {
  it("stores the member URN from /v2/userinfo", async () => {
    let form = "";
    server.use(
      http.post(`${AUTH}/oauth/v2/accessToken`, async ({ request }) => {
        form = await request.text();
        return HttpResponse.json(tokenFixture);
      }),
      http.get(`${API}/v2/userinfo`, () => HttpResponse.json(userinfoFixture)),
    );

    const result = await linkedinConnector.exchangeCode?.("the-code", {
      businessId: "biz",
      redirectUri: "https://app.test/cb",
      state: "st",
    });

    expect(new URLSearchParams(form).get("grant_type")).toBe("authorization_code");
    expect(result?.tokens.accessToken).toBe("AQV8lIaccessToken");
    expect(result?.tokens.refreshToken).toBe("AQW3xRrefreshToken");
    expect(result?.tokens.expiresAt).toEqual(expect.any(String));
    expect(result?.account.config).toMatchObject({ memberUrn: `urn:li:person:${userinfoFixture.sub}` });
    expect(result?.account.handle).toBe("Dana Cohen");
  });

  it("maps an invalid token to auth_expired", async () => {
    server.use(
      http.post(`${AUTH}/oauth/v2/accessToken`, () => HttpResponse.json(tokenFixture)),
      http.get(`${API}/v2/userinfo`, () => HttpResponse.json(error401, { status: 401 })),
    );
    await expect(
      linkedinConnector.exchangeCode?.("c", {
        businessId: "b",
        redirectUri: "https://app.test/cb",
        state: "s",
      }),
    ).rejects.toMatchObject({ code: "auth_expired", platform: "linkedin" });
  });
});

describe("refresh", () => {
  it("posts the refresh_token grant", async () => {
    let form = "";
    server.use(
      http.post(`${AUTH}/oauth/v2/accessToken`, async ({ request }) => {
        form = await request.text();
        return HttpResponse.json(tokenFixture);
      }),
    );
    const tokens = await linkedinConnector.refresh?.(account.tokens ?? { accessToken: "x" });
    const params = new URLSearchParams(form);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("AQW3xRrefreshToken");
    expect(tokens?.accessToken).toBe("AQV8lIaccessToken");
  });
});

describe("publish", () => {
  it("posts text via /rest/posts with the version header and reads x-restli-id", async () => {
    let body: Record<string, unknown> | undefined;
    let headers: Headers | undefined;
    server.use(
      http.post(`${API}/rest/posts`, async ({ request }) => {
        headers = request.headers;
        body = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 201, headers: { "x-restli-id": POST_URN } });
      }),
    );

    const result = await linkedinConnector.publish(account, makePost("linkedin"));

    expect(headers?.get("linkedin-version")).toBe("202505");
    expect(headers?.get("x-restli-protocol-version")).toBe("2.0.0");
    expect(body?.author).toBe(`urn:li:person:${userinfoFixture.sub}`);
    expect(body?.lifecycleState).toBe("PUBLISHED");
    expect(body?.visibility).toBe("PUBLIC");
    expect(body?.distribution).toEqual({
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    });
    // hashtags arrive escaped
    expect(String(body?.commentary)).toContain("\\#robots");
    expect(result.externalId).toBe(POST_URN);
    expect(result.url).toBe(`https://www.linkedin.com/feed/update/${POST_URN}/`);
  });

  it("initialises an image upload, PUTs the bytes and references the image URN", async () => {
    let initBody: Record<string, unknown> | undefined;
    let putContentType: string | null = null;
    let postBody: Record<string, unknown> | undefined;
    server.use(
      http.get(IMAGE_MEDIA.url, () =>
        HttpResponse.arrayBuffer(new Uint8Array([9, 9, 9]).buffer, {
          headers: { "content-type": "image/jpeg" },
        }),
      ),
      http.post(`${API}/rest/images`, async ({ request }) => {
        expect(new URL(request.url).searchParams.get("action")).toBe("initializeUpload");
        initBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(initializeUploadFixture);
      }),
      // match on the path only - msw warns about query params in handler URLs
      http.put(
        new URL(initializeUploadFixture.value.uploadUrl).origin +
          new URL(initializeUploadFixture.value.uploadUrl).pathname,
        ({ request }) => {
          putContentType = request.headers.get("content-type");
          return new HttpResponse(null, { status: 201 });
        },
      ),
      http.post(`${API}/rest/posts`, async ({ request }) => {
        postBody = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 201, headers: { "x-restli-id": POST_URN } });
      }),
    );

    await linkedinConnector.publish(account, makePost("linkedin", { media: [{ ...IMAGE_MEDIA }] }));

    expect(initBody).toEqual({
      initializeUploadRequest: { owner: `urn:li:person:${userinfoFixture.sub}` },
    });
    expect(putContentType).toBe("image/jpeg");
    expect(postBody?.content).toEqual({
      media: { id: initializeUploadFixture.value.image, altText: IMAGE_MEDIA.altText },
    });
  });

  it("retries after a 429 and then succeeds", async () => {
    let calls = 0;
    server.use(
      http.post(`${API}/rest/posts`, () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json(error429, { status: 429, headers: { "retry-after": "1" } });
        return new HttpResponse(null, { status: 201, headers: { "x-restli-id": POST_URN } });
      }),
    );
    const result = await linkedinConnector.publish(account, makePost("linkedin"));
    expect(calls).toBe(2);
    expect(result.externalId).toBe(POST_URN);
  });

  it("maps a revoked token to auth_expired without retrying", async () => {
    let calls = 0;
    server.use(
      http.post(`${API}/rest/posts`, () => {
        calls += 1;
        return HttpResponse.json(error401, { status: 401 });
      }),
    );
    await expect(linkedinConnector.publish(account, makePost("linkedin"))).rejects.toMatchObject({
      code: "auth_expired",
      retryable: false,
    });
    expect(calls).toBe(1);
  });

  it("maps a duplicate post (422) to rejected", async () => {
    server.use(http.post(`${API}/rest/posts`, () => HttpResponse.json(error422, { status: 422 })));
    await expect(linkedinConnector.publish(account, makePost("linkedin"))).rejects.toMatchObject({
      code: "rejected",
    });
  });

  it("refuses video media", async () => {
    await expect(
      linkedinConnector.publish(
        account,
        makePost("linkedin", { media: [{ kind: "video", url: "https://media.acme.test/clip.mp4" }] }),
      ),
    ).rejects.toMatchObject({ code: "invalid_media" });
  });

  it("is idempotent when the post already has an externalId", async () => {
    const result = await linkedinConnector.publish(account, makePost("linkedin", { externalId: POST_URN }));
    expect(result).toEqual({
      externalId: POST_URN,
      url: `https://www.linkedin.com/feed/update/${POST_URN}/`,
    });
  });
});

describe("fetchInsights", () => {
  it("returns nothing for a personal profile", async () => {
    await expect(linkedinConnector.fetchInsights(account, "2026-09-01T00:00:00.000Z", [])).resolves.toEqual(
      [],
    );
    expect(linkedinConnector.capabilities.insights).toBe(false);
  });
});

describe("verify", () => {
  it("reports the member name", async () => {
    server.use(http.get(`${API}/v2/userinfo`, () => HttpResponse.json(userinfoFixture)));
    await expect(linkedinConnector.verify(account)).resolves.toMatchObject({
      ok: true,
      handle: "Dana Cohen",
    });
  });

  it("returns ok:false when the token was revoked", async () => {
    server.use(http.get(`${API}/v2/userinfo`, () => HttpResponse.json(error401, { status: 401 })));
    const result = await linkedinConnector.verify(account);
    expect(result.ok).toBe(false);
  });
});
