import { agentRuns, businesses, type Db, eq, getDb } from "@adv/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestBusiness, deleteTestBusiness, type TestBusiness } from "../evals/fixtures.js";
import { makeMockQuery } from "../evals/mock-query.js";
import { BudgetExceededError } from "./errors.js";
import { estimateCostUsd, PRICING_PER_MTOK } from "./model-policy.js";
import { monthToDateSpendUsd, type QueryFn, RUNTIME_DISALLOWED_TOOLS, runAgentJob } from "./runner.js";

let db: Db;
let biz: TestBusiness;

beforeAll(async () => {
  db = getDb();
  biz = await createTestBusiness(
    {
      name: "Runner Accounting Test",
      description: "A synthetic business used by the runner unit tests. Nothing here is published.",
      category: "saas",
      languages: ["en"],
      primaryLanguage: "en",
      aiMonthlyBudgetUsd: "50",
    },
    db,
  );
});

afterAll(async () => {
  if (biz) await deleteTestBusiness(biz.userId, db);
});

async function runRow(runId: string) {
  const [row] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId));
  return row;
}

describe("runAgentJob accounting", () => {
  it("stores usage and falls back to estimateCostUsd when the SDK reports no cost", async () => {
    const summary = await runAgentJob({
      businessId: biz.businessId,
      jobName: "test_job",
      agentName: "supervisor",
      prompt: "do the thing",
      model: "claude-sonnet-5",
      deps: {
        db,
        query: makeMockQuery(async () => "done", {
          costUsd: 0,
          inputTokens: 10_000,
          outputTokens: 2_000,
          cacheReadTokens: 5_000,
        }),
      },
    });

    expect(summary.status).toBe("succeeded");
    expect(summary.usage).toEqual({ inputTokens: 10_000, outputTokens: 2_000, cacheReadTokens: 5_000 });
    const expected = estimateCostUsd("claude-sonnet-5", { input: 10_000, output: 2_000, cacheRead: 5_000 });
    expect(summary.costUsd).toBeCloseTo(expected, 6);
    // sanity: the pricing table is the one being used
    expect(expected).toBeCloseTo(
      (10_000 * PRICING_PER_MTOK["claude-sonnet-5"]!.input +
        2_000 * PRICING_PER_MTOK["claude-sonnet-5"]!.output +
        5_000 * PRICING_PER_MTOK["claude-sonnet-5"]!.cacheRead) /
        1_000_000,
      9,
    );

    const row = await runRow(summary.runId);
    expect(row?.status).toBe("succeeded");
    expect(row?.inputTokens).toBe(10_000);
    expect(row?.outputTokens).toBe(2_000);
    expect(row?.cacheReadTokens).toBe(5_000);
    expect(Number(row?.costUsd)).toBeCloseTo(expected, 4);
    expect((row?.result as { sessionId?: string } | null)?.sessionId).toBe(summary.sessionId);
    expect(summary.sessionId).toBeTruthy();
  });

  it("prefers the SDK's total_cost_usd when it reports one", async () => {
    const summary = await runAgentJob({
      businessId: biz.businessId,
      jobName: "test_job",
      agentName: "supervisor",
      prompt: "do the thing",
      deps: { db, query: makeMockQuery(async () => "done", { costUsd: 0.4242 }) },
    });
    expect(summary.costUsd).toBeCloseTo(0.4242, 6);
    expect(Number((await runRow(summary.runId))?.costUsd)).toBeCloseTo(0.4242, 4);
  });

  it("records budget_exceeded when the SDK stops on the budget", async () => {
    const summary = await runAgentJob({
      businessId: biz.businessId,
      jobName: "test_job",
      agentName: "supervisor",
      prompt: "do the thing",
      maxBudgetUsd: 0.01,
      deps: {
        db,
        query: makeMockQuery(async () => "stopped", {
          costUsd: 0.011,
          resultSubtype: "error_max_budget_usd",
        }),
      },
    });
    expect(summary.status).toBe("budget_exceeded");
    expect((await runRow(summary.runId))?.status).toBe("budget_exceeded");
  });

  it("records failed when the query throws", async () => {
    const summary = await runAgentJob({
      businessId: biz.businessId,
      jobName: "test_job",
      agentName: "supervisor",
      prompt: "do the thing",
      deps: { db, query: makeMockQuery(async () => "never", { throwError: "transport died" }) },
    });
    expect(summary.status).toBe("failed");
    expect(summary.error).toContain("transport died");
    const row = await runRow(summary.runId);
    expect(row?.status).toBe("failed");
    expect(row?.error).toContain("transport died");
  });

  it("never gives runtime agents filesystem or shell tools", async () => {
    let captured: Record<string, unknown> | undefined;
    const spy: QueryFn = (params) => {
      captured = params.options as Record<string, unknown>;
      return makeMockQuery(async () => "ok")(params);
    };
    await runAgentJob({
      businessId: biz.businessId,
      jobName: "test_job",
      agentName: "supervisor",
      prompt: "do the thing",
      tools: ["Agent", "mcp__engine__*"],
      deps: { db, query: spy },
    });
    expect(captured?.disallowedTools).toEqual([...RUNTIME_DISALLOWED_TOOLS]);
    expect(captured?.permissionMode).toBe("bypassPermissions");
    expect(captured?.allowDangerouslySkipPermissions).toBe(true);
    expect(captured?.settingSources).toEqual([]);
    expect(captured?.allowedTools).toEqual(["Agent", "mcp__engine__*"]);
  });

  it("clamps maxBudgetUsd to what is left of the monthly cap", async () => {
    const scoped = await createTestBusiness(
      {
        name: "Budget Clamp",
        description: "Synthetic business for the monthly budget clamp test. Nothing is published.",
        category: "saas",
        languages: ["en"],
        primaryLanguage: "en",
        aiMonthlyBudgetUsd: "1.00",
      },
      db,
    );
    try {
      await db.insert(agentRuns).values({
        businessId: scoped.businessId,
        jobName: "previous",
        agent: "supervisor",
        model: "claude-opus-5",
        status: "succeeded",
        costUsd: "0.80",
      });
      let captured: Record<string, unknown> | undefined;
      const spy: QueryFn = (params) => {
        captured = params.options as Record<string, unknown>;
        return makeMockQuery(async () => "ok")(params);
      };
      await runAgentJob({
        businessId: scoped.businessId,
        jobName: "test_job",
        agentName: "supervisor",
        prompt: "x",
        maxBudgetUsd: 3,
        deps: { db, query: spy },
      });
      expect(captured?.maxBudgetUsd).toBeCloseTo(0.2, 6);
    } finally {
      await deleteTestBusiness(scoped.userId, db);
    }
  });

  it("throws BudgetExceededError before spending anything once the cap is reached", async () => {
    const scoped = await createTestBusiness(
      {
        name: "Budget Exhausted",
        description: "Synthetic business for the monthly budget cap test. Nothing is published.",
        category: "saas",
        languages: ["en"],
        primaryLanguage: "en",
        aiMonthlyBudgetUsd: "1.00",
      },
      db,
    );
    try {
      await db.insert(agentRuns).values({
        businessId: scoped.businessId,
        jobName: "previous",
        agent: "supervisor",
        model: "claude-opus-5",
        status: "succeeded",
        costUsd: "1.50",
      });
      expect(await monthToDateSpendUsd(scoped.businessId, db)).toBeCloseTo(1.5, 4);

      let called = false;
      const spy: QueryFn = (params) => {
        called = true;
        return makeMockQuery(async () => "ok")(params);
      };
      await expect(
        runAgentJob({
          businessId: scoped.businessId,
          jobName: "test_job",
          agentName: "supervisor",
          prompt: "x",
          deps: { db, query: spy },
        }),
      ).rejects.toBeInstanceOf(BudgetExceededError);
      expect(called).toBe(false);

      const rows = await db.select().from(agentRuns).where(eq(agentRuns.businessId, scoped.businessId));
      expect(rows).toHaveLength(1); // only the seeded run; no "running" row was created
    } finally {
      await deleteTestBusiness(scoped.userId, db);
    }
  });

  it("does not apply a monthly cap to runs with no business", async () => {
    const summary = await runAgentJob({
      businessId: null,
      jobName: "system_job",
      agentName: "supervisor",
      prompt: "x",
      deps: { db, query: makeMockQuery(async () => "ok", { costUsd: 0.01 }) },
    });
    expect(summary.status).toBe("succeeded");
    await db.delete(agentRuns).where(eq(agentRuns.id, summary.runId));
  });
});

describe("monthly budget reads", () => {
  it("reads the cap from the business row", async () => {
    const [row] = await db
      .select({ cap: businesses.aiMonthlyBudgetUsd })
      .from(businesses)
      .where(eq(businesses.id, biz.businessId));
    expect(Number(row?.cap)).toBe(50);
  });
});
