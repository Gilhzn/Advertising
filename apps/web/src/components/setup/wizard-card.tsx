import type { BrandKit, PlatformId } from "@adv/shared";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { PlatformIcon, platformLabel } from "@/components/platform-badge";
import { TokenConnectForm } from "@/components/setup/token-connect-form";
import { AccountStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Connector } from "@/lib/connectors";
import type { PlatformAccount } from "@/lib/data/accounts";

export function WizardCard({
  businessId,
  slug,
  platform,
  connector,
  brandKit,
  ctx,
  account,
}: {
  businessId: string;
  slug: string;
  platform: PlatformId;
  connector: Connector | null;
  brandKit: BrandKit | null;
  ctx: { businessName: string; websiteUrl?: string | null; contactEmail?: string | null };
  account: PlatformAccount | null;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <PlatformIcon id={platform} />
          {platformLabel(platform)}
        </CardTitle>
        <AccountStatusBadge status={account?.status ?? "pending"} />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {account?.lastError ? (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {account.lastError}
          </div>
        ) : null}

        {!connector ? (
          <p className="text-sm text-muted-foreground">
            This platform's connector isn't wired up yet. Check back once it ships.
          </p>
        ) : (
          <ol className="flex flex-col gap-4">
            {connector.wizard(brandKit, ctx).map((step, i) => (
              <li
                key={`${step.kind}-${step.title}`}
                className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0"
              >
                <p className="text-sm font-medium">
                  {i + 1}. {step.title}
                </p>
                <p className="whitespace-pre-line text-sm text-muted-foreground">{step.instructions}</p>

                {step.caveat ? (
                  <div className="flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    {step.caveat}
                  </div>
                ) : null}

                {step.prefill && step.prefill.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {step.prefill.map((p) => (
                      <div
                        key={p.label}
                        className="flex items-center gap-2 rounded-md border border-border p-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground">{p.label}</p>
                          <p className="truncate text-sm">{p.value}</p>
                        </div>
                        <CopyButton value={p.value} />
                      </div>
                    ))}
                  </div>
                ) : null}

                {step.url ? (
                  <Button asChild variant="outline" size="sm" className="self-start">
                    <a href={step.url} target="_blank" rel="noreferrer">
                      Open <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                ) : null}

                {step.kind === "connect_oauth" ? (
                  <Button asChild size="sm" className="self-start">
                    <a href={`/api/oauth/${platform}/start?businessId=${businessId}`}>Connect with OAuth</a>
                  </Button>
                ) : null}

                {step.kind === "connect_token" ? (
                  <TokenConnectForm businessId={businessId} slug={slug} platform={platform} step={step} />
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
