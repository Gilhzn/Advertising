import { Check, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/session";

const INTEGRATIONS: Array<{ group: string; items: Array<{ label: string; env: string[] }> }> = [
  {
    group: "Core",
    items: [
      { label: "Anthropic API", env: ["ANTHROPIC_API_KEY"] },
      { label: "Token encryption key", env: ["TOKEN_ENCRYPTION_KEY"] },
    ],
  },
  {
    group: "Auth",
    items: [{ label: "Magic link email (Resend)", env: ["RESEND_API_KEY"] }],
  },
  {
    group: "Media storage",
    items: [{ label: "Cloudflare R2", env: ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"] }],
  },
  {
    group: "Business email",
    items: [
      { label: "Cloudflare DNS", env: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ZONE_ID"] },
      { label: "Migadu", env: ["MIGADU_ADMIN_EMAIL", "MIGADU_API_KEY"] },
    ],
  },
  {
    group: "Product analytics",
    items: [{ label: "PostHog", env: ["POSTHOG_PERSONAL_API_KEY", "POSTHOG_ORG_ID"] }],
  },
  {
    group: "Platform apps - wave 1",
    items: [
      { label: "Meta (Facebook/Instagram/Threads)", env: ["META_APP_ID", "META_APP_SECRET"] },
      { label: "LinkedIn", env: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"] },
      { label: "Telegram bot", env: ["TELEGRAM_BOT_TOKEN"] },
      { label: "Discord bot", env: ["DISCORD_BOT_TOKEN", "DISCORD_CLIENT_ID"] },
    ],
  },
  {
    group: "Platform apps - wave 2",
    items: [
      { label: "X (Twitter)", env: ["X_CLIENT_ID", "X_CLIENT_SECRET"] },
      { label: "Reddit", env: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"] },
      { label: "TikTok", env: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"] },
      { label: "Google (YouTube / Business Profile)", env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] },
      { label: "Pinterest", env: ["PINTEREST_APP_ID", "PINTEREST_APP_SECRET"] },
    ],
  },
];

export default async function AppSettingsPage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="App settings"
        description="Which integrations are configured on this server. Values are never shown here."
      />
      <div className="flex flex-col gap-4">
        {INTEGRATIONS.map((group) => (
          <Card key={group.group}>
            <CardHeader>
              <CardTitle>{group.group}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y divide-border">
                {group.items.map((item) => {
                  const configured = item.env.every((key) => Boolean(process.env[key]));
                  return (
                    <li key={item.label} className="flex items-center justify-between py-2 text-sm">
                      {item.label}
                      {configured ? (
                        <span className="flex items-center gap-1 text-success">
                          <Check className="size-4" /> Configured
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <X className="size-4" /> Not set
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
