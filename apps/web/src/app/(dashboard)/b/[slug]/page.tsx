import { CheckCircle2, CircleDollarSign, Inbox, Rocket, Sparkles } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ScheduleStrip } from "@/components/schedule-strip";
import { RecommendationStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { countConnected } from "@/lib/data/accounts";
import { monthlyAiSpend } from "@/lib/data/agent-runs";
import { getBusinessBySlug } from "@/lib/data/businesses";
import { listRecommendations } from "@/lib/data/insights";
import { countAwaitingApproval, countPostsByStatus, scheduledCountsByDay } from "@/lib/data/posts";
import { getLatestBrandKit, getLatestChannelPlan } from "@/lib/data/strategy";
import { requireUser } from "@/lib/session";
import { formatUsd } from "@/lib/utils";

export default async function BusinessOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const business = await getBusinessBySlug(user.id, slug);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    brandKit,
    channelPlan,
    accounts,
    awaiting,
    scheduled,
    published,
    spend,
    recommendations,
    scheduledDays,
  ] = await Promise.all([
    getLatestBrandKit(business.id),
    getLatestChannelPlan(business.id),
    countConnected(business.id),
    countAwaitingApproval(business.id),
    countPostsByStatus(business.id, ["scheduled", "approved"]),
    countPostsByStatus(business.id, ["published"]),
    monthlyAiSpend(business.id, monthStart),
    listRecommendations(business.id, 5),
    scheduledCountsByDay([business.id], 7),
  ]);

  const strategyReady = Boolean(channelPlan);

  return (
    <div>
      <PageHeader title={business.name} description={business.description} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Sparkles}
          label="Strategy"
          value={strategyReady ? (brandKit?.approvedAt ? "Approved" : "Ready for review") : "Not started"}
          href={`/b/${slug}/strategy`}
        />
        <StatCard
          icon={Rocket}
          label="Accounts connected"
          value={`${accounts.connected} / ${accounts.total || 0}`}
          href={`/b/${slug}/setup`}
        />
        <StatCard
          icon={CheckCircle2}
          label="Scheduled / published"
          value={`${scheduled} / ${published}`}
          href={`/b/${slug}/content`}
        />
        <StatCard
          icon={Inbox}
          label="Awaiting approval"
          value={String(awaiting)}
          href={`/b/${slug}/content`}
        />
      </div>

      <div className="mt-4">
        <ScheduleStrip days={scheduledDays} />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CircleDollarSign className="size-4" />
            AI spend this month
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{formatUsd(spend)}</p>
          <p className="text-sm text-muted-foreground">
            Budget: {formatUsd(business.aiMonthlyBudgetUsd)} / month
          </p>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Latest recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          {recommendations.length === 0 ? (
            <EmptyState
              title="No recommendations yet"
              description="The analyst posts marketing and product recommendations here once it has enough data."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {recommendations.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.title}</p>
                    <p className="truncate text-sm text-muted-foreground">{r.detail}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline">{r.type}</Badge>
                    <RecommendationStatusBadge status={r.status} />
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

function StatCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:bg-accent/50">
        <CardContent className="flex items-center gap-3 pt-6">
          <Icon className="size-5 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold">{value}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
