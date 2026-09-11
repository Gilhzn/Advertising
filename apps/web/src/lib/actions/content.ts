"use server";

import { eq, getDb, inArray, posts } from "@adv/db";
import { enqueue } from "@adv/jobs";
import { revalidatePath } from "next/cache";
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
  return { post, business };
}

export async function generateContentBatchAction(businessId: string, slug: string): Promise<void> {
  await assertOwnership(businessId);
  await enqueue("generate_content_batch", { businessId, days: 7 });
  revalidatePath(`/b/${slug}/content`);
}

export async function publishNowAction(postId: string): Promise<void> {
  const { business } = await assertPostOwnership(postId);
  await enqueue("publish_post", { postId });
  revalidatePath(`/b/${business.slug}/content`);
}

export async function approvePostAction(postId: string): Promise<void> {
  const { business } = await assertPostOwnership(postId);
  const db = getDb();
  await db.update(posts).set({ status: "approved" }).where(eq(posts.id, postId));
  revalidatePath(`/b/${business.slug}/content`);
}

export async function rejectPostAction(postId: string): Promise<void> {
  const { business } = await assertPostOwnership(postId);
  const db = getDb();
  await db.update(posts).set({ status: "rejected" }).where(eq(posts.id, postId));
  revalidatePath(`/b/${business.slug}/content`);
}

export async function bulkApprovePostsAction(postIds: string[]): Promise<void> {
  const user = await requireUser();
  const db = getDb();
  const owned: string[] = [];
  for (const id of postIds) {
    const post = await getPost(id);
    if (!post) continue;
    const business = await getBusinessById(user.id, post.businessId);
    if (business) owned.push(id);
  }
  if (owned.length === 0) return;
  await db.update(posts).set({ status: "approved" }).where(inArray(posts.id, owned));
  revalidatePath("/", "layout");
}

export async function editPostBodyAction(postId: string, body: string): Promise<void> {
  const { business } = await assertPostOwnership(postId);
  const db = getDb();
  await db.update(posts).set({ body }).where(eq(posts.id, postId));
  revalidatePath(`/b/${business.slug}/content`);
}

export async function reschedulePostAction(postId: string, scheduledAt: string): Promise<void> {
  const { business } = await assertPostOwnership(postId);
  const db = getDb();
  await db
    .update(posts)
    .set({ scheduledAt: new Date(scheduledAt), status: "scheduled" })
    .where(eq(posts.id, postId));
  revalidatePath(`/b/${business.slug}/content`);
}
