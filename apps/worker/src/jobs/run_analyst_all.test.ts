import "../test-setup.js";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { enqueueMock } = vi.hoisted(() => ({ enqueueMock: vi.fn() }));

vi.mock("@adv/jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@adv/jobs")>();
  return { ...actual, enqueue: enqueueMock };
});

const { getDb } = await import("@adv/db");
const { createTestBusiness, createTestPost, fakeJob } = await import("../test-helpers.js");
const { handleRunAnalystAll } = await import("./run_analyst_all.js");

describe("run_analyst_all", () => {
  let withPublished: Awaited<ReturnType<typeof createTestBusiness>>;
  let withoutPublished: Awaited<ReturnType<typeof createTestBusiness>>;

  beforeEach(async () => {
    withPublished = await createTestBusiness();
    withoutPublished = await createTestBusiness();
    enqueueMock.mockReset();
    await createTestPost(withPublished.businessId, null, { status: "published" });
    await createTestPost(withoutPublished.businessId, null, { status: "draft" });
  });

  afterEach(async () => {
    await withPublished.cleanup();
    await withoutPublished.cleanup();
  });

  afterAll(async () => {
    await getDb().$client.end({ timeout: 1 });
  });

  it("enqueues run_analyst only for businesses with at least one published post", async () => {
    await handleRunAnalystAll([fakeJob({})]);

    const calledBusinessIds = enqueueMock.mock.calls
      .filter((c) => c[0] === "run_analyst")
      .map((c) => (c[1] as { businessId: string }).businessId);

    expect(calledBusinessIds).toContain(withPublished.businessId);
    expect(calledBusinessIds).not.toContain(withoutPublished.businessId);
  });
});
