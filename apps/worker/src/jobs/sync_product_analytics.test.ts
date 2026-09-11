import "../test-setup.js";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { syncProductAnalyticsMock } = vi.hoisted(() => ({
  syncProductAnalyticsMock: vi.fn(),
}));

vi.mock("@adv/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@adv/analytics")>();
  return { ...actual, syncProductAnalytics: syncProductAnalyticsMock };
});

const { businesses, eq, getDb } = await import("@adv/db");
const { createTestBusiness, fakeJob } = await import("../test-helpers.js");
const { handleSyncProductAnalytics } = await import("./sync_product_analytics.js");

describe("sync_product_analytics", () => {
  let biz: Awaited<ReturnType<typeof createTestBusiness>>;

  beforeEach(async () => {
    biz = await createTestBusiness();
    syncProductAnalyticsMock.mockReset();
  });

  afterEach(async () => {
    await biz.cleanup();
  });

  afterAll(async () => {
    await getDb().$client.end({ timeout: 1 });
  });

  it("syncs a single business when businessId is given in the payload", async () => {
    syncProductAnalyticsMock.mockResolvedValue({
      skipped: false,
      kinds: ["overview"],
      periodStart: new Date().toISOString(),
      periodEnd: new Date().toISOString(),
      clickMetricsWritten: 0,
    });

    await handleSyncProductAnalytics([fakeJob({ businessId: biz.businessId })]);

    expect(syncProductAnalyticsMock).toHaveBeenCalledTimes(1);
    expect(syncProductAnalyticsMock).toHaveBeenCalledWith(biz.businessId);
  });

  it("fans out to every business with a posthog project when no businessId is given", async () => {
    const db = getDb();
    await db
      .update(businesses)
      .set({ posthogProjectId: "ph-project-1" })
      .where(eq(businesses.id, biz.businessId));
    syncProductAnalyticsMock.mockResolvedValue({ skipped: true, reason: "no_project" });

    await handleSyncProductAnalytics([fakeJob({})]);

    const calledIds = syncProductAnalyticsMock.mock.calls.map((c) => c[0]);
    expect(calledIds).toContain(biz.businessId);
  });

  it("is tolerant per business: one failure does not stop the batch", async () => {
    const other = await createTestBusinessWithPosthog();
    syncProductAnalyticsMock.mockImplementation(async (businessId: string) => {
      if (businessId === biz.businessId) throw new Error("posthog auth failed");
      return { skipped: false, kinds: [], periodStart: "", periodEnd: "", clickMetricsWritten: 0 };
    });

    const db = getDb();
    await db
      .update(businesses)
      .set({ posthogProjectId: "ph-project-2" })
      .where(eq(businesses.id, biz.businessId));

    await expect(handleSyncProductAnalytics([fakeJob({})])).resolves.not.toThrow();
    expect(syncProductAnalyticsMock).toHaveBeenCalledWith(biz.businessId);
    expect(syncProductAnalyticsMock).toHaveBeenCalledWith(other.businessId);

    await other.cleanup();
  });

  async function createTestBusinessWithPosthog() {
    const created = await createTestBusiness();
    await db_setPosthog(created.businessId, "ph-project-3");
    return created;
  }

  async function db_setPosthog(businessId: string, projectId: string) {
    const db = getDb();
    await db.update(businesses).set({ posthogProjectId: projectId }).where(eq(businesses.id, businessId));
  }
});
