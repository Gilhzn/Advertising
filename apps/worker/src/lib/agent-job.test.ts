import "../test-setup.js";

import { BudgetExceededError } from "@adv/agents";
import { auditLog, eq, getDb } from "@adv/db";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestBusiness, fakeJob } from "../test-helpers.js";
import { runAgentJob } from "./agent-job.js";

describe("runAgentJob", () => {
  let biz: Awaited<ReturnType<typeof createTestBusiness>>;

  beforeEach(async () => {
    biz = await createTestBusiness();
  });

  afterEach(async () => {
    await biz.cleanup();
  });

  afterAll(async () => {
    await getDb().$client.end({ timeout: 1 });
  });

  it("writes <job>.completed and does not throw on success", async () => {
    await expect(
      runAgentJob("test_job", [fakeJob({ businessId: biz.businessId })], "tester", async () => "ok"),
    ).resolves.not.toThrow();

    const rows = await getDb().select().from(auditLog).where(eq(auditLog.businessId, biz.businessId));
    expect(rows.some((r) => r.action === "test_job.completed")).toBe(true);
  });

  it("writes <job>.budget_exceeded and does NOT throw (no pg-boss retry) on BudgetExceededError", async () => {
    const run = async () => {
      throw new BudgetExceededError("over budget", biz.businessId, 10, 5);
    };

    await expect(
      runAgentJob("test_job", [fakeJob({ businessId: biz.businessId })], "tester", run),
    ).resolves.not.toThrow();

    const rows = await getDb().select().from(auditLog).where(eq(auditLog.businessId, biz.businessId));
    expect(rows.some((r) => r.action === "test_job.budget_exceeded")).toBe(true);
    expect(rows.some((r) => r.action === "test_job.failed")).toBe(false);
  });

  it("writes <job>.failed and re-throws (pg-boss retries) on any other error", async () => {
    const run = async () => {
      throw new Error("boom");
    };

    await expect(
      runAgentJob("test_job", [fakeJob({ businessId: biz.businessId })], "tester", run),
    ).rejects.toThrow("boom");

    const rows = await getDb().select().from(auditLog).where(eq(auditLog.businessId, biz.businessId));
    expect(rows.some((r) => r.action === "test_job.failed")).toBe(true);
  });
});
