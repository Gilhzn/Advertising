import { Sparkles } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { JsonSection, KeyValue, Pill } from "@/components/json-section";
import { PageHeader } from "@/components/page-header";
import { PlatformBadge } from "@/components/platform-badge";
import { RunPoller } from "@/components/run-poller";
import { BrandAssetsCard } from "@/components/strategy/brand-assets-card";
import { BrandKitEditor } from "@/components/strategy/brand-kit-editor";
import { StrategyActions } from "@/components/strategy/strategy-actions";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getRunningRun } from "@/lib/data/agent-runs";
import { getBusinessBySlug } from "@/lib/data/businesses";
import {
  getLatestBrandKit,
  getLatestChannelPlan,
  parseBrandKit,
  parseChannelPlan,
} from "@/lib/data/strategy";
import { requireUser } from "@/lib/session";

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  core: "default",
  secondary: "secondary",
  experimental: "outline",
};

export default async function StrategyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const business = await getBusinessBySlug(user.id, slug);

  const [brandKitRow, channelPlanRow, runningRun] = await Promise.all([
    getLatestBrandKit(business.id),
    getLatestChannelPlan(business.id),
    getRunningRun(business.id, "discover_business"),
  ]);
  const brandKit = parseBrandKit(brandKitRow);
  const channelPlan = parseChannelPlan(channelPlanRow);

  return (
    <div>
      <PageHeader
        title="Strategy"
        description="The brand kit and channel plan the strategist produced from your business description."
        actions={
          <StrategyActions
            businessId={business.id}
            slug={slug}
            approved={Boolean(brandKitRow?.approvedAt && channelPlanRow?.approvedAt)}
            hasChannelPlan={Boolean(channelPlan)}
          />
        }
      />

      <RunPoller running={Boolean(runningRun)} />

      {!brandKit && !channelPlan && !runningRun ? (
        <EmptyState
          icon={Sparkles}
          title="No strategy yet"
          description="Click Re-run to kick off the strategist and generate a brand kit and channel plan."
        />
      ) : null}

      {/* Rendered as soon as the page exists, not gated on a brand kit: generating shows a clear
          "run the strategist first" error rather than the card disappearing. */}
      <div className="mt-4">
        <BrandAssetsCard businessId={business.id} slug={slug} assets={brandKit?.assets} />
      </div>

      {brandKit ? (
        <div className="flex flex-col gap-4">
          <JsonSection title="Positioning" description={brandKit.tagline}>
            <p className="text-sm">{brandKit.positioning}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {brandKit.uniqueSellingPoints.map((usp) => (
                <Pill key={usp}>{usp}</Pill>
              ))}
            </div>
          </JsonSection>

          <JsonSection title="Target audiences">
            <div className="grid gap-4 sm:grid-cols-2">
              {brandKit.targetAudiences.map((a) => (
                <div key={a.name} className="rounded-md border border-border p-3">
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>
                  <KeyValue
                    label="Pain points"
                    value={
                      <ul className="list-inside list-disc text-sm">
                        {a.painPoints.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    }
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {a.whereTheyHangOut.map((w) => (
                      <Pill key={w}>{w}</Pill>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </JsonSection>

          <JsonSection title="Tone of voice">
            <div className="grid gap-3 sm:grid-cols-3">
              <KeyValue
                label="Adjectives"
                value={
                  <div className="flex flex-wrap gap-1.5">
                    {brandKit.toneOfVoice.adjectives.map((a) => (
                      <Pill key={a}>{a}</Pill>
                    ))}
                  </div>
                }
              />
              <KeyValue
                label="Do"
                value={
                  <ul className="list-inside list-disc text-sm">
                    {brandKit.toneOfVoice.dos.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                }
              />
              <KeyValue
                label="Don't"
                value={
                  <ul className="list-inside list-disc text-sm">
                    {brandKit.toneOfVoice.donts.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                }
              />
            </div>
          </JsonSection>

          <JsonSection title="Handle & bios" description="Editing saves a new brand kit version.">
            <div className="flex flex-wrap gap-1.5">
              {brandKit.handleSuggestions.map((h) => (
                <Pill key={h}>@{h}</Pill>
              ))}
            </div>
            <BrandKitEditor businessId={business.id} slug={slug} brandKit={brandKit} />
          </JsonSection>
        </div>
      ) : null}

      {channelPlan ? (
        <div className="mt-4 flex flex-col gap-4">
          <JsonSection title="Content pillars">
            <div className="flex flex-col gap-3">
              {channelPlan.pillars.map((p) => (
                <div key={p.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted-foreground">{Math.round(p.share * 100)}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${Math.round(p.share * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                </div>
              ))}
            </div>
          </JsonSection>

          <JsonSection
            title="Platform plan"
            description={`${channelPlan.weeklyCadence} posts / week overall`}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Posts / week</TableHead>
                  <TableHead>Best times</TableHead>
                  <TableHead>Formats</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {channelPlan.platforms.map((p) => (
                  <TableRow key={p.platform}>
                    <TableCell>
                      <PlatformBadge id={p.platform} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={PRIORITY_VARIANT[p.priority] ?? "outline"}>{p.priority}</Badge>
                    </TableCell>
                    <TableCell>{p.postsPerWeek}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.bestTimesLocal.join(", ")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.formats.join(", ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </JsonSection>

          {channelPlan.communities.length > 0 ? (
            <JsonSection title="Communities" description="Always require human approval before posting.">
              <div className="flex flex-col gap-3">
                {channelPlan.communities.map((c) => (
                  <div key={`${c.platform}-${c.name}`} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <PlatformBadge id={c.platform} />
                        <span className="font-medium">{c.name}</span>
                      </div>
                      <Badge variant="warning">Approval required</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{c.audienceFit}</p>
                    <p className="mt-1 text-sm">{c.rulesSummary}</p>
                  </div>
                ))}
              </div>
            </JsonSection>
          ) : null}

          <JsonSection title="Launch plan">
            <ol className="flex flex-col gap-2 border-l border-border pl-4">
              {channelPlan.launchPlan
                .sort((a, b) => a.day - b.day)
                .map((step) => (
                  <li key={`${step.day}-${step.action}`} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-primary" />
                    <span className="font-medium">Day {step.day}</span> — {step.action}
                    {step.platform ? <span className="text-muted-foreground"> ({step.platform})</span> : null}
                  </li>
                ))}
            </ol>
          </JsonSection>

          <JsonSection title="KPIs">
            <div className="grid gap-3 sm:grid-cols-3">
              {channelPlan.kpis.map((k) => (
                <div key={k.name} className="rounded-md border border-border p-3">
                  <p className="text-sm font-medium">{k.name}</p>
                  <p className="text-sm text-muted-foreground">Target: {k.target}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{k.why}</p>
                </div>
              ))}
            </div>
          </JsonSection>
        </div>
      ) : null}
    </div>
  );
}
