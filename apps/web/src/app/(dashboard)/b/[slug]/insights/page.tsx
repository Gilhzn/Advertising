import { Lightbulb } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { RecommendationActions } from "@/components/insights/recommendation-actions";
import { PageHeader } from "@/components/page-header";
import { RecommendationStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBusinessBySlug } from "@/lib/data/businesses";
import { listInsights, listRecommendations } from "@/lib/data/insights";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/utils";

export default async function InsightsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const business = await getBusinessBySlug(user.id, slug);
  const [insights, recommendations] = await Promise.all([
    listInsights(business.id),
    listRecommendations(business.id),
  ]);

  return (
    <div>
      <PageHeader
        title="Insights"
        description="What the analyst learned, and what it recommends doing next."
      />

      {insights.length === 0 && recommendations.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="No insights yet"
          description="The analyst runs every 6 hours once there is enough published content and metrics to learn from."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {recommendations.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col divide-y divide-border">
                  {recommendations.map((r) => (
                    <li key={r.id} className="flex flex-col gap-2 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{r.type}</Badge>
                          <p className="font-medium">{r.title}</p>
                        </div>
                        <RecommendationStatusBadge status={r.status} />
                      </div>
                      <p className="text-sm text-muted-foreground">{r.detail}</p>
                      {r.evidence ? (
                        <p className="text-xs text-muted-foreground">Evidence: {r.evidence}</p>
                      ) : null}
                      <div className="flex items-center justify-between">
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          {r.effort ? <span>Effort: {r.effort}</span> : null}
                          {r.expectedImpact ? <span>Impact: {r.expectedImpact}</span> : null}
                          {r.prUrl ? (
                            <a href={r.prUrl} target="_blank" rel="noreferrer" className="underline">
                              View PR
                            </a>
                          ) : null}
                        </div>
                        <RecommendationActions id={r.id} status={r.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {insights.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Analyst summaries</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col divide-y divide-border">
                  {insights.map((insight) => {
                    const data = insight.data as {
                      summary?: string;
                      findings?: Array<{ title: string; evidence: string; confidence: string }>;
                    };
                    return (
                      <li key={insight.id} className="py-3">
                        <p className="text-xs text-muted-foreground">
                          {formatDate(insight.periodStart)} - {formatDate(insight.periodEnd)}
                        </p>
                        <p className="mt-1 text-sm">{data.summary}</p>
                        {data.findings && data.findings.length > 0 ? (
                          <ul className="mt-2 flex flex-col gap-1">
                            {data.findings.map((f) => (
                              <li key={f.title} className="text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">{f.title}</span> - {f.evidence}{" "}
                                ({f.confidence} confidence)
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
