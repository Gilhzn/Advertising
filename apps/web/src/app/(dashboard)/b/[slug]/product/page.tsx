import { LayoutGrid } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { getBusinessBySlug } from "@/lib/data/businesses";
import { requireUser } from "@/lib/session";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  await getBusinessBySlug(user.id, slug);

  return (
    <div>
      <PageHeader title="Product" description="In-app analytics: hot screens, heatmaps and funnels." />
      <EmptyState
        icon={LayoutGrid}
        title="Coming in a later phase"
        description="Connect PostHog in Settings and this page will surface hot screens, heatmaps and funnel drop-off once product_analytics_snapshots has data."
      />
    </div>
  );
}
