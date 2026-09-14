import { type SdkKind, snippetFor } from "@adv/analytics";
import { AlertTriangle, ExternalLink, Flame, LayoutGrid, MousePointerClick } from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { HotScreensChart } from "@/components/product/hot-screens-chart";
import { PostHogSetupCard } from "@/components/product/posthog-setup-card";
import { RetentionChart } from "@/components/product/retention-chart";
import { SnippetTabs } from "@/components/product/snippet-tabs";
import { SyncNowButton } from "@/components/product/sync-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBusinessBySlug } from "@/lib/data/businesses";
import { getPostForBusiness } from "@/lib/data/posts";
import { getProductAnalyticsSummary } from "@/lib/data/product-analytics";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/utils";

const SDK_KINDS: SdkKind[] = ["web", "react", "nextjs", "ios", "android", "react_native", "flutter", "unity"];

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const business = await getBusinessBySlug(user.id, slug);

  if (!business.posthogProjectToken) {
    return (
      <div>
        <PageHeader title="Product" description="In-app analytics: hot screens, heatmaps and funnels." />
        <PostHogSetupCard
          businessId={business.id}
          slug={slug}
          orgConfigured={Boolean(process.env.POSTHOG_ORG_ID)}
        />
      </div>
    );
  }

  const host = process.env.POSTHOG_HOST ?? "https://us.posthog.com";
  const snippets = SDK_KINDS.map((kind) => snippetFor(kind, business.posthogProjectToken as string, host));
  const summary = await getProductAnalyticsSummary(business.id);

  const utmWithPosts = await Promise.all(
    (summary.utmAttribution ?? []).map(async (row) => ({
      row,
      post: row.utmCampaign ? await getPostForBusiness(business.id, row.utmCampaign) : null,
    })),
  );

  const heatmapProjectUrl = business.posthogProjectId ? `${host}/project/${business.posthogProjectId}` : host;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Product"
        description="In-app analytics: hot screens, heatmaps and funnels."
        actions={<SyncNowButton businessId={business.id} slug={slug} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>SDK install snippets</CardTitle>
          <p className="text-xs text-muted-foreground">
            Autocapture, heatmaps and session replay for {business.name}'s app.
          </p>
        </CardHeader>
        <CardContent>
          <SnippetTabs snippets={snippets} />
        </CardContent>
      </Card>

      {!summary.hasAnySnapshot ? (
        <EmptyState
          icon={LayoutGrid}
          title="No analytics yet"
          description="Install the snippet above, then click Sync now (or wait for the nightly sync) to pull the first snapshot."
        />
      ) : (
        <>
          <ChartCard
            title="Overview"
            isEmpty={!summary.overview}
            emptyDescription="No overview snapshot yet."
          >
            {summary.overview ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Users" value={String(summary.overview.users)} />
                <StatTile label="Sessions" value={String(summary.overview.sessions)} />
                <StatTile
                  label="Avg session duration"
                  value={
                    summary.overview.avgSessionDurationSeconds !== null
                      ? `${Math.round(summary.overview.avgSessionDurationSeconds)}s`
                      : "-"
                  }
                />
                <StatTile
                  label="Bounce rate"
                  value={
                    summary.overview.bounceRate !== null
                      ? `${Math.round(summary.overview.bounceRate * 100)}%`
                      : "-"
                  }
                />
              </div>
            ) : null}
          </ChartCard>

          <ChartCard
            title="Hot screens (unique users)"
            description="Top screens by unique visitors, with total time on screen."
            isEmpty={!summary.topScreens || summary.topScreens.length === 0}
            emptyDescription="No screen data for this period yet."
          >
            {summary.topScreens ? <HotScreensChart rows={summary.topScreens} /> : null}
          </ChartCard>

          <ChartCard
            title="Hot elements"
            description="Most-clicked elements across the app."
            isEmpty={!summary.topElements || summary.topElements.length === 0}
          >
            {summary.topElements && summary.topElements.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Element</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">Unique users</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.topElements.slice(0, 15).map((el, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: PostHog aggregation rows have no stable id
                    <TableRow key={`${el.element}-${el.url}-${i}`}>
                      <TableCell className="max-w-64 truncate font-mono text-xs">{el.element}</TableCell>
                      <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
                        {el.url ?? "-"}
                      </TableCell>
                      <TableCell className="text-right">{el.clicks}</TableCell>
                      <TableCell className="text-right">{el.uniqueUsers}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </ChartCard>

          <ChartCard
            title="Rage clicks"
            description="Repeated clicks that suggest user frustration."
            isEmpty={!summary.rageClicks || summary.rageClicks.length === 0}
            emptyDescription="No rage clicks detected — good sign."
          >
            {summary.rageClicks && summary.rageClicks.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border">
                {summary.rageClicks.slice(0, 10).map((rc, i) => (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: PostHog aggregation rows have no stable id
                    key={`${rc.url}-${rc.element}-${i}`}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Flame className="size-4 shrink-0 text-warning" />
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs">{rc.element ?? "(unknown element)"}</p>
                        <p className="truncate text-xs text-muted-foreground">{rc.url ?? ""}</p>
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {rc.rageClicks} clicks · {rc.uniqueUsers} users
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </ChartCard>

          <ChartCard
            title="Retention (%)"
            description="Share of each cohort still active on later days."
            isEmpty={!summary.retention || summary.retention.length === 0}
          >
            {summary.retention && summary.retention.length > 0 ? (
              <RetentionChart rows={summary.retention} />
            ) : null}
          </ChartCard>

          <ChartCard
            title="UTM attribution"
            description="Traffic driven by social posts, linked back to the originating post."
            isEmpty={utmWithPosts.length === 0}
          >
            {utmWithPosts.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Medium</TableHead>
                    <TableHead>Post</TableHead>
                    <TableHead className="text-right">Pageviews</TableHead>
                    <TableHead className="text-right">Unique users</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {utmWithPosts.map(({ row, post }, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: PostHog aggregation rows have no stable id
                    <TableRow key={`${row.utmSource}-${row.utmCampaign}-${i}`}>
                      <TableCell>{row.utmSource ?? "-"}</TableCell>
                      <TableCell>{row.utmMedium ?? "-"}</TableCell>
                      <TableCell className="max-w-56 truncate">
                        {post ? (
                          <span className="inline-flex items-center gap-1">
                            {post.title ?? post.body.slice(0, 40)}
                            {post.externalUrl ? (
                              <a href={post.externalUrl} target="_blank" rel="noreferrer">
                                <ExternalLink className="size-3.5 text-muted-foreground" />
                              </a>
                            ) : null}
                          </span>
                        ) : (
                          (row.utmCampaign ?? "-")
                        )}
                      </TableCell>
                      <TableCell className="text-right">{row.pageviews}</TableCell>
                      <TableCell className="text-right">{row.uniqueUsers}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </ChartCard>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MousePointerClick className="size-4" />
                Heatmaps
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!summary.heatmapRef?.available ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="size-4" />
                  {summary.heatmapRef?.error ?? "Heatmaps aren't available yet."}
                </div>
              ) : summary.heatmapRef.heatmaps && summary.heatmapRef.heatmaps.length > 0 ? (
                <ul className="flex flex-col divide-y divide-border">
                  {summary.heatmapRef.heatmaps.map((h, i) => (
                    <li
                      key={typeof h.url === "string" ? h.url : `heatmap-${i}`}
                      className="flex items-center justify-between gap-2 py-2 text-sm"
                    >
                      <span className="truncate">
                        {typeof h.url === "string" ? h.url : `Heatmap ${i + 1}`}
                      </span>
                      <a
                        href={heatmapProjectUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex shrink-0 items-center gap-1 text-xs underline"
                      >
                        View in PostHog <ExternalLink className="size-3" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <a
                  href={heatmapProjectUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-sm underline"
                >
                  Open heatmaps in PostHog <ExternalLink className="size-3.5" />
                </a>
              )}
            </CardContent>
          </Card>

          {summary.periodStart && summary.periodEnd ? (
            <p className="text-xs text-muted-foreground">
              Period: {formatDate(summary.periodStart)} – {formatDate(summary.periodEnd)}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
