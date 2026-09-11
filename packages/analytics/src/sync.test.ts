process.env.DATABASE_URL ??= "postgres://adv:adv@localhost:5432/adv";

import { businesses, eq, getDb, metricSnapshots, posts, productAnalyticsSnapshots, users } from "@adv/db";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PostHogClient } from "./posthog.js";
import { syncProductAnalytics } from "./sync.js";

const HOST = "https://posthog-sync.test";
const PROJECT_ID = "999901";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const db = getDb();

let userId: string;
let businessId: string;
let postId: string;

beforeAll(async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [user] = await db
    .insert(users)
    .values({ email: `analytics-sync-${suffix}@example.com`, name: "Analytics Sync Test" })
    .returning();
  if (!user) throw new Error("failed to create test user");
  userId = user.id;

  const [business] = await db
    .insert(businesses)
    .values({
      userId,
      name: "Analytics Sync Test Co",
      slug: `analytics-sync-${suffix}`,
      description: "Business created by @adv/analytics sync.test.ts",
      posthogProjectId: PROJECT_ID,
      posthogProjectToken: "phc_test_token",
    })
    .returning();
  if (!business) throw new Error("failed to create test business");
  businessId = business.id;

  const [post] = await db
    .insert(posts)
    .values({
      businessId,
      platform: "instagram",
      body: "Test post used to verify click-through attribution.",
      status: "published",
    })
    .returning();
  if (!post) throw new Error("failed to create test post");
  postId = post.id;
});

afterAll(async () => {
  if (businessId) await db.delete(businesses).where(eq(businesses.id, businessId));
  if (userId) await db.delete(users).where(eq(users.id, userId));
});

function mockQueryHandler(currentPostId: string) {
  return http.post(`${HOST}/api/projects/${PROJECT_ID}/query/`, async ({ request }) => {
    const body = (await request.json()) as { query: { query: string } };
    const sql = body.query.query;
    if (sql.includes("bounced_sessions")) {
      return HttpResponse.json({ results: [[120, 40, 95.5, 6]] });
    }
    if (sql.includes("cohort_date")) {
      return HttpResponse.json({ results: [["2026-09-04", 30, 9]] });
    }
    if (sql.includes("'$rageclick'")) {
      return HttpResponse.json({ results: [["https://example.com/checkout", "div.submit", 4, 3]] });
    }
    if (sql.includes("elements_chain as element")) {
      return HttpResponse.json({ results: [["button.cta", "https://example.com/", 15, 10]] });
    }
    if (sql.includes("utm_source as utm_source")) {
      return HttpResponse.json({
        results: [
          ["instagram", "social", currentPostId, 25, 18],
          ["linkedin", "social", "not-a-real-post-id", 3, 2],
        ],
      });
    }
    if (sql.includes("coalesce(properties.$current_url")) {
      return HttpResponse.json({ results: [["/home", 60, 90, 5400]] });
    }
    throw new Error(`unexpected HogQL query in test: ${sql}`);
  });
}

function mockHeatmapsHandler(buckets: unknown[] = [{ x: 1, y: 2, count: 3 }]) {
  return http.get(`${HOST}/api/projects/${PROJECT_ID}/heatmaps/`, () =>
    HttpResponse.json({ results: buckets }),
  );
}

describe("syncProductAnalytics", () => {
  it("writes one product_analytics_snapshots row per kind and a clicks metric for the matching post", async () => {
    server.use(mockQueryHandler(postId), mockHeatmapsHandler());
    const client = new PostHogClient({ host: HOST, personalApiKey: "phx_test" });

    const result = await syncProductAnalytics(businessId, { days: 7, client });

    expect(result.skipped).toBe(false);
    if (result.skipped) throw new Error("unreachable");
    expect(result.kinds.sort()).toEqual(
      [
        "heatmap_ref",
        "overview",
        "rage_clicks",
        "retention",
        "top_elements",
        "top_screens",
        "utm_attribution",
      ].sort(),
    );
    expect(result.clickMetricsWritten).toBe(1);

    const rows = await db.query.productAnalyticsSnapshots.findMany({
      where: eq(productAnalyticsSnapshots.businessId, businessId),
    });
    expect(rows).toHaveLength(7);

    const overviewRow = rows.find((r) => r.kind === "overview");
    expect(overviewRow?.payload).toMatchObject({ users: 120, sessions: 40, bounceRate: 0.15 });

    const heatmapRow = rows.find((r) => r.kind === "heatmap_ref");
    expect(heatmapRow?.payload).toMatchObject({ available: true });

    const metricRows = await db.query.metricSnapshots.findMany({
      where: eq(metricSnapshots.postId, postId),
    });
    expect(metricRows).toHaveLength(1);
    expect(metricRows[0]?.metric).toBe("clicks");
    expect(Number(metricRows[0]?.value)).toBe(25);
  });

  it("is idempotent per day: re-running replaces rows rather than duplicating them", async () => {
    server.use(mockQueryHandler(postId), mockHeatmapsHandler());
    const client = new PostHogClient({ host: HOST, personalApiKey: "phx_test" });

    await syncProductAnalytics(businessId, { days: 7, client });
    await syncProductAnalytics(businessId, { days: 7, client });

    const rows = await db.query.productAnalyticsSnapshots.findMany({
      where: eq(productAnalyticsSnapshots.businessId, businessId),
    });
    expect(rows).toHaveLength(7);

    const metricRows = await db.query.metricSnapshots.findMany({
      where: eq(metricSnapshots.postId, postId),
    });
    expect(metricRows).toHaveLength(1);
  });

  it("stores heatmap_ref as unavailable (without failing the whole sync) when heatmaps 500s", async () => {
    server.use(
      mockQueryHandler(postId),
      http.get(
        `${HOST}/api/projects/${PROJECT_ID}/heatmaps/`,
        () => new HttpResponse("boom", { status: 500 }),
      ),
    );
    const client = new PostHogClient({ host: HOST, personalApiKey: "phx_test" });

    const result = await syncProductAnalytics(businessId, { days: 7, client });
    expect(result.skipped).toBe(false);

    const rows = await db.query.productAnalyticsSnapshots.findMany({
      where: eq(productAnalyticsSnapshots.businessId, businessId),
    });
    const heatmapRow = rows.find((r) => r.kind === "heatmap_ref");
    expect(heatmapRow?.payload).toMatchObject({ available: false });
  });

  it("tolerates a business with no linked PostHog project", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [user] = await db
      .insert(users)
      .values({ email: `analytics-noproj-${suffix}@example.com` })
      .returning();
    if (!user) throw new Error("failed to create user");
    const [biz] = await db
      .insert(businesses)
      .values({
        userId: user.id,
        name: "No Project Co",
        slug: `analytics-noproj-${suffix}`,
        description: "Business with no posthog project linked",
      })
      .returning();
    if (!biz) throw new Error("failed to create business");

    try {
      const result = await syncProductAnalytics(biz.id, { days: 7 });
      expect(result).toEqual({ skipped: true, reason: "no_project" });
    } finally {
      await db.delete(businesses).where(eq(businesses.id, biz.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
  });

  it("tolerates a business id that doesn't exist", async () => {
    const result = await syncProductAnalytics("00000000-0000-0000-0000-000000000000", { days: 7 });
    expect(result).toEqual({ skipped: true, reason: "no_business" });
  });
});
