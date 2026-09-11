import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AnalyticsError, PostHogClient } from "./posthog.js";

const HOST = "https://posthog.test";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function client(opts: Partial<{ personalApiKey: string }> = {}) {
  return new PostHogClient({ host: HOST, personalApiKey: opts.personalApiKey ?? "phx_test_key" });
}

describe("PostHogClient", () => {
  it("throws when no API key is configured", () => {
    const prev = process.env.POSTHOG_PERSONAL_API_KEY;
    delete process.env.POSTHOG_PERSONAL_API_KEY;
    try {
      expect(() => new PostHogClient({ host: HOST })).toThrow(AnalyticsError);
    } finally {
      if (prev !== undefined) process.env.POSTHOG_PERSONAL_API_KEY = prev;
    }
  });

  it("createProject POSTs to /api/organizations/:org/projects/ with the auth header", async () => {
    let seenAuth: string | null = null;
    let seenBody: unknown;
    server.use(
      http.post(`${HOST}/api/organizations/:orgId/projects/`, async ({ request, params }) => {
        seenAuth = request.headers.get("authorization");
        seenBody = await request.json();
        return HttpResponse.json(
          {
            id: 42,
            organization: params.orgId,
            name: (seenBody as { name: string }).name,
            api_token: "phc_abc",
          },
          { status: 201 },
        );
      }),
    );

    const project = await client().createProject("org_1", "Acme Inc");
    expect(seenAuth).toBe("Bearer phx_test_key");
    expect(seenBody).toEqual({ name: "Acme Inc" });
    expect(project).toEqual({ id: 42, organization: "org_1", name: "Acme Inc", api_token: "phc_abc" });
  });

  it("getProject GETs /api/projects/:id/", async () => {
    server.use(
      http.get(`${HOST}/api/projects/42/`, () =>
        HttpResponse.json({ id: 42, organization: "org_1", name: "Acme Inc", api_token: "phc_abc" }),
      ),
    );
    const project = await client().getProject(42);
    expect(project.api_token).toBe("phc_abc");
  });

  it("query POSTs a HogQLQuery body and returns results", async () => {
    let seenBody: unknown;
    server.use(
      http.post(`${HOST}/api/projects/7/query/`, async ({ request }) => {
        seenBody = await request.json();
        return HttpResponse.json({ results: [["/home", 3]], columns: ["screen", "users"] });
      }),
    );
    const res = await client().query(7, "select 1");
    expect(seenBody).toEqual({ query: { kind: "HogQLQuery", query: "select 1" } });
    expect(res.results).toEqual([["/home", 3]]);
  });

  it("appends LIMIT when opts.limit is given and the HogQL has none", async () => {
    let seenQuery = "";
    server.use(
      http.post(`${HOST}/api/projects/7/query/`, async ({ request }) => {
        const body = (await request.json()) as { query: { query: string } };
        seenQuery = body.query.query;
        return HttpResponse.json({ results: [] });
      }),
    );
    await client().query(7, "select 1", { limit: 10 });
    expect(seenQuery).toContain("LIMIT 10");
  });

  it("throws a typed AnalyticsError with retryAfter on 429", async () => {
    server.use(
      http.post(`${HOST}/api/projects/7/query/`, () =>
        HttpResponse.json(
          { code: "api_queries_budget_exceeded" },
          { status: 429, headers: { "Retry-After": "30" } },
        ),
      ),
    );
    const err = await client()
      .query(7, "select 1")
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsError);
    expect(err.status).toBe(429);
    expect(err.retryAfter).toBe(30);
    expect(err.code).toBe("api_queries_budget_exceeded");
  });

  it("throws AnalyticsError on a non-2xx, non-429 response", async () => {
    server.use(http.get(`${HOST}/api/projects/7/`, () => new HttpResponse("nope", { status: 500 })));
    const err = await client()
      .getProject(7)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsError);
    expect(err.status).toBe(500);
    expect(err.code).toBe("http_error");
  });

  it("listHeatmaps returns the results array", async () => {
    server.use(
      http.get(`${HOST}/api/projects/7/heatmaps/`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("url_exact")).toBe("https://example.com/pricing");
        return HttpResponse.json({ results: [{ x: 10, y: 20, count: 5 }] });
      }),
    );
    const buckets = await client().listHeatmaps(7, { urlExact: "https://example.com/pricing" });
    expect(buckets).toEqual([{ x: 10, y: 20, count: 5 }]);
  });

  it("listRecordings passes limit through as a query param", async () => {
    server.use(
      http.get(`${HOST}/api/projects/7/session_recordings/`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("limit")).toBe("5");
        return HttpResponse.json({ results: [{ id: "rec_1" }], next: null });
      }),
    );
    const res = await client().listRecordings(7, { limit: 5 });
    expect(res.results).toEqual([{ id: "rec_1" }]);
  });
});
