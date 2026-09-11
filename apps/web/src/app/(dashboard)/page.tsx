import { Building2, CheckCircle2, Inbox, Plus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ScheduleStrip } from "@/components/schedule-strip";
import { AgentRunStatusBadge, PostStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listRecentRunsForBusinesses } from "@/lib/data/agent-runs";
import { listBusinesses } from "@/lib/data/businesses";
import { listAwaitingApproval, scheduledCountsByDay } from "@/lib/data/posts";
import { requireUser } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";

export default async function OverviewPage() {
  const user = await requireUser();
  const businesses = await listBusinesses(user.id);
  const businessById = new Map(businesses.map((b) => [b.id, b]));
  const businessIds = businesses.map((b) => b.id);

  const [awaiting, recentRuns, scheduledDays] = await Promise.all([
    listAwaitingApproval(businessIds, 10),
    listRecentRunsForBusinesses(businessIds, 10),
    scheduledCountsByDay(businessIds, 7),
  ]);

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Every business you run, in one place."
        actions={
          <Button asChild>
            <Link href="/businesses/new">
              <Plus className="size-4" />
              New business
            </Link>
          </Button>
        }
      />

      <div className="mb-4">
        <ScheduleStrip days={scheduledDays} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-4" />
              Businesses
            </CardTitle>
          </CardHeader>
          <CardContent>
            {businesses.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No businesses yet"
                description="Create your first business to generate a strategy and start publishing."
                action={
                  <Button asChild size="sm">
                    <Link href="/businesses/new">Create a business</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {businesses.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link href={`/b/${b.slug}`} className="font-medium hover:underline">
                        {b.name}
                      </Link>
                      <p className="truncate text-sm text-muted-foreground">{b.description}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {b.category}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="size-4" />
              Awaiting approval
            </CardTitle>
          </CardHeader>
          <CardContent>
            {awaiting.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="All caught up"
                description="Nothing needs your review right now."
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {awaiting.map((post) => {
                  const business = businessById.get(post.businessId);
                  return (
                    <li key={post.id} className="flex flex-col gap-1 rounded-md border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={business ? `/b/${business.slug}/content` : "#"}
                          className="text-sm font-medium hover:underline"
                        >
                          {business?.name ?? "Unknown business"}
                        </Link>
                        <PostStatusBadge status={post.status} />
                      </div>
                      <p className="line-clamp-2 text-sm text-muted-foreground">{post.body}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Recent agent runs</CardTitle>
        </CardHeader>
        <CardContent>
          {recentRuns.length === 0 ? (
            <EmptyState
              title="No agent runs yet"
              description="Runs appear here once a business kicks off discovery, content generation, or analysis."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {recentRuns.map((run) => (
                <li key={run.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{businessById.get(run.businessId ?? "")?.name ?? "-"}</span>
                    <span className="ml-2 text-muted-foreground">
                      {run.jobName} · {run.agent}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-muted-foreground">{formatDateTime(run.startedAt)}</span>
                    <AgentRunStatusBadge status={run.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
