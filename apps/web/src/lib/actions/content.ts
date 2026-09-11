"use server";

import { auditLog, eq, getDb, inArray, posts } from "@adv/db";
import { enqueue } from "@adv/jobs";
import { PLATFORMS, type PostStatus } from "@adv/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getBusinessById } from "@/lib/data/businesses";
import { getPost } from "@/lib/data/posts";
import { requireUser } from "@/lib/session";

async function assertOwnership(businessId: string) {
  const user = await requireUser();
  const business = await getBusinessById(user.id, businessId);
  if (!business) throw new Error("Not found");
  return business;
}

async function assertPostOwnership(postId: string) {
  const user = await requireUser();
  const post = await getPost(postId);
  if (!post) throw new Error("Post not found");
  const business = await getBusinessById(user.id, post.businessId);
  if (!business) throw new Error("Not found");
  return { post, business, user };
}

/** One `audit_log` row for a human decision on a post (approvals are the compliance-relevant ones). */
async function auditPostAction(
  businessId: string,
  userId: string,
  action: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await getDb()
      .insert(auditLog)
      .values({
        businessId,
        actor: `user:${userId}`,
        action,
        target: typeof payload.postId === "string" ? payload.postId : null,
        payload,
      });
  } catch (err) {
    console.error("[audit_log] failed to write", { action, err });
  }
}

export async function generateContentBatchAction(businessId: string, slug: string): Promise<void> {
  await assertOwnership(businessId);
  await enqueue("generate_content_batch", { businessId, days: 7 });
  revalidatePath(`/b/${slug}/content`);
}

/**
 * Queues an immediate publish.
 *
 * Only a post the user has already approved (or one the scheduler is about to pick up) may jump the
 * queue. A `draft` is allowed as an implicit approve-and-publish, but only on an account we own:
 * posting into a community we do not own always requires an explicit approval first (CLAUDE.md).
 * The job carries `singletonKey: postId` so double-clicking cannot enqueue two publishes.
 */
export async function publishNowAction(postId: string): Promise<void> {
  const { post, business, user } = await assertPostOwnership(postId);

  if (post.status === "published") throw new Error("This post is already published.");

  const isDraft = post.status === "draft";
  if (!isDraft && post.status !== "approved" && post.status !== "scheduled") {
    throw new Error(`A ${post.status} post cannot be published directly.`);
  }
  if (isDraft) {
    if (post.communityId) {
      throw new Error("Community posts must be approved before publishing.");
    }
    const db = getDb();
    await db
      .update(posts)
      .set({ status: "approved", approvedBy: user.id, approvedAt: new Date() })
      .where(eq(posts.id, postId));
    await auditPostAction(business.id, user.id, "post.approved", {
      postId,
      platform: post.platform,
      via: "publish_now",
    });
  }

  await enqueue("publish_post", { postId }, { singletonKey: postId });
  await auditPostAction(business.id, user.id, "post.publish_now", { postId, platform: post.platform });
  revalidatePath(`/b/${business.slug}/content`);
}

export async function approvePostAction(postId: string): Promise<void> {
  const { post, business, user } = await assertPostOwnership(postId);
  if (post.status === "published") throw new Error("This post is already published.");
  const db = getDb();
  await db
    .update(posts)
    .set({ status: "approved", approvedBy: user.id, approvedAt: new Date() })
    .where(eq(posts.id, postId));
  await auditPostAction(business.id, user.id, "post.approved", {
    postId,
    platform: post.platform,
    previousStatus: post.status,
  });
  revalidatePath(`/b/${business.slug}/content`);
}

export async function rejectPostAction(postId: string): Promise<void> {
  const { post, business, user } = await assertPostOwnership(postId);
  const db = getDb();
  await db
    .update(posts)
    .set({ status: "rejected", approvedBy: null, approvedAt: null })
    .where(eq(posts.id, postId));
  await auditPostAction(business.id, user.id, "post.rejected", {
    postId,
    platform: post.platform,
    previousStatus: post.status,
  });
  revalidatePath(`/b/${business.slug}/content`);
}

export async function bulkApprovePostsAction(postIds: string[]): Promise<void> {
  const user = await requireUser();
  const db = getDb();
  const owned: Array<{ id: string; businessId: string; platform: string; status: PostStatus }> = [];
  for (const id of postIds) {
    const post = await getPost(id);
    if (!post || post.status === "published") continue;
    const business = await getBusinessById(user.id, post.businessId);
    if (business) {
      owned.push({ id, businessId: post.businessId, platform: post.platform, status: post.status });
    }
  }
  if (owned.length === 0) return;

  await db
    .update(posts)
    .set({ status: "approved", approvedBy: user.id, approvedAt: new Date() })
    .where(
      inArray(
        posts.id,
        owned.map((p) => p.id),
      ),
    );
  for (const p of owned) {
    await auditPostAction(p.businessId, user.id, "post.approved", {
      postId: p.id,
      platform: p.platform,
      previousStatus: p.status,
      via: "bulk",
    });
  }
  revalidatePath("/", "layout");
}

const EditBodySchema = z.object({
  postId: z.string().uuid(),
  body: z.string().trim().min(1, "The post body cannot be empty.").max(64_000),
});

/** Statuses whose approval is invalidated by an edit - the edited text must be re-approved. */
const RESETS_TO_DRAFT = new Set<PostStatus>(["approved", "scheduled"]);

/**
 * Edits a post's body.
 *
 * An edit to an already-approved or scheduled post silently changing what gets published would
 * defeat the approval gate, so the post drops back to `draft` with its compliance verdict cleared.
 * `awaiting_approval` stays where it is, `draft` stays a draft, and a `rejected` post can be fixed
 * but stays rejected (it has to be approved explicitly to re-enter the queue). Published or
 * in-flight posts cannot be edited at all.
 */
export async function editPostBodyAction(postId: string, body: string): Promise<void> {
  const parsed = EditBodySchema.safeParse({ postId, body });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }
  const { post, business, user } = await assertPostOwnership(parsed.data.postId);

  if (post.status === "published" || post.status === "publishing") {
    throw new Error(`A ${post.status} post can no longer be edited.`);
  }

  const maxChars = PLATFORMS[post.platform].maxChars;
  if (parsed.data.body.length > maxChars) {
    throw new Error(
      `${post.platform} allows at most ${maxChars} characters (got ${parsed.data.body.length}).`,
    );
  }

  const resets = RESETS_TO_DRAFT.has(post.status);
  const db = getDb();
  await db
    .update(posts)
    .set({
      body: parsed.data.body,
      ...(resets ? { status: "draft" as const, compliance: null, approvedBy: null, approvedAt: null } : {}),
    })
    .where(eq(posts.id, parsed.data.postId));

  if (resets) {
    await auditPostAction(business.id, user.id, "post.edited_reset_to_draft", {
      postId: parsed.data.postId,
      previousStatus: post.status,
    });
  }
  revalidatePath(`/b/${business.slug}/content`);
}

/** Statuses that may still be moved on the calendar. */
const RESCHEDULABLE = new Set<PostStatus>(["draft", "approved", "scheduled", "failed"]);

/**
 * Moves a post's `scheduledAt`. A draft stays a draft (rescheduling is not an approval); anything
 * else that is reschedulable becomes `scheduled` so `publish_due_posts` picks it up at the new time.
 */
export async function reschedulePostAction(postId: string, scheduledAt: string): Promise<void> {
  const { post, business } = await assertPostOwnership(postId);

  if (!RESCHEDULABLE.has(post.status)) {
    throw new Error(`A ${post.status} post cannot be rescheduled.`);
  }

  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) {
    throw new Error("That is not a valid date and time.");
  }
  const maxFuture = Date.now() + 365 * 24 * 60 * 60 * 1000;
  if (when.getTime() > maxFuture) {
    throw new Error("Pick a time within the next year.");
  }

  const db = getDb();
  await db
    .update(posts)
    .set({ scheduledAt: when, ...(post.status === "draft" ? {} : { status: "scheduled" as const }) })
    .where(eq(posts.id, postId));
  revalidatePath(`/b/${business.slug}/content`);
}
