process.env.DATABASE_URL ??= "postgres://adv:adv@localhost:5432/adv";

import { businesses, eq, getDb, users } from "@adv/db";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AnalyticsError, PostHogClient } from "./posthog.js";
import { ensureProject, type SdkKind, snippetFor } from "./setup.js";

const HOST = "https://posthog-setup.test";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const db = getDb();

async function makeBusiness(overrides: Partial<typeof businesses.$inferInsert> = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [user] = await db
    .insert(users)
    .values({ email: `analytics-setup-${suffix}@example.com` })
    .returning();
  if (!user) throw new Error("failed to create user");
  const [business] = await db
    .insert(businesses)
    .values({
      userId: user.id,
      name: "Setup Test Co",
      slug: `analytics-setup-${suffix}`,
      description: "Business created by @adv/analytics setup.test.ts",
      ...overrides,
    })
    .returning();
  if (!business) throw new Error("failed to create business");
  return { user, business };
}

async function cleanup(userId: string, businessId: string) {
  await db.delete(businesses).where(eq(businesses.id, businessId));
  await db.delete(users).where(eq(users.id, userId));
}

describe("ensureProject", () => {
  const prevOrgId = process.env.POSTHOG_ORG_ID;
  afterEach(() => {
    if (prevOrgId === undefined) delete process.env.POSTHOG_ORG_ID;
    else process.env.POSTHOG_ORG_ID = prevOrgId;
  });

  it("skips when POSTHOG_ORG_ID is not configured", async () => {
    delete process.env.POSTHOG_ORG_ID;
    const { user, business } = await makeBusiness();
    try {
      const result = await ensureProject(business.id);
      expect(result).toEqual({ created: false, reason: "org_not_configured" });
    } finally {
      await cleanup(user.id, business.id);
    }
  });

  it("returns already_exists without calling PostHog when the business already has a project", async () => {
    process.env.POSTHOG_ORG_ID = "org_1";
    const { user, business } = await makeBusiness({ posthogProjectId: "555", posthogProjectToken: "phc_x" });
    try {
      const result = await ensureProject(business.id);
      expect(result).toEqual({ created: false, projectId: "555", reason: "already_exists" });
    } finally {
      await cleanup(user.id, business.id);
    }
  });

  it("creates a project via PostHog and stores id/token on the business", async () => {
    process.env.POSTHOG_ORG_ID = "org_1";
    server.use(
      http.post(`${HOST}/api/organizations/org_1/projects/`, async ({ request }) => {
        const body = (await request.json()) as { name: string };
        return HttpResponse.json({ id: 777, organization: "org_1", name: body.name, api_token: "phc_new" });
      }),
    );
    const { user, business } = await makeBusiness();
    try {
      const client = new PostHogClient({ host: HOST, personalApiKey: "phx_test" });
      const result = await ensureProject(business.id, { client });
      expect(result).toEqual({ created: true, projectId: "777" });

      const updated = await db.query.businesses.findFirst({ where: eq(businesses.id, business.id) });
      expect(updated?.posthogProjectId).toBe("777");
      expect(updated?.posthogProjectToken).toBe("phc_new");
    } finally {
      await cleanup(user.id, business.id);
    }
  });

  it("throws AnalyticsError for a business that doesn't exist", async () => {
    await expect(ensureProject("00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(
      AnalyticsError,
    );
  });
});

describe("snippetFor", () => {
  const kinds: SdkKind[] = ["web", "react", "nextjs", "ios", "android", "react_native", "flutter", "unity"];

  it.each(kinds)("returns install code and notes for %s", (kind) => {
    const snippet = snippetFor(kind, "phc_token_123", "https://us.posthog.com");
    expect(snippet.kind).toBe(kind);
    expect(snippet.install).toContain("phc_token_123");
    expect(snippet.notes.length).toBeGreaterThan(0);
    expect(snippet.notes.some((n) => n.includes("utm_source"))).toBe(true);
  });

  it("flags the Unity snippet as lowest-confidence", () => {
    const snippet = snippetFor("unity", "phc_token", "https://us.posthog.com");
    expect(snippet.notes.some((n) => n.includes("LOWEST-CONFIDENCE"))).toBe(true);
  });

  it("disables automatic pageview capture for Next.js in favour of manual capture", () => {
    const snippet = snippetFor("nextjs", "phc_token", "https://us.posthog.com");
    expect(snippet.install).toContain("capture_pageview: false");
    expect(snippet.install).toContain("posthog.capture('$pageview'");
  });
});
