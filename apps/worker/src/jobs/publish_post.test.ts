import "../test-setup.js";
import { randomUUID } from "node:crypto";

import { registerConnector } from "@adv/connectors";
import { eq, getDb, posts } from "@adv/db";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestAccount,
  createTestBusiness,
  createTestCommunity,
  createTestPost,
  fakeJob,
  makeFakeConnector,
} from "../test-helpers.js";
import { handlePublishPost } from "./publish_post.js";

describe("publish_post", () => {
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

  it("publishes an approved owned-account post and sets externalId/publishedAt", async () => {
    const publish = vi.fn(async (_account: unknown, post: { id: string }) => ({
      externalId: `ext-${post.id}`,
      url: `https://fake.test/${post.id}`,
    }));
    registerConnector(makeFakeConnector({ publish }));

    const account = await createTestAccount(biz.businessId);
    const post = await createTestPost(biz.businessId, account.id, {
      status: "approved",
      scheduledAt: new Date(Date.now() - 1000),
    });

    await handlePublishPost([fakeJob({ postId: post.id })]);

    const [row] = await getDb().select().from(posts).where(eq(posts.id, post.id));
    expect(row?.status).toBe("published");
    expect(row?.externalId).toBe(`ext-${post.id}`);
    expect(row?.externalUrl).toBe(`https://fake.test/${post.id}`);
    expect(row?.publishedAt).toBeInstanceOf(Date);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: re-running a published post does not call the connector again", async () => {
    const publish = vi.fn(async (_account: unknown, post: { id: string }) => ({
      externalId: `ext-${post.id}`,
    }));
    registerConnector(makeFakeConnector({ publish }));

    const account = await createTestAccount(biz.businessId);
    const post = await createTestPost(biz.businessId, account.id, {
      status: "approved",
      scheduledAt: new Date(Date.now() - 1000),
    });

    await handlePublishPost([fakeJob({ postId: post.id })]);
    expect(publish).toHaveBeenCalledTimes(1);

    await handlePublishPost([fakeJob({ postId: post.id })]);
    expect(publish).toHaveBeenCalledTimes(1); // not called again - already published with an externalId

    const [row] = await getDb().select().from(posts).where(eq(posts.id, post.id));
    expect(row?.status).toBe("published");
  });

  it("refuses a community post that was never approved, without calling the connector", async () => {
    const publish = vi.fn();
    registerConnector(makeFakeConnector({ publish }));

    const account = await createTestAccount(biz.businessId);
    const community = await createTestCommunity(biz.businessId);
    const post = await createTestPost(biz.businessId, account.id, {
      communityId: community.id,
      status: "awaiting_approval",
      scheduledAt: new Date(Date.now() - 1000),
    });

    await handlePublishPost([fakeJob({ postId: post.id })]);

    expect(publish).not.toHaveBeenCalled();
    const [row] = await getDb().select().from(posts).where(eq(posts.id, post.id));
    expect(row?.status).toBe("failed");
    expect(row?.lastError).toMatch(/approval/i);
  });

  it("refuses when the account is not connected", async () => {
    const publish = vi.fn();
    registerConnector(makeFakeConnector({ publish }));

    const account = await createTestAccount(biz.businessId, { status: "disconnected" });
    const post = await createTestPost(biz.businessId, account.id, {
      status: "approved",
      scheduledAt: new Date(Date.now() - 1000),
    });

    await handlePublishPost([fakeJob({ postId: post.id })]);

    expect(publish).not.toHaveBeenCalled();
    const [row] = await getDb().select().from(posts).where(eq(posts.id, post.id));
    expect(row?.status).toBe("failed");
    expect(row?.lastError).toMatch(/not connected/i);
  });

  it("refuses a post that has no compliance verdict and no human approval", async () => {
    // The compliance guard used to be enforced by the prompt alone: create_post_draft ->
    // schedule_post, never calling check_compliance, produced an `approved` post that published.
    const publish = vi.fn();
    registerConnector(makeFakeConnector({ publish }));
    const account = await createTestAccount(biz.businessId);
    const post = await createTestPost(biz.businessId, account.id, {
      status: "approved",
      compliance: null,
      scheduledAt: new Date(Date.now() - 1000),
    });

    await handlePublishPost([fakeJob({ postId: post.id })]);

    expect(publish).not.toHaveBeenCalled();
    const [row] = await getDb().select().from(posts).where(eq(posts.id, post.id));
    expect(row?.status).toBe("failed");
    expect(row?.lastError).toMatch(/no compliance verdict/i);
  });

  it("refuses a post the compliance guard blocked", async () => {
    const publish = vi.fn();
    registerConnector(makeFakeConnector({ publish }));
    const account = await createTestAccount(biz.businessId);
    const post = await createTestPost(biz.businessId, account.id, {
      status: "approved",
      compliance: { verdict: "block", issues: ["off-topic promotion"] },
      approvedBy: null,
      scheduledAt: new Date(Date.now() - 1000),
    });

    await handlePublishPost([fakeJob({ postId: post.id })]);

    expect(publish).not.toHaveBeenCalled();
    const [row] = await getDb().select().from(posts).where(eq(posts.id, post.id));
    expect(row?.lastError).toMatch(/blocked/i);
  });

  it("lets a human-approved post through without a compliance verdict", async () => {
    const publish = vi.fn(async (_a: unknown, post: { id: string }) => ({
      externalId: `ext-${post.id}`,
      url: `https://fake.test/${post.id}`,
    }));
    registerConnector(makeFakeConnector({ publish }));
    const account = await createTestAccount(biz.businessId);
    const post = await createTestPost(biz.businessId, account.id, {
      status: "approved",
      compliance: null,
      approvedBy: biz.userId,
      scheduledAt: new Date(Date.now() - 1000),
    });

    await handlePublishPost([fakeJob({ postId: post.id })]);

    const [row] = await getDb().select().from(posts).where(eq(posts.id, post.id));
    expect(row?.status).toBe("published");
  });

  it("does not re-publish when a retry replays a consumed scheduler claim token", async () => {
    // The old marker was `claimedBy === "scheduler" && status === "publishing"`, and both halves stay
    // true on every pg-boss retry - so a worker killed after the platform accepted the post retried,
    // skipped the claim and published a second time.
    const publish = vi.fn(async (_a: unknown, post: { id: string }) => ({
      externalId: `ext-${post.id}`,
      url: `https://fake.test/${post.id}`,
    }));
    registerConnector(makeFakeConnector({ publish }));
    const account = await createTestAccount(biz.businessId);
    const claimToken = randomUUID();
    const post = await createTestPost(biz.businessId, account.id, {
      status: "publishing",
      claimToken,
      scheduledAt: new Date(Date.now() - 1000),
    });

    // First delivery consumes the token and publishes.
    await handlePublishPost([fakeJob({ postId: post.id, claimedBy: "scheduler", claimToken })]);
    expect(publish).toHaveBeenCalledTimes(1);

    // Simulate the crash-before-write case: the row is back in `publishing` with a fresh lease, and
    // pg-boss redelivers the identical payload. The token is gone, so the shortcut must not apply.
    await getDb()
      .update(posts)
      .set({ status: "publishing", externalId: null, updatedAt: new Date() })
      .where(eq(posts.id, post.id));

    await handlePublishPost([fakeJob({ postId: post.id, claimedBy: "scheduler", claimToken })]);
    expect(publish).toHaveBeenCalledTimes(1);
  });
});
