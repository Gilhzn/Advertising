import "../test-setup.js";

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
});
