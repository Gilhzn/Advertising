import "../test-setup.js";

import { channelPlans, getDb } from "@adv/db";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { enqueueMock } = vi.hoisted(() => ({ enqueueMock: vi.fn() }));

vi.mock("@adv/jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@adv/jobs")>();
  return { ...actual, enqueue: enqueueMock };
});

const { createTestAccount, createTestBusiness, createTestPost, fakeJob } = await import("../test-helpers.js");
const { handleContentAutopilot } = await import("./content_autopilot.js");

async function approveChannelPlan(businessId: string) {
  const db = getDb();
  await db.insert(channelPlans).values({ businessId, data: {}, approvedAt: new Date() });
}

async function draftChannelPlan(businessId: string) {
  const db = getDb();
  await db.insert(channelPlans).values({ businessId, data: {} });
}

function inNextWeek(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

describe("content_autopilot", () => {
  let biz: Awaited<ReturnType<typeof createTestBusiness>>;

  beforeEach(async () => {
    biz = await createTestBusiness();
    enqueueMock.mockReset();
  });

  afterEach(async () => {
    await biz.cleanup();
  });

  afterAll(async () => {
    await getDb().$client.end({ timeout: 1 });
  });

  it("enqueues generate_content_batch for an eligible business with fewer than 3 posts scheduled", async () => {
    await approveChannelPlan(biz.businessId);
    await createTestAccount(biz.businessId);

    await handleContentAutopilot([fakeJob({})]);

    expect(enqueueMock).toHaveBeenCalledWith(
      "generate_content_batch",
      { businessId: biz.businessId, days: 7 },
      { singletonKey: biz.businessId },
    );
  });

  it("does not enqueue when 3+ posts are already scheduled in the next 7 days", async () => {
    await approveChannelPlan(biz.businessId);
    const account = await createTestAccount(biz.businessId);
    for (let i = 0; i < 3; i++) {
      await createTestPost(biz.businessId, account.id, {
        status: "scheduled",
        scheduledAt: inNextWeek(1 + i),
      });
    }

    await handleContentAutopilot([fakeJob({})]);

    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("does not enqueue when the channel plan is not approved yet", async () => {
    await draftChannelPlan(biz.businessId);
    await createTestAccount(biz.businessId);

    await handleContentAutopilot([fakeJob({})]);

    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("does not enqueue when there is no connected account", async () => {
    await approveChannelPlan(biz.businessId);

    await handleContentAutopilot([fakeJob({})]);

    expect(enqueueMock).not.toHaveBeenCalled();
  });
});
