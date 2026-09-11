import type { PlatformId } from "@adv/shared";
import { ExternalLink } from "lucide-react";
import { BreakdownBarChart } from "@/components/analytics/breakdown-bar-chart";
import { DailyLineChart } from "@/components/analytics/daily-line-chart";
import { EngagementStackedBar } from "@/components/analytics/engagement-stacked-bar";
import { PeriodPicker } from "@/components/analytics/period-picker";
import { ChartCard } from "@/components/charts/chart-card";
import { PageHeader } from "@/components/page-header";
import { PlatformBadge, platformLabel } from "@/components/platform-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBusinessBySlug } from "@/lib/data/businesses";
import { getSocialAnalytics } from "@/lib/data/social-analytics";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/utils";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { slug } = await params;
  const { days: daysParam } = await searchParams;
  const user = await requireUser();
  const business = await getBusinessBySlug(user.id, slug);

  const days =
    daysParam === "7" || daysParam === "30" || daysParam === "90" ? (Number(daysParam) as 7 | 30 | 90) : 30;
  const analytics = await getSocialAnalytics(business.id, days);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Analytics"
        description="Cross-platform performance, trends and comparisons."
        actions={<PeriodPicker slug={slug} days={days} />}
      />

      {!analytics.hasData ? (
        <ChartCard title="Performance" isEmpty emptyDescription="No metrics recorded for this business yet.">
          <div />
        </ChartCard>
      ) : (
        <>
          <ChartCard
            title="Followers by platform"
            isEmpty={Object.keys(analytics.kpis.followers).length === 0}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Object.entries(analytics.kpis.followers).map(([platform, count]) => (
                <StatTile
                  key={platform}
                  label={platformLabel(platform as PlatformId)}
                  value={count.toLocaleString()}
                />
              ))}
            </div>
          </ChartCard>

          <ChartCard title={`Totals - last ${days} days`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Impressions" value={analytics.kpis.impressions.toLocaleString()} />
              <StatTile label="Reach (users)" value={analytics.kpis.reach.toLocaleString()} />
              <StatTile label="Views" value={analytics.kpis.views.toLocaleString()} />
              <StatTile label="Likes" value={analytics.kpis.likes.toLocaleString()} />
              <StatTile label="Comments" value={analytics.kpis.comments.toLocaleString()} />
              <StatTile label="Shares" value={analytics.kpis.shares.toLocaleString()} />
              <StatTile label="Clicks" value={analytics.kpis.clicks.toLocaleString()} />
            </div>
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Daily reach (users)"
              description="Unique users reached per day, per platform."
              isEmpty={analytics.dailyReach.length === 0}
            >
              <DailyLineChart data={analytics.dailyReach} platforms={analytics.platforms} />
            </ChartCard>
            <ChartCard
              title="Daily impressions"
              description="Impressions per day, per platform."
              isEmpty={analytics.dailyImpressions.length === 0}
            >
              <DailyLineChart data={analytics.dailyImpressions} platforms={analytics.platforms} />
            </ChartCard>
          </div>

          <ChartCard
            title="Engagement by platform"
            description="Likes, comments, shares and clicks, stacked per platform."
            isEmpty={analytics.engagementByPlatform.length === 0}
          >
            <EngagementStackedBar rows={analytics.engagementByPlatform} />
          </ChartCard>

          <ChartCard
            title="Top posts"
            description="Ranked by engagement (likes + comments + shares + clicks)."
            isEmpty={analytics.topPosts.length === 0}
          >
            {analytics.topPosts.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Post</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">Engagement</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.topPosts.map((p) => (
                    <TableRow key={p.postId}>
                      <TableCell className="max-w-64 truncate">{p.title ?? p.body.slice(0, 60)}</TableCell>
                      <TableCell>
                        <PlatformBadge id={p.platform as PlatformId} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(p.publishedAt)}</TableCell>
                      <TableCell className="text-right">{p.impressions.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{p.engagement.toLocaleString()}</TableCell>
                      <TableCell>
                        {p.externalUrl ? (
                          <a
                            href={p.externalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="size-4" />
                          </a>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard
              title="Engagement by pillar"
              isEmpty={analytics.byPillar.length === 0}
              emptyDescription="No posts with a content pillar in this period."
            >
              <BreakdownBarChart rows={analytics.byPillar} valueLabel="Engagement" />
            </ChartCard>
            <ChartCard
              title="Engagement by hour of day"
              description="UTC"
              isEmpty={analytics.byHour.length === 0}
            >
              <BreakdownBarChart
                rows={analytics.byHour.map((r) => ({ ...r, key: r.key }))}
                keyFormatter={(k) => `${k}:00`}
                valueLabel="Engagement"
              />
            </ChartCard>
            <ChartCard title="Engagement by language" isEmpty={analytics.byLanguage.length === 0}>
              <BreakdownBarChart rows={analytics.byLanguage} valueLabel="Engagement" />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
