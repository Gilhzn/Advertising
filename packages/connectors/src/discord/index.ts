import type { BrandKit } from "@adv/shared";
import { logger } from "@adv/shared";
import { bioFor, taglineOf, type WizardContext } from "../brand.js";
import {
  type ConnectedAccount,
  type Connector,
  ConnectorError,
  type MetricSnapshotInput,
  type PublishablePost,
  type PublishResult,
  type WizardStep,
} from "../connector.js";
import { fetchJson } from "../http.js";
import { composeBody } from "../text.js";

const PLATFORM = "discord" as const;
const MAX_CONTENT = 2000;
const MAX_EMBEDS = 10;

/**
 * Incoming webhook URLs. Discord serves both `discord.com` and the legacy
 * `discordapp.com`, with or without an explicit `/api/vN` segment.
 */
export const WEBHOOK_URL_RE =
  /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api(?:\/v\d{1,2})?\/webhooks\/(\d{15,25})\/([\w-]{20,})$/;

interface WebhookObject {
  id: string;
  type: number;
  name?: string | null;
  channel_id?: string | null;
  guild_id?: string | null;
  avatar?: string | null;
}

interface MessageObject {
  id: string;
  channel_id: string;
  content: string;
  timestamp: string;
}

interface DiscordErrorBody {
  message?: string;
  code?: number;
  retry_after?: number;
  global?: boolean;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

export function parseWebhookUrl(url: string): { id: string; token: string } {
  const match = WEBHOOK_URL_RE.exec(url.trim());
  if (!match) {
    throw new ConnectorError(
      "That does not look like a Discord webhook URL. It must start with https://discord.com/api/webhooks/",
      PLATFORM,
      "not_configured",
      false,
    );
  }
  return { id: match[1] as string, token: match[2] as string };
}

function webhookUrlOf(account: ConnectedAccount): string {
  // The webhook URL is a credential: it lives only in the encrypted token store, never in `config`
  // (config rows are projected to the dashboard).
  const url = account.tokens?.accessToken;
  if (typeof url !== "string" || !url) {
    throw new ConnectorError("Discord account has no webhook URL stored", PLATFORM, "not_configured", false);
  }
  return url;
}

function mapDiscordError(status: number, body: unknown): ConnectorError | undefined {
  const b = (body ?? {}) as DiscordErrorBody;
  const message = b.message ?? `HTTP ${status}`;
  if (status === 429) {
    return new ConnectorError(
      `Discord rate limited${b.global ? " (global)" : ""}: ${message}`,
      PLATFORM,
      "rate_limited",
      true,
      b.retry_after !== undefined ? b.retry_after * 1000 : undefined,
    );
  }
  if (status === 401 || status === 403 || status === 404) {
    // A deleted webhook and a revoked token are indistinguishable and both need a re-connect.
    return new ConnectorError(
      `Discord webhook is no longer valid (${status}): ${message}. Re-create it in Channel settings -> Integrations.`,
      PLATFORM,
      status === 404 ? "not_configured" : "auth_expired",
      false,
    );
  }
  if (status === 400) {
    return new ConnectorError(`Discord rejected the message: ${message}`, PLATFORM, "rejected", false);
  }
  return undefined;
}

/** X-RateLimit-* are informational; we log them so the limiter can be tuned. */
function logRateLimitHeaders(headers: Headers, context: Record<string, unknown>): void {
  const remaining = headers.get("x-ratelimit-remaining");
  if (remaining === null) return;
  logger.debug(
    {
      ...context,
      platform: PLATFORM,
      remaining: Number(remaining),
      limit: Number(headers.get("x-ratelimit-limit") ?? Number.NaN),
      resetAfterSec: Number(headers.get("x-ratelimit-reset-after") ?? Number.NaN),
      bucket: headers.get("x-ratelimit-bucket"),
    },
    "connector.discord.rate_limit",
  );
  if (Number(remaining) === 0) {
    logger.warn(
      { ...context, platform: PLATFORM, resetAfterSec: Number(headers.get("x-ratelimit-reset-after")) },
      "connector.discord.bucket_exhausted",
    );
  }
}

/* ------------------------------------------------------------------ */
/* connector                                                           */
/* ------------------------------------------------------------------ */

export const discordConnector: Connector = {
  id: PLATFORM,
  authKind: "token",
  capabilities: {
    text: true,
    image: true,
    // Webhooks cannot upload a video without multipart; a video URL is posted as a link instead.
    video: false,
    carousel: false,
    nativeSchedule: false,
    insights: false,
    maxChars: MAX_CONTENT,
    maxMedia: MAX_EMBEDS,
    imageAspects: ["1:1", "4:5", "16:9", "9:16"],
  },
  // Webhooks are bucketed at 5 requests / 2s; the practical channel ceiling is 30/min.
  rateLimit: { limit: 30, windowMs: 60_000 },

  wizard(brandKit: BrandKit | null, ctx: WizardContext): WizardStep[] {
    const bio = bioFor(brandKit, PLATFORM, ctx);
    return [
      {
        kind: "create_account",
        title: "Create the Discord server",
        url: "https://discord.com/channels/@me",
        instructions: [
          'In Discord press **+** -> Create My Own -> "For a club or community".',
          `Name the server after the business and add a \`#announcements\` channel we can post to.`,
          "If you already have a community server, skip to the next step.",
        ].join("\n\n"),
        prefill: [
          { label: "Server name", value: ctx.businessName },
          { label: "Channel name", value: "announcements" },
          { label: "Server description", value: bio, multiline: true },
        ],
      },
      {
        kind: "configure",
        title: "Create a webhook for the channel",
        instructions: [
          "Right-click `#announcements` -> **Edit Channel** -> **Integrations** -> **Webhooks** -> **New Webhook**.",
          `Name it "${ctx.businessName} Announcements" and set the brand avatar.`,
          "Press **Copy Webhook URL**.",
        ].join("\n\n"),
        prefill: [
          { label: "Webhook name", value: `${ctx.businessName} Announcements` },
          { label: "Tagline for the channel topic", value: taglineOf(brandKit, ctx) },
        ],
        caveat:
          "Anyone holding this URL can post to the channel. We store it encrypted; delete the webhook to revoke access.",
      },
      {
        kind: "connect_token",
        title: "Paste the webhook URL",
        instructions:
          "Paste the copied URL. We call GET on it to confirm it is live and to read the channel and server ids.",
        inputs: [
          {
            name: "webhookUrl",
            label: "Webhook URL",
            secret: true,
            placeholder: "https://discord.com/api/webhooks/123456789012345678/xxxxxxxx",
          },
        ],
      },
      {
        kind: "verify",
        title: "Verify the webhook",
        instructions: "We fetch the webhook to confirm it still exists and is pointed at the right channel.",
      },
    ];
  },

  async connectWithInputs(inputs: Record<string, string>) {
    const url = (inputs.webhookUrl ?? inputs.url ?? "").trim();
    const { id } = parseWebhookUrl(url);

    const { data } = await fetchJson<WebhookObject>(
      url,
      { headers: { accept: "application/json" } },
      { platform: PLATFORM, mapError: mapDiscordError },
    );

    return {
      tokens: { accessToken: url, tokenType: "webhook" },
      account: {
        externalId: data.id ?? id,
        handle: data.name ?? "webhook",
        config: {
          webhookId: data.id ?? id,
          channelId: data.channel_id ?? null,
          guildId: data.guild_id ?? null,
          webhookName: data.name ?? null,
        },
      },
    };
  },

  async verify(account: ConnectedAccount) {
    try {
      const url = webhookUrlOf(account);
      const { data } = await fetchJson<WebhookObject>(
        url,
        { headers: { accept: "application/json" } },
        { platform: PLATFORM, mapError: mapDiscordError },
      );
      return {
        ok: true,
        handle: data.name ?? "webhook",
        displayName: data.name ?? undefined,
        profileUrl:
          data.guild_id && data.channel_id
            ? `https://discord.com/channels/${data.guild_id}/${data.channel_id}`
            : undefined,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async publish(account: ConnectedAccount, post: PublishablePost): Promise<PublishResult> {
    const guildId = account.config?.guildId;
    const channelId = account.config?.channelId;
    const messageLink = (messageId: string) =>
      guildId && channelId ? `https://discord.com/channels/${guildId}/${channelId}/${messageId}` : undefined;

    if (post.externalId) {
      return { externalId: post.externalId, url: messageLink(post.externalId) };
    }

    const url = webhookUrlOf(account);
    const context = { businessId: account.businessId, accountId: account.id, postId: post.id };

    const images = post.media.filter((m) => m.kind === "image").slice(0, MAX_EMBEDS);
    const videos = post.media.filter((m) => m.kind === "video");

    let content = composeBody({
      body: post.body,
      hashtags: post.hashtags,
      linkUrl: post.linkUrl,
      platform: PLATFORM,
    });
    // Webhooks cannot upload files here, so a video is appended as a link for Discord to unfurl.
    for (const video of videos) {
      if (content.length + video.url.length + 1 <= MAX_CONTENT) content = `${content}\n${video.url}`;
    }

    const embeds = images.map((image, index) => ({
      ...(index === 0 && post.title ? { title: post.title } : {}),
      ...(index === 0 && post.linkUrl ? { url: post.linkUrl } : {}),
      image: { url: image.url },
      ...(image.altText ? { description: image.altText } : {}),
    }));

    const body = {
      content,
      ...(embeds.length ? { embeds } : {}),
      // Never let generated copy ping @everyone or a role.
      allowed_mentions: { parse: [] as string[] },
    };

    const { data, headers } = await fetchJson<MessageObject>(
      `${url}?wait=true`,
      {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
      },
      {
        platform: PLATFORM,
        context,
        retryAfterFrom: (b) => (b as DiscordErrorBody)?.retry_after,
        mapError: mapDiscordError,
      },
    );

    logRateLimitHeaders(headers, context);

    return { externalId: data.id, url: messageLink(data.id), raw: { channelId: data.channel_id } };
  },

  /** Webhooks are write-only; there is no per-message analytics endpoint. */
  async fetchInsights(): Promise<MetricSnapshotInput[]> {
    return [];
  },
};

export default discordConnector;
