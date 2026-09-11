import { Mail } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { getBusinessBySlug } from "@/lib/data/businesses";
import { requireUser } from "@/lib/session";

export default async function MailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  await getBusinessBySlug(user.id, slug);

  return (
    <div>
      <PageHeader title="Mail" description="A dedicated business mailbox for replies and inquiries." />
      <EmptyState
        icon={Mail}
        title="Coming in a later phase"
        description="Provisioning a mailbox (Cloudflare Email Routing or Migadu) and DNS records happens once the email phase ships."
      />
    </div>
  );
}
