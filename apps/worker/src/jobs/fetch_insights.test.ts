import "../test-setup.js";

import { registerConnector } from "@adv/connectors";
import { eq, getDb, metricSnapshots, platformAccounts } from "@adv/db";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestAccount,
  createTestBusiness,
  createTestPost,
  fakeJob,
  makeFakeConnector,
} from "../test-helpers.js";
import { handleFetchInsights } from "./fetch_insights.js";

describe("fetch_insights", () => {
  // Fresh business per test: `platform_accounts` enforces one owned account per (business, platform),
  // and each test here registers its own bluesky account.
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

  it("inserts metric_snapshots for a connected owned account, mapping externalPostId back to postId", async () => {
    const account = await createTestAccount(biz.businessId);
    const post = await createTestPost(biz.businessId, account.id, {
      status: "published",
      externalId: "ext-123",
      publishedAt: new Date(),
    });

    registerConnector(
      makeFakeConnector({
        fetchInsights: async () => [
          { metric: "likes", value: 12, capturedAt: new Date().toISOString(), externalPostId: "ext-123" },
          { metric: "followers", value: 500, capturedAt: new Date().toISOString() },
        ],
      }),
    );

    await handleFetchInsights([fakeJob({ businessId: biz.businessId })]);

    const db = getDb();
    const rows = await db.select().from(metricSnapshots).where(eq(metricSnapshots.accountId, account.id));
    expect(rows).toHaveLength(2);

    const likeRow = rows.find((r) => r.metric === "likes");
    expect(likeRow?.postId).toBe(post.id);
    expect(Number(likeRow?.value)).toBe(12);

    const followerRow = rows.find((r) => r.metric === "followers");
    expect(followerRow?.postId).toBeNull();

    const [accountRow] = await db.select().from(platformAccounts).where(eq(platformAccounts.id, account.id));
    expect(accountRow?.lastSyncedAt).toBeInstanceOf(Date);
  });

  it("skips accounts whose connector does not support insights", async () => {
    const account = await createTestAccount(biz.businessId, { handle: "no-insights" });
    registerConnector(
      makeFakeConnector({
        capabilities: {
          text: true,
          image: true,
          video: false,
          carousel: false,
          nativeSchedule: false,
          insights: false,
          maxChars: 300,
          maxMedia: 4,
          imageAspects: ["1:1"],
        },
        fetchInsights: async () => {
          throw new Error("should not be called");
        },
      }),
    );

    await expect(handleFetchInsights([fakeJob({ businessId: biz.businessId })])).resolves.not.toThrow();

    const db = getDb();
    const rows = await db.select().from(metricSnapshots).where(eq(metricSnapshots.accountId, account.id));
    expect(rows).toHaveLength(0);
  });

  it("still fetches insights for a privateUntilReview (pre-audit) account that supports insights", async () => {
    const account = await createTestAccount(biz.businessId, { handle: "pre-audit-account" });
    registerConnector(
      makeFakeConnector({
        capabilities: {
          text: true,
          image: true,
          video: true,
          carousel: false,
          nativeSchedule: false,
          insights: true,
          privateUntilReview: true,
          maxChars: 300,
          maxMedia: 4,
          imageAspects: ["1:1"],
        },
        fetchInsights: async () => [{ metric: "views", value: 7, capturedAt: new Date().toISOString() }],
      }),
    );

    await handleFetchInsights([fakeJob({ businessId: biz.businessId })]);

    const db = getDb();
    const rows = await db.select().from(metricSnapshots).where(eq(metricSnapshots.accountId, account.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.metric).toBe("views");
  });
});
