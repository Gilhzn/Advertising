import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { makeAccount, makePost } from "../testing.js";
import error401Fixture from "./__fixtures__/error-401.json";
import infoFixture from "./__fixtures__/info.json";
import meFixture from "./__fixtures__/me.json";
import meNewAccountFixture from "./__fixtures__/me-new-account.json";
import oauthTokenFixture from "./__fixtures__/oauth-token.json";
import submitLinkFixture from "./__fixtures__/submit-link.json";
import submitNotAllowedFixture from "./__fixtures__/submit-notallowed.json";
import submitRatelimitFixture from "./__fixtures__/submit-ratelimit.json";
import submitSelfFixture from "./__fixtures__/submit-self.json";
import { MIN_ACCOUNT_AGE_DAYS, REDDIT_SCOPES, redditConnector, userAgent } from "./index.js";

const WWW = "https://www.reddit.com";
const OAUTH = "https://oauth.reddit.com";
const server = setupServer();

const account = makeAccount("reddit", {
  externalId: meFixture.id,
  handle: meFixture.name,
  config: { username: meFixture.name },
  tokens: { accessToken: "reddit-access-token", refreshToken: "reddit-refresh-token" },
});

const post = () =>
  makePost("reddit", { title: "We cut onboarding from 9 screens to 2", communityRef: "SideProject" });

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  vi.stubEnv("CONNECTOR_RETRY_TIME_SCALE", "0");
  vi.stubEnv("REDDIT_CLIENT_ID", "test-client-id");
  vi.stubEnv("REDDIT_CLIENT_SECRET", "test-client-secret");
});

describe("reddit wizard", () => {
  it("returns account, app, oauth and verify steps and warns about community rules", () => {
    const steps = redditConnector.wizard(null, {
      businessName: "Acme Robotics",
      websiteUrl: "https://acme.test",
    });
    expect(steps.map((s) => s.kind)).toEqual(["create_account", "configure", "connect_oauth", "verify"]);
    expect(steps[0]?.caveat).toMatch(/disclose/i);
    expect(steps.find((s) => s.kind === "connect_oauth")?.instructions).toContain("duration=permanent");
    expect(JSON.stringify(steps)).toContain(String(MIN_ACCOUNT_AGE_DAYS));
  });

  it("builds an authorize url with duration=permanent and the four scopes", () => {
    const url = new URL(
      redditConnector.authUrl?.({
        businessId: "biz_1",
        redirectUri: "https://app.test/cb",
        state: "st",
      }) as string,
    );
    expect(url.origin + url.pathname).toBe(`${WWW}/api/v1/authorize`);
    expect(url.searchParams.get("duration")).toBe("permanent");
    expect(url.searchParams.get("scope")).toBe(REDDIT_SCOPES.join(" "));
  });
});

describe("exchangeCode", () => {
  it("uses basic auth and the required user agent", async () => {
    let authorization: string | null = null;
    let ua: string | null = null;
    server.use(
      http.post(`${WWW}/api/v1/access_token`, ({ request }) => {
        authorization = request.headers.get("authorization");
        ua = request.headers.get("user-agent");
        return HttpResponse.json(oauthTokenFixture);
      }),
      http.get(`${OAUTH}/api/v1/me`, () => HttpResponse.json(meFixture)),
    );

    const result = await redditConnector.exchangeCode?.("code", {
      businessId: "biz_1",
      redirectUri: "https://app.test/cb",
      state: "st",
    });

    expect(authorization).toMatch(/^Basic /);
    expect(ua).toMatch(/^adv-engine\/0\.1 by /);
    expect(result?.tokens.refreshToken).toBe("reddit-refresh-token");
    expect(result?.account.handle).toBe("acmerobotics");
  });
});

describe("publish", () => {
  it("submits a link post with the subreddit, flair and user agent", async () => {
    let body = "";
    let ua: string | null = null;
    server.use(
      http.post(`${OAUTH}/api/submit`, async ({ request }) => {
        body = await request.text();
        ua = request.headers.get("user-agent");
        return HttpResponse.json(submitLinkFixture);
      }),
    );

    const flaired = makeAccount("reddit", {
      ...account,
      config: { username: meFixture.name, flairId: "flair-uuid", flairText: "Show & Tell" },
    });
    const result = await redditConnector.publish(flaired, post());

    expect(ua).toBe(userAgent(meFixture.name));
    const form = new URLSearchParams(body);
    expect(form.get("sr")).toBe("SideProject");
    expect(form.get("kind")).toBe("link");
    expect(form.get("url")).toBe("https://acme.test/launch");
    expect(form.get("title")).toBe("We cut onboarding from 9 screens to 2");
    expect(form.get("flair_id")).toBe("flair-uuid");
    expect(form.get("flair_text")).toBe("Show & Tell");
    expect(form.get("api_type")).toBe("json");
    expect(result.externalId).toBe("t3_1nd7zzz");
    expect(result.url).toContain("/comments/1nd7zzz/");
  });

  it("submits a self post when there is no link", async () => {
    let body = "";
    server.use(
      http.post(`${OAUTH}/api/submit`, async ({ request }) => {
        body = await request.text();
        return HttpResponse.json(submitSelfFixture);
      }),
    );

    const result = await redditConnector.publish(
      account,
      makePost("reddit", { title: "Postmortem", communityRef: "r/SideProject", linkUrl: null }),
    );
    const form = new URLSearchParams(body);
    expect(form.get("kind")).toBe("self");
    expect(form.get("sr")).toBe("SideProject");
    expect(form.get("text")).toContain("Tiny robots");
    expect(result.externalId).toBe("t3_1nd7k2x");
  });

  it("rejects a post with no communityRef without calling the API", async () => {
    await expect(
      redditConnector.publish(account, makePost("reddit", { title: "Hi", communityRef: null })),
    ).rejects.toMatchObject({ name: "ConnectorError", code: "rejected", platform: "reddit" });
  });

  it("retries after a body-level RATELIMIT and then succeeds", async () => {
    let calls = 0;
    server.use(
      http.post(`${OAUTH}/api/submit`, () => {
        calls += 1;
        return calls === 1 ? HttpResponse.json(submitRatelimitFixture) : HttpResponse.json(submitSelfFixture);
      }),
    );

    const result = await redditConnector.publish(account, post());
    expect(calls).toBe(2);
    expect(result.externalId).toBe("t3_1nd7k2x");
  });

  it("maps SUBREDDIT_NOTALLOWED (HTTP 200) to rejected", async () => {
    server.use(http.post(`${OAUTH}/api/submit`, () => HttpResponse.json(submitNotAllowedFixture)));
    await expect(redditConnector.publish(account, post())).rejects.toMatchObject({
      code: "rejected",
      retryable: false,
    });
  });

  it("maps a 401 to auth_expired", async () => {
    server.use(http.post(`${OAUTH}/api/submit`, () => HttpResponse.json(error401Fixture, { status: 401 })));
    await expect(redditConnector.publish(account, post())).rejects.toMatchObject({
      code: "auth_expired",
      retryable: false,
    });
  });

  it("is idempotent when the post already has an externalId", async () => {
    const result = await redditConnector.publish(
      account,
      makePost("reddit", { communityRef: "SideProject", externalId: "t3_abc" }),
    );
    expect(result.externalId).toBe("t3_abc");
    expect(result.url).toContain("/comments/abc/");
  });
});

describe("verify", () => {
  it("reports ok for an established account", async () => {
    server.use(http.get(`${OAUTH}/api/v1/me`, () => HttpResponse.json(meFixture)));
    const result = await redditConnector.verify(account);
    expect(result).toMatchObject({
      ok: true,
      handle: "acmerobotics",
      profileUrl: `${WWW}/user/acmerobotics/`,
    });
    expect(result.warning).toBeUndefined();
  });

  it("warns when the account is younger than 30 days or low on karma", async () => {
    server.use(http.get(`${OAUTH}/api/v1/me`, () => HttpResponse.json(meNewAccountFixture)));
    vi.setSystemTime(new Date(meNewAccountFixture.created_utc * 1000 + 5 * 24 * 60 * 60 * 1000));
    const result = await redditConnector.verify(account);
    vi.useRealTimers();
    expect(result.ok).toBe(true);
    expect(result.warning).toContain("5 days old");
    expect(result.warning).toContain("karma");
  });

  it("reports not ok instead of throwing", async () => {
    server.use(http.get(`${OAUTH}/api/v1/me`, () => HttpResponse.json(error401Fixture, { status: 401 })));
    const result = await redditConnector.verify(account);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Reddit");
  });
});

describe("fetchInsights", () => {
  it("maps score, upvote_ratio and comments from /api/info", async () => {
    let requestedIds: string | null = null;
    server.use(
      http.get(`${OAUTH}/api/info`, ({ request }) => {
        requestedIds = new URL(request.url).searchParams.get("id");
        return HttpResponse.json(infoFixture);
      }),
    );

    const snapshots = await redditConnector.fetchInsights(account, "2026-09-01T00:00:00.000Z", [
      { id: "post_1", externalId: "t3_1nd7k2x" },
    ]);

    expect(requestedIds).toBe("t3_1nd7k2x");
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "score", value: 284, externalPostId: "t3_1nd7k2x" }),
    );
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "upvote_ratio", value: 0.94, externalPostId: "t3_1nd7k2x" }),
    );
    expect(snapshots).toContainEqual(
      expect.objectContaining({ metric: "comments", value: 47, externalPostId: "t3_1nd7k2x" }),
    );
  });

  it("returns [] when there are no known posts", async () => {
    await expect(redditConnector.fetchInsights(account, "2026-09-01T00:00:00.000Z", [])).resolves.toEqual([]);
  });
});
