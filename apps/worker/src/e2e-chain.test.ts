import "./test-setup.js";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Plan verification #4: the full posting chain against the real local DB, without any real platform
 * account - a fake connector (`registerConnector`) stands in for the platform API, and `@adv/jobs`'s
 * `enqueue` is mocked so this test can capture the exact payload `publish_due_posts` hands to
 * `publish_post` and feed it to `handlePublishPost` directly (no pg-boss worker loop needed). Kept
 * deterministic: no timers, no real network, one business torn down in `afterAll`.
 *
 * KNOWN BUG (found by this test, not a test-authoring mistake - out of qa-engineer's file scope to
 * fix, see `apps/worker/src/jobs/publish_post.ts`): `publish_due_posts` flips a claimed row to
 * `status = 'publishing'` *before* enqueueing `publish_post` (by design, see `src/jobs/README.md`).
 * But `publish_post`'s own atomic claim (lines ~143-153) only accepts a row whose status is
 * `'approved'`/`'scheduled'`, or `'publishing'` **and** older than `STALE_LEASE` (10 minutes). A row
 * that arrives already `'publishing'` from `publish_due_posts` seconds earlier is neither, so the
 * claim always loses the race and `handlePublishPost` returns without publishing - `README.md`'s own
 * step 3 ("if not already `publishing` ... claims it itself") implies the row should just proceed
 * when already `publishing`, but the code re-claims unconditionally. Net effect: every post that goes
 * through the normal `publish_due_posts -> publish_post` path gets stuck at `status = 'publishing'`
 * forever (nothing ever re-claims a fresh, non-stale `'publishing'` row). This assertion documents the
 * intended/spec'd behavior and will start passing once that claim condition is fixed.
 */
const { enqueueMock } = vi.hoisted(() => ({ enqueueMock: vi.fn() }));

vi.mock("@adv/jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@adv/jobs")>();
  return { ...actual, enqueue: enqueueMock };
});

const { eq, getDb, auditLog, metricSnapshots, platformAccounts, posts } = await import("@adv/db");
const { registerConnector } = await import("@adv/connectors");
const {
  createTestAccount,
  createTestBusiness,
  createTestCommunity,
  createTestPost,
  fakeJob,
  makeFakeConnector,
} = await import("./test-helpers.js");
const { handlePublishDuePosts } = await import("./jobs/publish_due_posts.js");
const { handlePublishPost } = await import("./jobs/publish_post.js");
const { handleFetchInsights } = await import("./jobs/fetch_insights.js");

describe("e2e chain: publish_due_posts -> publish_post -> fetch_insights", () => {
  let biz: Awaited<ReturnType<typeof createTestBusiness>>;

  beforeAll(async () => {
    biz = await createTestBusiness();
  });

  afterAll(async () => {
    await biz.cleanup();
    await getDb().$client.end({ timeout: 1 });
  });

  it("carries an owned post and a human-approved community post through the whole chain", async () => {
    const publish = vi.fn(async (_account: unknown, post: { id: string }) => ({
      externalId: `ext-${post.id}`,
      url: `https://fake.test/posts/${post.id}`,
    }));
    const fetchInsights = vi.fn(
      async (_account: unknown, _since: string, knownPosts: Array<{ id: string; externalId: string }>) => [
        { metric: "followers" as const, value: 500, capturedAt: new Date().toISOString() },
        ...knownPosts.map((p) => ({
          metric: "likes" as const,
          value: 7,
          capturedAt: new Date().toISOString(),
          externalPostId: p.externalId,
        })),
      ],
    );
    registerConnector(makeFakeConnector({ publish, fetchInsights }));

    const account = await createTestAccount(biz.businessId);
    const community = await createTestCommunity(biz.businessId);

    const ownedPost = await createTestPost(biz.businessId, account.id, {
      status: "approved",
      scheduledAt: new Date(Date.now() - 60_000),
    });
    const communityPost = await createTestPost(biz.businessId, account.id, {
      communityId: community.id,
      status: "awaiting_approval",
      scheduledAt: new Date(Date.now() - 60_000),
    });

    const db = getDb();

    // ---- step 1: publish_due_posts claims only the owned, approved, due post ----
    enqueueMock.mockClear();
    await handlePublishDuePosts([fakeJob({})]);

    const [claimedOwned] = await db.select().from(posts).where(eq(posts.id, ownedPost.id));
    const [untouchedCommunity] = await db.select().from(posts).where(eq(posts.id, communityPost.id));
    expect(claimedOwned?.status).toBe("publishing");
    expect(untouchedCommunity?.status).toBe("awaiting_approval");

    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const [jobName, payload, opts] = enqueueMock.mock.calls[0] as [
      string,
      { postId: string },
      { singletonKey?: string },
    ];
    expect(jobName).toBe("publish_post");
    expect(payload.postId).toBe(ownedPost.id);
    expect(opts?.singletonKey).toBe(ownedPost.id);

    // ---- step 2: run publish_post with the exact payload publish_due_posts enqueued ----
    await handlePublishPost([fakeJob(payload)]);

    const [publishedOwned] = await db.select().from(posts).where(eq(posts.id, ownedPost.id));
    expect(publishedOwned?.status).toBe("published");
    expect(publishedOwned?.externalId).toBe(`ext-${ownedPost.id}`);
    expect(publishedOwned?.externalUrl).toBe(`https://fake.test/posts/${ownedPost.id}`);
    expect(publishedOwned?.publishedAt).toBeInstanceOf(Date);

    const publishedAudits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "publish_post.published"));
    expect(
      publishedAudits.some((a) => (a.payload as { postId?: string } | null)?.postId === ownedPost.id),
    ).toBe(true);

    // ---- step 3: idempotent re-run - the connector is not called a second time ----
    await handlePublishPost([fakeJob(payload)]);
    expect(publish).toHaveBeenCalledTimes(1);
    const [stillPublishedOwned] = await db.select().from(posts).where(eq(posts.id, ownedPost.id));
    expect(stillPublishedOwned?.status).toBe("published");

    // ---- step 4: a human approves the community post, then it goes through the same chain ----
    await db
      .update(posts)
      .set({ status: "approved", approvedBy: biz.userId, scheduledAt: new Date(Date.now() - 60_000) })
      .where(eq(posts.id, communityPost.id));

    enqueueMock.mockClear();
    await handlePublishDuePosts([fakeJob({})]);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const [, communityPayload] = enqueueMock.mock.calls[0] as [string, { postId: string }];
    expect(communityPayload.postId).toBe(communityPost.id);

    await handlePublishPost([fakeJob(communityPayload)]);
    const [publishedCommunity] = await db.select().from(posts).where(eq(posts.id, communityPost.id));
    expect(publishedCommunity?.status).toBe("published");
    expect(publishedCommunity?.externalId).toBe(`ext-${communityPost.id}`);
    expect(publish).toHaveBeenCalledTimes(2);

    // ---- step 5: fetch_insights records account-level and per-post metrics ----
    await handleFetchInsights([fakeJob({ businessId: biz.businessId })]);
    expect(fetchInsights).toHaveBeenCalledTimes(1);

    const snapshots = await db
      .select()
      .from(metricSnapshots)
      .where(eq(metricSnapshots.accountId, account.id));

    const followerSnap = snapshots.find((s) => s.metric === "followers");
    expect(followerSnap).toBeTruthy();
    expect(Number(followerSnap?.value)).toBe(500);
    expect(followerSnap?.postId).toBeNull();

    const likeSnaps = snapshots.filter((s) => s.metric === "likes");
    expect(likeSnaps).toHaveLength(2);
    expect(likeSnaps.map((s) => s.postId).sort()).toEqual([ownedPost.id, communityPost.id].sort());

    const [accountRow] = await db.select().from(platformAccounts).where(eq(platformAccounts.id, account.id));
    expect(accountRow?.lastSyncedAt).toBeInstanceOf(Date);
  });
});
