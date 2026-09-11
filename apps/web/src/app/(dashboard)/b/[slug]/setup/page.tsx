import { PLATFORM_IDS, type PlatformId } from "@adv/shared";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { AddPlatformForm } from "@/components/setup/add-platform-form";
import { OAuthToast } from "@/components/setup/oauth-toast";
import { WizardCard } from "@/components/setup/wizard-card";
import { ensureConnectorsRegistered, getConnector, hasConnector } from "@/lib/connectors";
import { listAccounts } from "@/lib/data/accounts";
import { getBusinessBySlug } from "@/lib/data/businesses";
import { getContactEmailForBusiness } from "@/lib/data/mailboxes";
import {
  getLatestBrandKit,
  getLatestChannelPlan,
  parseBrandKit,
  parseChannelPlan,
} from "@/lib/data/strategy";
import { requireUser } from "@/lib/session";

export default async function SetupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const business = await getBusinessBySlug(user.id, slug);
  ensureConnectorsRegistered();

  const [brandKitRow, channelPlanRow, accounts, contactEmail] = await Promise.all([
    getLatestBrandKit(business.id),
    getLatestChannelPlan(business.id),
    listAccounts(business.id),
    getContactEmailForBusiness(business.id),
  ]);
  const brandKit = parseBrandKit(brandKitRow);
  const channelPlan = parseChannelPlan(channelPlanRow);

  const planPlatforms = channelPlan?.platforms.map((p) => p.platform) ?? [];
  const extraPlatforms = accounts.map((a) => a.platform).filter((p) => !planPlatforms.includes(p));
  const platformsToShow = Array.from(new Set([...planPlatforms, ...extraPlatforms])) as PlatformId[];
  const remainingOptions = PLATFORM_IDS.filter((p) => !platformsToShow.includes(p));

  const accountByPlatform = new Map(accounts.map((a) => [a.platform, a]));
  const ctx = {
    businessName: business.name,
    websiteUrl: business.websiteUrl,
    contactEmail,
  };

  return (
    <div>
      <Suspense fallback={null}>
        <OAuthToast />
      </Suspense>
      <PageHeader
        title="Setup"
        description="Connect each platform. Assisted platforms have no API - follow the manual steps."
        actions={<AddPlatformForm businessId={business.id} slug={slug} options={remainingOptions} />}
      />

      {platformsToShow.length === 0 ? (
        <EmptyState
          title="No platforms yet"
          description="Approve a strategy first, or add a platform manually above."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {platformsToShow.map((platform) => (
            <WizardCard
              key={platform}
              businessId={business.id}
              slug={slug}
              platform={platform}
              connector={hasConnector(platform) ? getConnector(platform) : null}
              brandKit={brandKit}
              ctx={ctx}
              account={accountByPlatform.get(platform) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
