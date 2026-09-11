import { createHash } from "node:crypto";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthUrl,
  codeChallengeS256,
  exchangeAuthorizationCode,
  generateCodeVerifier,
  isExpiringSoon,
  normalizeTokenResponse,
  refreshWithRefreshToken,
  requireEnv,
} from "./oauth.js";

const server = setupServer();
const TOKEN_URL = "https://auth.example.test/token";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  vi.stubEnv("CONNECTOR_RETRY_TIME_SCALE", "0");
});

describe("PKCE", () => {
  it("generates a verifier in the RFC 7636 length range and alphabet", () => {
    for (let i = 0; i < 20; i++) {
      const v = generateCodeVerifier();
      expect(v.length).toBeGreaterThanOrEqual(43);
      expect(v.length).toBeLessThanOrEqual(128);
      expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/);
    }
  });

  it("produces distinct verifiers", () => {
    const set = new Set(Array.from({ length: 50 }, () => generateCodeVerifier()));
    expect(set.size).toBe(50);
  });

  it("computes base64url(SHA256(verifier))", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(codeChallengeS256(verifier)).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(codeChallengeS256(verifier)).not.toContain("=");
  });
});

describe("buildAuthUrl", () => {
  it("appends params and skips empty ones", () => {
    const url = buildAuthUrl("https://x.test/auth?keep=1", {
      client_id: "abc",
      state: "s",
      empty: "",
      missing: undefined,
      nope: null,
      num: 3,
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("keep")).toBe("1");
    expect(parsed.searchParams.get("client_id")).toBe("abc");
    expect(parsed.searchParams.get("num")).toBe("3");
    expect(parsed.searchParams.has("empty")).toBe(false);
    expect(parsed.searchParams.has("missing")).toBe(false);
    expect(parsed.searchParams.has("nope")).toBe(false);
  });
});

describe("normalizeTokenResponse", () => {
  it("turns expires_in into an ISO expiresAt and splits scopes", () => {
    const tokens = normalizeTokenResponse(
      { access_token: "a", refresh_token: "r", token_type: "Bearer", expires_in: 3600, scope: "x y" },
      "linkedin",
    );
    expect(tokens.accessToken).toBe("a");
    expect(tokens.refreshToken).toBe("r");
    expect(tokens.scopes).toEqual(["x", "y"]);
    expect(Date.parse(tokens.expiresAt as string)).toBeGreaterThan(Date.now());
  });

  it("carries the previous refresh token when the response omits one", () => {
    const tokens = normalizeTokenResponse({ access_token: "new" }, "linkedin", {
      accessToken: "old",
      refreshToken: "keepme",
      scopes: ["x"],
    });
    expect(tokens.refreshToken).toBe("keepme");
    expect(tokens.scopes).toEqual(["x"]);
  });

  it("raises auth_expired when there is no access token", () => {
    expect(() => normalizeTokenResponse({ error: "invalid_grant" }, "linkedin")).toThrowError(/access_token/);
  });
});

describe("exchangeAuthorizationCode", () => {
  it("posts a form by default", async () => {
    let body = "";
    server.use(
      http.post(TOKEN_URL, async ({ request }) => {
        body = await request.text();
        return HttpResponse.json({ access_token: "tok", expires_in: 60 });
      }),
    );
    const tokens = await exchangeAuthorizationCode(
      TOKEN_URL,
      { grant_type: "authorization_code", code: "c" },
      { platform: "linkedin" },
    );
    expect(new URLSearchParams(body).get("code")).toBe("c");
    expect(tokens.accessToken).toBe("tok");
  });

  it("sends client credentials as Basic auth when asked", async () => {
    let auth: string | null = null;
    server.use(
      http.post(TOKEN_URL, ({ request }) => {
        auth = request.headers.get("authorization");
        return HttpResponse.json({ access_token: "tok" });
      }),
    );
    await exchangeAuthorizationCode(
      TOKEN_URL,
      { code: "c" },
      { platform: "x", basicAuth: { clientId: "id", clientSecret: "sec" } },
    );
    expect(auth).toBe(`Basic ${Buffer.from("id:sec").toString("base64")}`);
  });

  it("supports GET token endpoints (Meta style)", async () => {
    server.use(
      http.get(TOKEN_URL, ({ request }) => {
        expect(new URL(request.url).searchParams.get("code")).toBe("c");
        return HttpResponse.json({ access_token: "tok" });
      }),
    );
    const tokens = await exchangeAuthorizationCode(
      TOKEN_URL,
      { code: "c" },
      { platform: "facebook", method: "GET" },
    );
    expect(tokens.accessToken).toBe("tok");
  });

  it("maps a 400 from the token endpoint to a ConnectorError", async () => {
    server.use(
      http.post(TOKEN_URL, () =>
        HttpResponse.json({ error: "invalid_grant", error_description: "code used" }, { status: 400 }),
      ),
    );
    await expect(
      exchangeAuthorizationCode(TOKEN_URL, { code: "c" }, { platform: "linkedin" }),
    ).rejects.toMatchObject({ name: "ConnectorError", code: "rejected" });
  });
});

describe("refreshWithRefreshToken", () => {
  it("sends grant_type=refresh_token", async () => {
    let body = "";
    server.use(
      http.post(TOKEN_URL, async ({ request }) => {
        body = await request.text();
        return HttpResponse.json({ access_token: "fresh", expires_in: 100 });
      }),
    );
    const tokens = await refreshWithRefreshToken(
      TOKEN_URL,
      { accessToken: "old", refreshToken: "r" },
      { client_id: "id" },
      { platform: "linkedin" },
    );
    const params = new URLSearchParams(body);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("r");
    expect(params.get("client_id")).toBe("id");
    expect(tokens.accessToken).toBe("fresh");
  });

  it("fails clearly when there is no refresh token", async () => {
    await expect(
      refreshWithRefreshToken(TOKEN_URL, { accessToken: "old" }, {}, { platform: "linkedin" }),
    ).rejects.toMatchObject({ code: "auth_expired" });
  });
});

describe("isExpiringSoon", () => {
  it("is true inside the skew window and false outside", () => {
    expect(isExpiringSoon({ accessToken: "a", expiresAt: new Date(Date.now() + 60_000).toISOString() })).toBe(
      true,
    );
    expect(
      isExpiringSoon({ accessToken: "a", expiresAt: new Date(Date.now() + 3_600_000).toISOString() }),
    ).toBe(false);
    expect(
      isExpiringSoon({ accessToken: "a", expiresAt: new Date(Date.now() + 600_000).toISOString() }, 900),
    ).toBe(true);
  });

  it("treats tokens without an expiry (and nullish tokens) as long-lived", () => {
    expect(isExpiringSoon({ accessToken: "a" })).toBe(false);
    expect(isExpiringSoon(null)).toBe(false);
    expect(isExpiringSoon({ accessToken: "a", expiresAt: "not-a-date" })).toBe(false);
  });

  it("is true for an already expired token", () => {
    expect(isExpiringSoon({ accessToken: "a", expiresAt: new Date(Date.now() - 1000).toISOString() })).toBe(
      true,
    );
  });
});

describe("requireEnv", () => {
  it("returns the value or raises not_configured", () => {
    vi.stubEnv("SOME_TEST_VAR", "value");
    expect(requireEnv("SOME_TEST_VAR", "bluesky")).toBe("value");
    vi.stubEnv("SOME_TEST_VAR", "");
    expect(() => requireEnv("SOME_TEST_VAR", "bluesky")).toThrowError(/not configured/);
  });
});
