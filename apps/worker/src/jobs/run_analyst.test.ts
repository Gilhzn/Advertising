import "../test-setup.js";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runAnalystMock, enqueueMock } = vi.hoisted(() => ({
  runAnalystMock: vi.fn(),
  enqueueMock: vi.fn(),
}));

vi.mock("../agents-shim.js", () => ({ runAnalyst: runAnalystMock }));

vi.mock("@adv/jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@adv/jobs")>();
  return { ...actual, enqueue: enqueueMock };
});

const { businesses, eq, getDb } = await import("@adv/db");
const { createTestBusiness, fakeJob } = await import("../test-helpers.js");
const { handleRunAnalyst } = await import("./run_analyst.js");

describe("run_analyst", () => {
  let biz: Awaited<ReturnType<typeof createTestBusiness>>;

  beforeEach(async () => {
    biz = await createTestBusiness();
    runAnalystMock.mockReset();
    enqueueMock.mockReset();
  });

  afterEach(async () => {
    await biz.cleanup();
  });

  afterAll(async () => {
    await getDb().$client.end({ timeout: 1 });
  });

  it("enqueues discover_business(reason: replan) when the analyst changed businesses.weights", async () => {
    runAnalystMock.mockImplementation(async (businessId: string) => {
      const db = getDb();
      await db
        .update(businesses)
        .set({ weights: { platforms: { bluesky: 1.2 } } })
        .where(eq(businesses.id, businessId));
      return { ok: true };
    });

    await handleRunAnalyst([fakeJob({ businessId: biz.businessId })]);

    expect(enqueueMock).toHaveBeenCalledWith("discover_business", {
      businessId: biz.businessId,
      reason: "replan",
    });
  });

  it("does not enqueue discover_business when weights are unchanged", async () => {
    runAnalystMock.mockResolvedValue({ ok: true });

    await handleRunAnalyst([fakeJob({ businessId: biz.businessId })]);

    expect(enqueueMock).not.toHaveBeenCalled();
  });
});
