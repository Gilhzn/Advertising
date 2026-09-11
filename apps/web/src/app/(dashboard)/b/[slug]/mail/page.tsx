import { Mail } from "lucide-react";
import { type DnsRecordRow, DnsRecordsTable } from "@/components/mail/dns-records-table";
import { InboxTab } from "@/components/mail/inbox-tab";
import { MailboxSetupForm } from "@/components/mail/mailbox-setup-form";
import { MailboxStatusTimeline } from "@/components/mail/mailbox-status-timeline";
import { RecheckDnsButton } from "@/components/mail/recheck-dns-button";
import { RevealCredentials } from "@/components/mail/reveal-credentials";
import { PageHeader } from "@/components/page-header";
import { MailboxStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getBusinessBySlug } from "@/lib/data/businesses";
import { getMailboxForBusiness } from "@/lib/data/mailboxes";
import { requireUser } from "@/lib/session";

export default async function MailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const business = await getBusinessBySlug(user.id, slug);
  const mailbox = await getMailboxForBusiness(business.id);

  return (
    <div>
      <PageHeader title="Mail" description="A dedicated business mailbox for replies and inquiries." />

      {!mailbox ? (
        <Card>
          <CardHeader>
            <CardTitle>Create a mailbox</CardTitle>
          </CardHeader>
          <CardContent>
            <MailboxSetupForm businessId={business.id} slug={slug} domain={business.domain} />
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="flex items-center gap-2">
                <Mail className="size-4" />
                {mailbox.address}
              </CardTitle>
              <MailboxStatusBadge status={mailbox.status} />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <MailboxStatusTimeline status={mailbox.status} lastError={mailbox.lastError} />
              {mailbox.provider === "migadu" && mailbox.status !== "error" ? (
                <RevealCredentials
                  businessId={business.id}
                  mailboxId={mailbox.id}
                  address={mailbox.address}
                />
              ) : null}
            </CardContent>
          </Card>

          <Tabs defaultValue="dns">
            <TabsList>
              <TabsTrigger value="dns">DNS records</TabsTrigger>
              {mailbox.provider === "migadu" ? <TabsTrigger value="inbox">Inbox</TabsTrigger> : null}
            </TabsList>
            <TabsContent value="dns">
              <Card>
                <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                  <CardTitle>DNS records</CardTitle>
                  <RecheckDnsButton businessId={business.id} slug={slug} mailboxId={mailbox.id} />
                </CardHeader>
                <CardContent>
                  <DnsRecordsTable
                    records={((mailbox.dnsRecords ?? []) as unknown as DnsRecordRow[]).map((r) => ({
                      ...r,
                      status: mailbox.status === "active" ? "ok" : "pending",
                    }))}
                  />
                </CardContent>
              </Card>
            </TabsContent>
            {mailbox.provider === "migadu" ? (
              <TabsContent value="inbox">
                <Card>
                  <CardHeader>
                    <CardTitle>Recent messages</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <InboxTab mailbox={mailbox} />
                  </CardContent>
                </Card>
              </TabsContent>
            ) : null}
          </Tabs>
        </div>
      )}
    </div>
  );
}
