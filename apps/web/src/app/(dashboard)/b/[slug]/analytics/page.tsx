import { BarChart3 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { getBusinessBySlug } from "@/lib/data/businesses";
import { requireUser } from "@/lib/session";

export default async function AnalyticsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  await getBusinessBySlug(user.id, slug);

  return (
    <div>
      <PageHeader title="Analytics" description="Cross-platform performance, trends and comparisons." />
      <EmptyState
        icon={BarChart3}
        title="Coming in a later phase"
        description="Once metric_snapshots has enough history, this page will chart reach, engagement and follower growth across every connected platform."
      />
    </div>
  );
}
