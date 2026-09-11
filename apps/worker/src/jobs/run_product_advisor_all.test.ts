import "../test-setup.js";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { enqueueMock } = vi.hoisted(() => ({ enqueueMock: vi.fn() }));

vi.mock("@adv/jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@adv/jobs")>();
  return { ...actual, enqueue: enqueueMock };
});

const { businesses, eq, getDb } = await import("@adv/db");
const { createTestBusiness, fakeJob } = await import("../test-helpers.js");
const { handleRunProductAdvisorAll } = await import("./run_product_advisor_all.js");

describe("run_product_advisor_all", () => {
  let withProject: Awaited<ReturnType<typeof createTestBusiness>>;
  let withoutProject: Awaited<ReturnType<typeof createTestBusiness>>;

  beforeEach(async () => {
    withProject = await createTestBusiness();
    withoutProject = await createTestBusiness();
    enqueueMock.mockReset();
    const db = getDb();
    await db
      .update(businesses)
      .set({ posthogProjectId: "ph-project-abc" })
      .where(eq(businesses.id, withProject.businessId));
  });

  afterEach(async () => {
    await withProject.cleanup();
    await withoutProject.cleanup();
  });

  afterAll(async () => {
    await getDb().$client.end({ timeout: 1 });
  });

  it("enqueues run_product_advisor only for businesses with a linked posthog project", async () => {
    await handleRunProductAdvisorAll([fakeJob({})]);

    const calledBusinessIds = enqueueMock.mock.calls
      .filter((c) => c[0] === "run_product_advisor")
      .map((c) => (c[1] as { businessId: string }).businessId);

    expect(calledBusinessIds).toContain(withProject.businessId);
    expect(calledBusinessIds).not.toContain(withoutProject.businessId);
  });
});
