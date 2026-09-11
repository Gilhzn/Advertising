"use client";

import type { PlatformId } from "@adv/shared";
import Image from "next/image";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PlatformBadge } from "@/components/platform-badge";
import { PostStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  approvePostAction,
  editPostBodyAction,
  publishNowAction,
  rejectPostAction,
  reschedulePostAction,
} from "@/lib/actions/content";
import type { Post } from "@/lib/data/posts";
import { formatDateTime } from "@/lib/utils";

type Compliance = {
  verdict: "pass" | "fix" | "block";
  issues: Array<{ rule: string; severity: string; detail: string }>;
} | null;

export function PostDrawer({ post, onClose }: { post: Post | null; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState(post?.body ?? "");
  const [scheduledAt, setScheduledAt] = useState(
    post?.scheduledAt ? new Date(post.scheduledAt).toISOString().slice(0, 16) : "",
  );

  if (!post) return null;
  const compliance = (post.compliance as Compliance) ?? null;

  return (
    <Sheet open={Boolean(post)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <div className="flex items-center justify-between gap-2 pr-8">
          <SheetTitle>Post details</SheetTitle>
          <PostStatusBadge status={post.status} />
        </div>
        <SheetDescription>
          <PlatformBadge id={post.platform as PlatformId} /> · {post.language}
        </SheetDescription>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="drawer-body">Body</Label>
            <Textarea id="drawer-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>

          {post.hashtags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {post.hashtags.map((h) => (
                <span key={h} className="text-sm text-muted-foreground">
                  {h}
                </span>
              ))}
            </div>
          ) : null}

          {post.linkUrl ? (
            <p className="text-sm">
              <span className="text-muted-foreground">Link: </span>
              <a href={post.linkUrl} target="_blank" rel="noreferrer" className="underline">
                {post.linkUrl}
              </a>
            </p>
          ) : null}

          {post.media.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {post.media.map((m) => {
                const media = m as { url?: string; kind?: string };
                if (!media.url) return null;
                return (
                  <div key={media.url} className="relative aspect-square w-full overflow-hidden rounded-md">
                    <Image src={media.url} alt="" fill unoptimized className="object-cover" sizes="200px" />
                  </div>
                );
              })}
            </div>
          ) : null}

          {post.rationale ? (
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Rationale</p>
              {post.rationale}
            </div>
          ) : null}

          {compliance ? (
            <div
              className={
                compliance.verdict === "pass"
                  ? "rounded-md bg-success/10 px-3 py-2 text-sm text-success"
                  : compliance.verdict === "fix"
                    ? "rounded-md bg-warning/10 px-3 py-2 text-sm text-warning"
                    : "rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              }
            >
              <p className="font-medium">Compliance: {compliance.verdict}</p>
              {compliance.issues.map((issue) => (
                <p key={issue.rule} className="mt-1">
                  [{issue.severity}] {issue.rule}: {issue.detail}
                </p>
              ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="drawer-schedule">Scheduled at</Label>
            <Input
              id="drawer-schedule"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await approvePostAction(post.id);
                  toast.success("Post approved");
                })
              }
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await rejectPostAction(post.id);
                  toast.success("Post rejected");
                })
              }
            >
              Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending || body === post.body}
              onClick={() =>
                startTransition(async () => {
                  await editPostBodyAction(post.id, body);
                  toast.success("Body updated");
                })
              }
            >
              Save edits
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending || !scheduledAt}
              onClick={() =>
                startTransition(async () => {
                  await reschedulePostAction(post.id, new Date(scheduledAt).toISOString());
                  toast.success("Rescheduled");
                })
              }
            >
              Reschedule
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await publishNowAction(post.id);
                  toast.success("Publish queued");
                })
              }
            >
              Publish now
            </Button>
          </div>

          {post.lastError ? <p className="text-sm text-destructive">Last error: {post.lastError}</p> : null}
          <p className="text-xs text-muted-foreground">Created {formatDateTime(post.createdAt)}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
