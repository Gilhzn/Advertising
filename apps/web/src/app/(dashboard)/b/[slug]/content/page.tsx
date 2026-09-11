import type { PlatformId, PostStatus } from "@adv/shared";
import { ContentBoard } from "@/components/content/content-board";
import { GenerateButton } from "@/components/content/generate-button";
import { PageHeader } from "@/components/page-header";
import { getBusinessBySlug } from "@/lib/data/businesses";
import { listPosts } from "@/lib/data/posts";
import { requireUser } from "@/lib/session";

export default async function ContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ view?: string; platform?: string; status?: string; language?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const business = await getBusinessBySlug(user.id, slug);

  const posts = await listPosts(business.id, {
    platform: sp.platform as PlatformId | undefined,
    status: sp.status as PostStatus | undefined,
    language: sp.language,
  });

  const view = sp.view === "list" ? "list" : "week";

  return (
    <div>
      <PageHeader
        title="Content"
        description="Calendar and approvals for every scheduled post."
        actions={<GenerateButton businessId={business.id} slug={slug} />}
      />
      <ContentBoard posts={posts} view={view} />
    </div>
  );
}
