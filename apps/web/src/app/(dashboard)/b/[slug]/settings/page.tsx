import { PageHeader } from "@/components/page-header";
import { BusinessSettingsForm } from "@/components/settings/business-settings-form";
import { DeleteBusinessDialog } from "@/components/settings/delete-business-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBusinessBySlug } from "@/lib/data/businesses";
import { requireUser } from "@/lib/session";

export default async function BusinessSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const business = await getBusinessBySlug(user.id, slug);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" description={business.name} />

      <Card>
        <CardContent className="pt-6">
          <BusinessSettingsForm business={business} slug={slug} />
        </CardContent>
      </Card>

      <Card className="mt-4 border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
        </CardHeader>
        <CardContent>
          <DeleteBusinessDialog businessId={business.id} businessName={business.name} />
        </CardContent>
      </Card>
    </div>
  );
}
