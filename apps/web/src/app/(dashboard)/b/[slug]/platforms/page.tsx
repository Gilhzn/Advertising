import { Rocket } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PlatformBadge } from "@/components/platform-badge";
import { DisconnectButton } from "@/components/platforms/disconnect-button";
import { AccountStatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAccounts } from "@/lib/data/accounts";
import { getBusinessBySlug } from "@/lib/data/businesses";
import { accountMetricTotals } from "@/lib/data/metrics";
import { requireUser } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";

export default async function PlatformsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const business = await getBusinessBySlug(user.id, slug);
  const accounts = await listAccounts(business.id);

  const now = Date.now();
  const since7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const since30 = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const totals = await Promise.all(
    accounts.map(async (a) => ({
      id: a.id,
      d7: await accountMetricTotals(a.id, since7),
      d30: await accountMetricTotals(a.id, since30),
    })),
  );
  const totalsById = new Map(totals.map((t) => [t.id, t]));

  return (
    <div>
      <PageHeader title="Platforms" description="Connected accounts and how they're performing." />

      {accounts.length === 0 ? (
        <EmptyState
          icon={Rocket}
          title="No accounts yet"
          description="Head to Setup to connect your first platform."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Platform</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Handle</TableHead>
              <TableHead>Followers</TableHead>
              <TableHead>Impressions 7d / 30d</TableHead>
              <TableHead>Reach 7d / 30d</TableHead>
              <TableHead>Last sync</TableHead>
              <TableHead>Last error</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => {
              const t = totalsById.get(account.id);
              const engagement7 =
                (t?.d7.likes ?? 0) + (t?.d7.comments ?? 0) + (t?.d7.shares ?? 0) + (t?.d7.saves ?? 0);
              const engagement30 =
                (t?.d30.likes ?? 0) + (t?.d30.comments ?? 0) + (t?.d30.shares ?? 0) + (t?.d30.saves ?? 0);
              return (
                <TableRow key={account.id}>
                  <TableCell>
                    <PlatformBadge id={account.platform} />
                  </TableCell>
                  <TableCell>
                    <AccountStatusBadge status={account.status} />
                  </TableCell>
                  <TableCell>{account.handle ?? "-"}</TableCell>
                  <TableCell>{t?.d30.followers ?? "-"}</TableCell>
                  <TableCell>
                    {t?.d7.impressions ?? 0} / {t?.d30.impressions ?? 0}
                  </TableCell>
                  <TableCell>
                    {t?.d7.reach ?? 0} / {t?.d30.reach ?? 0}
                    <span className="ml-2 text-xs text-muted-foreground">
                      eng {engagement7}/{engagement30}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(account.lastSyncedAt)}
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-sm text-destructive">
                    {account.lastError ?? "-"}
                  </TableCell>
                  <TableCell>
                    <DisconnectButton businessId={business.id} slug={slug} accountId={account.id} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
