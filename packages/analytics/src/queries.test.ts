import { describe, expect, it } from "vitest";
import type { QueryResponse } from "./posthog.js";
import {
  buildTrackedUrl,
  funnelQuery,
  hogqlString,
  normaliseFunnel,
  normaliseOverview,
  normaliseRageClicks,
  normaliseRetention,
  normaliseTopElements,
  normaliseTopScreens,
  normaliseUtmAttribution,
  resolvePeriod,
  utmAttributionQuery,
} from "./queries.js";

function response(results: unknown[][]): QueryResponse {
  return { results };
}

describe("resolvePeriod", () => {
  it("resolves a trailing-days period against `now`", () => {
    const now = new Date("2026-09-11T00:00:00.000Z");
    const { start, end } = resolvePeriod({ days: 7 }, now);
    expect(end).toEqual(now);
    expect(start.toISOString()).toBe("2026-09-04T00:00:00.000Z");
  });

  it("resolves an explicit start/end period", () => {
    const { start, end } = resolvePeriod({ start: "2026-01-01T00:00:00Z", end: "2026-01-08T00:00:00Z" });
    expect(start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });
});

describe("hogqlString", () => {
  it("escapes single quotes and backslashes", () => {
    expect(hogqlString("post's \\ id")).toBe("'post\\'s \\\\ id'");
  });
});

describe("normaliseOverview", () => {
  it("computes bounceRate from bounced/total sessions", () => {
    const row = normaliseOverview(response([[100, 40, 125.5, 8]]));
    expect(row).toEqual({ users: 100, sessions: 40, avgSessionDurationSeconds: 125.5, bounceRate: 0.2 });
  });

  it("returns nulls when there are no sessions", () => {
    const row = normaliseOverview(response([[0, 0, null, 0]]));
    expect(row).toEqual({ users: 0, sessions: 0, avgSessionDurationSeconds: null, bounceRate: null });
  });
});

describe("normaliseTopScreens", () => {
  it("maps rows to typed screens", () => {
    const rows = normaliseTopScreens(
      response([
        ["/home", 50, 80, 4200],
        ["/pricing", 20, 22, 900],
      ]),
    );
    expect(rows).toEqual([
      { screen: "/home", uniqueUsers: 50, pageviews: 80, totalDurationSeconds: 4200 },
      { screen: "/pricing", uniqueUsers: 20, pageviews: 22, totalDurationSeconds: 900 },
    ]);
  });
});

describe("normaliseTopElements", () => {
  it("maps rows to typed elements", () => {
    const rows = normaliseTopElements(response([["button.cta:nth-child(2)", "https://example.com/", 12, 9]]));
    expect(rows).toEqual([
      { element: "button.cta:nth-child(2)", url: "https://example.com/", clicks: 12, uniqueUsers: 9 },
    ]);
  });
});

describe("normaliseRageClicks", () => {
  it("maps rows to typed rage clicks", () => {
    const rows = normaliseRageClicks(response([["https://example.com/checkout", "div.submit", 5, 3]]));
    expect(rows).toEqual([
      { url: "https://example.com/checkout", element: "div.submit", rageClicks: 5, uniqueUsers: 3 },
    ]);
  });
});

describe("funnelQuery / normaliseFunnel", () => {
  const steps = ["signup", "activate", "purchase"];

  it("builds a query that filters on all step events", () => {
    const sql = funnelQuery(steps, { days: 30 });
    expect(sql).toContain("step_0_users");
    expect(sql).toContain("step_2_users");
    expect(sql).toContain("'signup'");
    expect(sql).toContain("'purchase'");
  });

  it("throws with no steps", () => {
    expect(() => funnelQuery([], { days: 30 })).toThrow();
  });

  it("normalises step counts into conversion rates", () => {
    const rows = normaliseFunnel(response([[100, 40, 10]]), steps);
    expect(rows).toEqual([
      { step: 0, event: "signup", users: 100, conversionFromFirst: 1, conversionFromPrevious: null },
      { step: 1, event: "activate", users: 40, conversionFromFirst: 0.4, conversionFromPrevious: 0.4 },
      { step: 2, event: "purchase", users: 10, conversionFromFirst: 0.1, conversionFromPrevious: 0.25 },
    ]);
  });

  it("handles a zero-user first step without dividing by zero", () => {
    const rows = normaliseFunnel(response([[0, 0]]), ["signup", "activate"]);
    expect(rows[0]?.conversionFromFirst).toBeNull();
    expect(rows[1]?.conversionFromPrevious).toBeNull();
  });
});

describe("normaliseRetention", () => {
  it("computes retentionRate per cohort", () => {
    const rows = normaliseRetention(
      response([
        ["2026-09-01", 50, 10],
        ["2026-09-02", 0, 0],
      ]),
    );
    expect(rows).toEqual([
      { cohortDate: "2026-09-01", cohortSize: 50, retainedUsers: 10, retentionRate: 0.2 },
      { cohortDate: "2026-09-02", cohortSize: 0, retainedUsers: 0, retentionRate: 0 },
    ]);
  });
});

describe("utmAttributionQuery / normaliseUtmAttribution", () => {
  it("normalises utm rows and joins nulls through", () => {
    const rows = normaliseUtmAttribution(
      response([
        ["instagram", "social", "post_123", 40, 30],
        [null, null, null, 5, 4],
      ]),
    );
    expect(rows[0]).toEqual({
      utmSource: "instagram",
      utmMedium: "social",
      utmCampaign: "post_123",
      pageviews: 40,
      uniqueUsers: 30,
    });
    expect(rows[1]?.utmSource).toBeNull();
  });

  it("builds a query grouped by utm_source/utm_medium/utm_campaign", () => {
    const sql = utmAttributionQuery({ days: 7 });
    expect(sql).toContain("utm_source");
    expect(sql).toContain("group by utm_source, utm_medium, utm_campaign");
  });
});

describe("buildTrackedUrl", () => {
  it("adds utm_source/utm_medium/utm_campaign to a plain url", () => {
    const tracked = buildTrackedUrl("https://example.com/app", { platform: "instagram", postId: "post_123" });
    const url = new URL(tracked);
    expect(url.searchParams.get("utm_source")).toBe("instagram");
    expect(url.searchParams.get("utm_medium")).toBe("social");
    expect(url.searchParams.get("utm_campaign")).toBe("post_123");
  });

  it("overrides an existing utm_source rather than duplicating it", () => {
    const tracked = buildTrackedUrl("https://example.com/app?utm_source=old", {
      platform: "linkedin",
      postId: "post_9",
      medium: "organic",
    });
    const url = new URL(tracked);
    expect(url.searchParams.getAll("utm_source")).toEqual(["linkedin"]);
    expect(url.searchParams.get("utm_medium")).toBe("organic");
  });
});
