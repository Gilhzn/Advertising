import { type BrandKit, logger, PLATFORMS, type PlatformId } from "@adv/shared";
import type { WizardContext } from "../brand.js";
import {
  type ConnectedAccount,
  type Connector,
  ConnectorError,
  type MetricSnapshotInput,
  type PublishablePost,
  type PublishResult,
  type VerifyResult,
  type WizardStep,
} from "../connector.js";
import { fetchJson, type HttpOptions } from "../http.js";
import { composeBody } from "../text.js";

/**
 * Late (getlate.dev) is a "one API for 13 social platforms" aggregator. It is a
 * **fallback route**, not a replacement: a platform is sent through Late only
 * when `platform_accounts.config.via === "late"` **and** `LATE_API_KEY` is set.
 * Everything else keeps using the first-party connector, which gives better
 * errors, real insights and no third-party dependency.
 *
 * See NOTES.md - the request shape is taken from a mirror of Late's own docs,
 * not from the vendor site (blocked), and is marked unverified.
 */
const LATE_BASE = "https://getlate.dev/api/v1";

/** Our platform id -> Late's platform key. */
export const LATE_PLATFORM_NAMES: Partial<Record<PlatformId, string>> = {
  x: "twitter",
  instagram: "instagram",
  facebook: "facebook",
  linkedin: "linkedin",
  tiktok: "tiktok",
  youtube: "youtube",
  pinterest: "pinterest",
  reddit: "reddit",
  bluesky: "bluesky",
  threads: "threads",
  telegram: "telegram",
  google_business: "google_business",
};

/** Platforms Late supports at all. Everything else can never be routed via Late. */
export const LATE_ROUTABLE_PLATFORMS = Object.keys(LATE_PLATFORM_NAMES) as PlatformId[];

export function isLateEnabled(): boolean {
  return Boolean(process.env.LATE_API_KEY);
}

export function latePlatformName(platform: PlatformId): string {
  const name = LATE_PLATFORM_NAMES[platform];
  if (!name) {
    throw new ConnectorError(`Late does not support ${platform}`, platform, "not_configured", false);
  }
  return name;
}

/* ------------------------------------------------------------------ */
/* wire types                                                          */
/* ------------------------------------------------------------------ */

interface LatePost {
  _id?: string;
  id?: string;
  status?: string;
  content?: string;
  platforms?: Array<{ platform?: string; accountId?: string; status?: string; platformPostUrl?: string }>;
}

interface LateAccount {
  _id?: string;
  id?: string;
  platform?: string;
  username?: string;
  name?: string;
  profileUrl?: string;
  needsReconnection?: boolean;
  status?: string;
}

interface LateErrorBody {
  error?: string;
  code?: string;
  details?: unknown;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function apiKey(platform: PlatformId): string {
  const key = process.env.LATE_API_KEY;
  if (!key) {
    throw new ConnectorError(
      "LATE_API_KEY is not set; the Late aggregator is disabled on this deployment",
      platform,
      "not_configured",
      false,
    );
  }
  return key;
}

function headers(platform: PlatformId): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey(platform)}`,
    "content-type": "application/json",
    accept: "application/json",
  };
}

function mapLateError(platform: PlatformId) {
  return (status: number, body: unknown): ConnectorError | undefined => {
    const b = (body ?? {}) as LateErrorBody;
    const code = b.code ?? "";
    const message = b.error ?? code ?? `HTTP ${status}`;
    if (status === 401 || code === "UNAUTHORIZED") {
      return new ConnectorError(`Late rejected the API key: ${message}`, platform, "auth_expired", false);
    }
    if (status === 403 || code === "FORBIDDEN") {
      return new ConnectorError(
        `Late denied the request: ${message}. The connected account may need reconnecting inside Late.`,
        platform,
        "auth_expired",
        false,
      );
    }
    if (status === 429 || code === "RATE_LIMITED") {
      return new ConnectorError(`Late rate limited this plan: ${message}`, platform, "rate_limited", true);
    }
    if (status === 422 || code === "VALIDATION_ERROR") {
      return new ConnectorError(`Late rejected the post: ${message}`, platform, "rejected", false);
    }
    return undefined;
  };
}

function http(platform: PlatformId, context: Record<string, unknown> = {}): HttpOptions {
  return { platform, context, mapError: mapLateError(platform) };
}

function accountIdOf(account: ConnectedAccount): string {
  const id = account.config?.lateAccountId ?? account.config?.accountId;
  if (typeof id !== "string" || !id) {
    throw new ConnectorError(
      "This account is routed through Late but has no Late account id; paste it in the wizard",
      account.platform,
      "not_configured",
      false,
    );
  }
  return id;
}

export function postIdOf(body: LatePost | { post?: LatePost } | undefined): string | undefined {
  if (!body) return undefined;
  const post = (body as { post?: LatePost }).post ?? (body as LatePost);
  return post._id ?? post.id;
}

/* ------------------------------------------------------------------ */
/* factory                                                             */
/* ------------------------------------------------------------------ */

/**
 * Builds a Connector for `platform` that publishes through Late instead of the
 * platform's own API. `id` stays the real platform id so everything downstream
 * (metrics, plan, calendar) is unchanged; only the transport differs.
 */
export function createLateConnector(platform: PlatformId): Connector {
  const meta = PLATFORMS[platform];
  const lateName = LATE_PLATFORM_NAMES[platform];
  if (!lateName) {
    throw new Error(`Late does not support the "${platform}" platform`);
  }

  return {
    id: platform,
    authKind: "token",
    capabilities: {
      text: meta.supports.text,
      image: meta.supports.image,
      video: meta.supports.video,
      carousel: meta.supports.carousel,
      // Late can schedule server-side, but our worker owns scheduling so that
      // approvals and the calendar stay the single source of truth.
      nativeSchedule: false,
      // Late's analytics endpoints are platform-specific and partial; we do not
      // pretend to have them.
      insights: false,
      maxChars: meta.maxChars,
      maxMedia: meta.supports.carousel ? 10 : meta.supports.image || meta.supports.video ? 1 : 0,
      imageAspects: ["1:1", "4:5", "16:9", "9:16"],
    },
    // Late's own limit is 60 requests/minute on the free plan.
    rateLimit: { limit: 30, windowMs: 60 * 1000 },

    wizard(_brandKit: BrandKit | null, ctx: WizardContext): WizardStep[] {
      return [
        {
          kind: "info",
          title: `Publishing ${meta.label} through Late`,
          url: "https://getlate.dev/dashboard",
          instructions: [
            `This deployment routes **${meta.label}** through [Late](https://getlate.dev), a third-party scheduling API, instead of talking to ${meta.label} directly.`,
            "That means Late holds the OAuth connection and the platform's rate limits apply to Late's app, not ours. It is the pragmatic route when a platform's own app review has not cleared yet.",
            `Trade-offs: no per-post insights through this route, and one more company in the path between ${ctx.businessName} and the platform.`,
          ].join("\n\n"),
          caveat:
            "Late is a third party. Posts, media URLs and account tokens pass through their infrastructure. Do not route a platform through Late if that is not acceptable for this business.",
        },
        {
          kind: "configure",
          title: "Connect the account inside Late",
          url: "https://getlate.dev/dashboard",
          instructions: [
            "In the Late dashboard, create a profile for this business and connect the platform account to it (Late runs its own OAuth flow).",
            "Then copy the **account id** Late shows for that connection - it is what we send with every post.",
          ].join("\n\n"),
        },
        {
          kind: "connect_token",
          title: "Paste the Late account id",
          instructions:
            "Paste the Late account id for this platform. The Late API key itself is a deployment-level secret (`LATE_API_KEY`), not something you paste here.",
          inputs: [
            {
              name: "lateAccountId",
              label: "Late account id",
              placeholder: "68b1f4e20000000000000000",
              help: "From the Late dashboard, on the connected account.",
            },
          ],
        },
        {
          kind: "verify",
          title: "Verify the Late connection",
          instructions: "We ask Late for that account's health to confirm the id and that the token is live.",
        },
      ];
    },

    async connectWithInputs(inputs: Record<string, string>) {
      const lateAccountId = (inputs.lateAccountId ?? inputs.accountId ?? "").trim();
      if (!lateAccountId) {
        throw new ConnectorError("A Late account id is required", platform, "not_configured", false);
      }
      const { data } = await fetchJson<{ account?: LateAccount } & LateAccount>(
        `${LATE_BASE}/accounts/${encodeURIComponent(lateAccountId)}/health`,
        { headers: headers(platform) },
        http(platform),
      );
      const account = data.account ?? data;
      return {
        account: {
          externalId: lateAccountId,
          handle: account.username ?? account.name ?? null,
          config: { via: "late", lateAccountId, latePlatform: lateName },
        },
      };
    },

    async verify(account: ConnectedAccount): Promise<VerifyResult> {
      try {
        const lateAccountId = accountIdOf(account);
        const { data } = await fetchJson<{ account?: LateAccount } & LateAccount>(
          `${LATE_BASE}/accounts/${encodeURIComponent(lateAccountId)}/health`,
          { headers: headers(platform) },
          http(platform),
        );
        const info = data.account ?? data;
        const needsReconnect = info.needsReconnection === true || info.status === "needs_reconnection";
        return {
          ok: !needsReconnect,
          handle: info.username ?? info.name ?? account.handle ?? undefined,
          displayName: info.name ?? undefined,
          profileUrl: info.profileUrl ?? undefined,
          ...(needsReconnect
            ? {
                error: `Late reports this ${meta.label} connection needs reconnecting in the Late dashboard.`,
              }
            : {
                warning: `${meta.label} is routed through Late, so per-post insights are not collected for this account.`,
              }),
        };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async publish(account: ConnectedAccount, post: PublishablePost): Promise<PublishResult> {
      if (post.externalId) return { externalId: post.externalId };

      const lateAccountId = accountIdOf(account);
      const context = { businessId: account.businessId, accountId: account.id, postId: post.id };

      const content = composeBody({
        body: post.body,
        hashtags: post.hashtags,
        linkUrl: post.linkUrl,
        platform,
      });

      const body: Record<string, unknown> = {
        content,
        platforms: [{ platform: lateName, accountId: lateAccountId }],
        publishNow: true,
      };
      if (post.media.length > 0) {
        body.mediaItems = post.media.map((m) => ({ type: m.kind, url: m.url }));
      }

      const { data } = await fetchJson<LatePost | { post: LatePost }>(
        `${LATE_BASE}/posts`,
        { method: "POST", headers: headers(platform), body: JSON.stringify(body) },
        http(platform, context),
      );

      const id = postIdOf(data);
      if (!id) {
        throw new ConnectorError("Late accepted the post but returned no id", platform, "unknown", false);
      }

      const entry = ((data as { post?: LatePost }).post ?? (data as LatePost)).platforms?.[0];
      logger.info({ ...context, platform, externalId: id, via: "late" }, "connector.late.published");
      return {
        externalId: id,
        url: entry?.platformPostUrl,
        raw: { via: "late", latePlatform: lateName, status: entry?.status },
      };
    },

    /** Late's analytics coverage is partial and platform-specific; we collect none. */
    async fetchInsights(): Promise<MetricSnapshotInput[]> {
      return [];
    },
  };
}

/** Late connectors for every routable platform, or `[]` when the key is not set. */
export function lateConnectors(): Connector[] {
  if (!isLateEnabled()) return [];
  return LATE_ROUTABLE_PLATFORMS.map((platform) => createLateConnector(platform));
}
