import "../test-setup.js";

import { eq, getDb, posts } from "@adv/db";
import { getBoss, stopBoss } from "@adv/jobs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestAccount, createTestBusiness, createTestPost, fakeJob } from "../test-helpers.js";
import { handlePublishDuePosts } from "./publish_due_posts.js";

describe("publish_due_posts", () => {
  let biz: Awaited<ReturnType<typeof createTestBusiness>>;

  beforeAll(async () => {
    biz = await createTestBusiness();
  });

  afterAll(async () => {
    await biz.cleanup();
    await stopBoss();
    await getDb().$client.end({ timeout: 1 });
  });

  it("claims only approved/scheduled posts that are due, leaving others untouched", async () => {
    await getBoss(); // ensure pg-boss schema exists before the handler enqueues into it

    const account = await createTestAccount(biz.businessId);
    const due = await createTestPost(biz.businessId, account.id, {
      status: "approved",
      scheduledAt: new Date(Date.now() - 60_000),
    });
    const notYetDue = await createTestPost(biz.businessId, account.id, {
      status: "scheduled",
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const wrongStatus = await createTestPost(biz.businessId, account.id, {
      status: "draft",
      scheduledAt: new Date(Date.now() - 60_000),
    });

    await handlePublishDuePosts([fakeJob({})]);

    const db = getDb();
    const [dueRow] = await db.select().from(posts).where(eq(posts.id, due.id));
    const [notYetDueRow] = await db.select().from(posts).where(eq(posts.id, notYetDue.id));
    const [wrongStatusRow] = await db.select().from(posts).where(eq(posts.id, wrongStatus.id));

    expect(dueRow?.status).toBe("publishing");
    expect(notYetDueRow?.status).toBe("scheduled");
    expect(wrongStatusRow?.status).toBe("draft");
  });
});
