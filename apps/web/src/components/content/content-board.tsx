"use client";

import { PLATFORM_IDS } from "@adv/shared";
import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { PostDrawer } from "@/components/content/post-drawer";
import { EmptyState } from "@/components/empty-state";
import { platformLabel } from "@/components/platform-badge";
import { PostStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { bulkApprovePostsAction } from "@/lib/actions/content";
import type { Post } from "@/lib/data/posts";
import { cn } from "@/lib/utils";

const STATUSES = [
  "draft",
  "awaiting_approval",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "rejected",
];
const LANGUAGES = ["en", "he"];

export function ContentBoard({ posts, view }: { posts: Post[]; view: "week" | "list" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Post | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  const week = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, []);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={view} onValueChange={(v) => setParam("view", v)}>
          <TabsList>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="list">List</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select
          className="w-40"
          defaultValue={searchParams.get("platform") ?? ""}
          onChange={(e) => setParam("platform", e.target.value)}
        >
          <option value="">All platforms</option>
          {PLATFORM_IDS.map((p) => (
            <option key={p} value={p}>
              {platformLabel(p)}
            </option>
          ))}
        </Select>

        <Select
          className="w-40"
          defaultValue={searchParams.get("status") ?? ""}
          onChange={(e) => setParam("status", e.target.value)}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </Select>

        <Select
          className="w-32"
          defaultValue={searchParams.get("language") ?? ""}
          onChange={(e) => setParam("language", e.target.value)}
        >
          <option value="">All languages</option>
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>

        {checked.size > 0 ? (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await bulkApprovePostsAction([...checked]);
                setChecked(new Set());
                toast.success(`${checked.size} post(s) approved`);
              })
            }
          >
            Approve selected ({checked.size})
          </Button>
        ) : null}
      </div>

      {posts.length === 0 ? (
        <EmptyState
          title="No posts yet"
          description="Generate the next 7 days of content, or wait for the scheduled batch job to run."
        />
      ) : view === "week" ? (
        <div className="grid gap-2 overflow-x-auto md:grid-cols-7">
          {week.map((day) => {
            const dayPosts = posts.filter((p) => p.scheduledAt && isSameDay(new Date(p.scheduledAt), day));
            return (
              <div key={day.toISOString()} className="min-w-40 rounded-md border border-border p-2">
                <p className="mb-2 text-xs font-medium text-muted-foreground">{format(day, "EEE d MMM")}</p>
                <div className="flex flex-col gap-2">
                  {dayPosts.map((post) => (
                    <button
                      type="button"
                      key={post.id}
                      onClick={() => setSelected(post)}
                      className="flex flex-col gap-1 rounded-md border border-border p-2 text-left text-xs hover:bg-accent"
                    >
                      <span className="font-medium">{platformLabel(post.platform)}</span>
                      <span className="line-clamp-2 text-muted-foreground">{post.body}</span>
                      <PostStatusBadge status={post.status} />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {posts.map((post) => (
            <li
              key={post.id}
              className={cn("flex items-center gap-3 p-3", checked.has(post.id) && "bg-accent/50")}
            >
              <Checkbox checked={checked.has(post.id)} onCheckedChange={() => toggle(post.id)} />
              <button type="button" onClick={() => setSelected(post)} className="min-w-0 flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{platformLabel(post.platform)}</span>
                  <span className="text-xs text-muted-foreground">{post.language}</span>
                  {post.scheduledAt ? (
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(post.scheduledAt), "d MMM HH:mm")}
                    </span>
                  ) : null}
                </div>
                <p className="line-clamp-1 text-sm text-muted-foreground">{post.body}</p>
              </button>
              <PostStatusBadge status={post.status} />
            </li>
          ))}
        </ul>
      )}

      <PostDrawer post={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
