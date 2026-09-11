import type { BrandKit } from "@adv/shared";
import { logger } from "@adv/shared";
import { bioFor, taglineOf, type WizardContext } from "../brand.js";
import {
  type AuthorizeInput,
  type ConnectedAccount,
  type Connector,
  ConnectorError,
  type MetricSnapshotInput,
  type OAuthTokens,
  type PublishablePost,
  type PublishResult,
  type VerifyResult,
  type WizardStep,
} from "../connector.js";
import { fetchJson, type HttpOptions } from "../http.js";
import { buildAuthUrl, exchangeAuthorizationCode, refreshWithRefreshToken, requireEnv } from "../oauth.js";
import { composeBody, truncateForPlatform } from "../text.js";

const PLATFORM = "pinterest" as const;
const OAUTH_HOST = "https://www.pinterest.com";
const API_HOST = "https://api.pinterest.com";
const SANDBOX_API_HOST = "https://api-sandbox.pinterest.com";
const MAX_CHARS = 500;
const MAX_TITLE_CHARS = 100;
const MAX_DESCRIPTION_CHARS = 800;
const MAX_ALT_TEXT_CHARS = 500;

export const PINTEREST_SCOPES = ["boards:read", "pins:read", "pins:write", "user_accounts:read"];

/** Organic pin metrics we ask for; Pinterest calls them `metric_types`. */
export const PIN_METRIC_TYPES = ["IMPRESSION", "SAVE", "PIN_CLICK"] as const;

const METRIC_MAP: Record<string, "impressions" | "saves" | "clicks"> = {
  IMPRESSION: "impressions",
  SAVE: "saves",
  PIN_CLICK: "clicks",
};

/* ------------------------------------------------------------------ */
/* wire types                                                          */
/* ------------------------------------------------------------------ */

interface PinResource {
  id?: string;
  link?: string;
  title?: string;
  description?: string;
  board_id?: string;
  created_at?: string;
}

interface BoardResource {
  id?: string;
  name?: string;
  description?: string;
  privacy?: string;
}

interface UserAccountResource {
  username?: string;
  account_type?: string;
  profile_image?: string;
  website_url?: string;
  id?: string;
  about?: string;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function appId(): string {
  return requireEnv("PINTEREST_APP_ID", PLATFORM);
}
function appSecret(): string {
  return requireEnv("PINTEREST_APP_SECRET", PLATFORM);
}

/** Trial access is sandbox-only; `config.sandbox` swaps the API host. */
export function apiHost(config: Record<string, unknown> | undefined): string {
  return config?.sandbox === true ? SANDBOX_API_HOST : API_HOST;
}

function tokenOf(account: ConnectedAccount): string {
  const token = account.tokens?.accessToken;
  if (!token) {
    throw new ConnectorError(
      "Pinterest account has no access token; reconnect",
      PLATFORM,
      "auth_expired",
      false,
    );
  }
  return token;
}

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, accept: "application/json" };
}

interface PinterestErrorBody {
  message?: string;
  code?: number;
  message_detail?: string;
}

function mapPinterestError(status: number, body: unknown): ConnectorError | undefined {
  const b = (body ?? {}) as PinterestErrorBody;
  const message = b.message_detail ?? b.message ?? `HTTP ${status}`;
  if (status === 401) {
    return new ConnectorError(
      `Pinterest token is invalid or expired: ${message}`,
      PLATFORM,
      "auth_expired",
      false,
    );
  }
  if (status === 403) {
    return new ConnectorError(
      `Pinterest denied the request: ${message}. Trial access is sandbox-only until the app review passes.`,
      PLATFORM,
      "auth_expired",
      false,
    );
  }
  if (status === 429) {
    return new ConnectorError(`Pinterest rate limited the app: ${message}`, PLATFORM, "rate_limited", true);
  }
  if (status === 400 && /image|media|url/i.test(message)) {
    return new ConnectorError(`Pinterest rejected the media: ${message}`, PLATFORM, "invalid_media", false);
  }
  return undefined;
}

function http(context: Record<string, unknown> = {}): HttpOptions {
  return { platform: PLATFORM, context, mapError: mapPinterestError };
}

export function pinUrl(id: string): string {
  return `https://www.pinterest.com/pin/${id}/`;
}

function boardIdOf(account: ConnectedAccount): string {
  const boardId = account.config?.boardId;
  if (typeof boardId !== "string" || !boardId) {
    throw new ConnectorError(
      "Pinterest account has no board selected; pick or create a board in the wizard first",
      PLATFORM,
      "not_configured",
      false,
    );
  }
  return boardId;
}

function isoDate(value: string | number | Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

/**
 * v5 analytics answers with one entry per split (`"all"`, or a breakdown key),
 * each holding a `summary_metrics` object of `METRIC -> number`. The exact
 * envelope differs between the pin and the user-account endpoint, so we walk
 * the response for every `summary_metrics` object rather than assuming a shape.
 */
export function collectSummaryMetrics(payload: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const visit = (node: unknown, depth: number): void => {
    if (depth > 6 || !node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "summary_metrics" && value && typeof value === "object") {
        for (const [metric, raw] of Object.entries(value as Record<string, unknown>)) {
          const n = typeof raw === "number" ? raw : Number(raw);
          if (Number.isFinite(n)) out[metric] = n;
        }
      } else if (value && typeof value === "object") {
        visit(value, depth + 1);
      }
    }
  };
  visit(payload, 0);
  return out;
}

/* ------------------------------------------------------------------ */
/* connector                                                           */
/* ------------------------------------------------------------------ */

export const pinterestConnector: Connector = {
  id: PLATFORM,
  authKind: "oauth",
  capabilities: {
    // A pin is an image (or video) plus a link; there is no text-only pin.
    text: false,
    image: true,
    // Video pins need the /v5/media upload + polling flow; not wave 2.
    video: false,
    carousel: false,
    nativeSchedule: false,
    insights: true,
    privateUntilReview: true,
    maxChars: MAX_CHARS,
    maxMedia: 1,
    imageAspects: ["2:3", "1:1", "9:16"],
  },
  // Trial access is 1,000 requests/day for the whole app; Standard is 100/s per user.
  rateLimit: { limit: 50, windowMs: 24 * 60 * 60 * 1000 },

  wizard(brandKit: BrandKit | null, ctx: WizardContext): WizardStep[] {
    return [
      {
        kind: "create_account",
        title: "Create the Pinterest business account",
        url: "https://www.pinterest.com/business/create/",
        instructions: [
          "Create a **business** account (free) - a personal account has no analytics and cannot be used with the API.",
          "Claim your website in Settings -> Claimed accounts: claimed domains get attribution on every pin that links to them, which is most of the value of this channel.",
        ].join("\n\n"),
        prefill: [
          { label: "Business name", value: ctx.businessName },
          { label: "About", value: bioFor(brandKit, PLATFORM, ctx), multiline: true },
          { label: "Tagline", value: taglineOf(brandKit, ctx) },
          ...(ctx.websiteUrl ? [{ label: "Website to claim", value: ctx.websiteUrl }] : []),
        ],
      },
      {
        kind: "configure",
        title: "Create the app and pick the destination board",
        url: "https://developers.pinterest.com/apps/",
        instructions: [
          "Connect an app at the Pinterest developer dashboard and add our redirect URI. A new app gets **Trial access**, which is sandbox-only: pins created with it are visible only to you.",
          "Then create the board your pins should land on - one focused board beats a general one, because Pinterest is a search engine and boards are topics.",
          "After the connection we list your boards and store the chosen board id in this account's config (`boardId`).",
        ].join("\n\n"),
        prefill: [
          { label: "Board name", value: `${ctx.businessName} - updates` },
          { label: "Board description", value: bioFor(brandKit, PLATFORM, ctx), multiline: true },
        ],
        caveat:
          "With Trial access everything is sandbox-only and invisible to other people. Standard access needs an app review that includes a screen recording of the app calling the Pinterest API.",
      },
      {
        kind: "connect_oauth",
        title: "Connect with Pinterest",
        instructions: [
          "You will be sent to Pinterest to approve the connection.",
          `Requested scopes: ${PINTEREST_SCOPES.join(", ")}.`,
          "Pinterest access tokens are short-lived; we store the refresh token and renew them automatically.",
        ].join("\n\n"),
      },
      {
        kind: "verify",
        title: "Verify the Pinterest connection",
        instructions:
          "We read /v5/user_account and /v5/boards to confirm the token and to let you choose the destination board.",
      },
    ];
  },

  authUrl(input: AuthorizeInput): string {
    return buildAuthUrl(`${OAUTH_HOST}/oauth/`, {
      client_id: appId(),
      redirect_uri: input.redirectUri,
      response_type: "code",
      // Pinterest takes the scope list comma-separated.
      scope: PINTEREST_SCOPES.join(","),
      state: input.state,
    });
  },

  async exchangeCode(code: string, input: AuthorizeInput) {
    const sandbox = process.env.PINTEREST_SANDBOX === "true";
    const host = sandbox ? SANDBOX_API_HOST : API_HOST;
    const tokens = await exchangeAuthorizationCode(
      `${host}/v5/oauth/token`,
      { grant_type: "authorization_code", code, redirect_uri: input.redirectUri },
      { platform: PLATFORM, basicAuth: { clientId: appId(), clientSecret: appSecret() } },
    );

    const { data: user } = await fetchJson<UserAccountResource>(
      `${host}/v5/user_account`,
      { headers: authHeaders(tokens.accessToken) },
      http(),
    );
    const boards = await listBoards(host, tokens.accessToken);

    return {
      tokens,
      account: {
        externalId: user.id ?? user.username ?? null,
        handle: user.username ?? null,
        config: {
          username: user.username ?? null,
          accountType: user.account_type ?? null,
          sandbox,
          boardId: boards[0]?.id ?? null,
          boards: boards.map((b) => ({ id: b.id, name: b.name })),
        },
      },
    };
  },

  async refresh(tokens: OAuthTokens): Promise<OAuthTokens> {
    const host = process.env.PINTEREST_SANDBOX === "true" ? SANDBOX_API_HOST : API_HOST;
    return refreshWithRefreshToken(
      `${host}/v5/oauth/token`,
      tokens,
      {},
      {
        platform: PLATFORM,
        basicAuth: { clientId: appId(), clientSecret: appSecret() },
      },
    );
  },

  async verify(account: ConnectedAccount): Promise<VerifyResult> {
    const host = apiHost(account.config);
    try {
      const { data } = await fetchJson<UserAccountResource>(
        `${host}/v5/user_account`,
        { headers: authHeaders(tokenOf(account)) },
        http(),
      );
      const sandbox = account.config?.sandbox === true;
      return {
        ok: true,
        handle: data.username,
        displayName: data.username,
        profileUrl: data.username ? `https://www.pinterest.com/${data.username}/` : undefined,
        ...(sandbox
          ? {
              warning:
                "This Pinterest app is on Trial access, so every pin we create is sandbox-only and visible to nobody but you until Standard access is approved.",
            }
          : {}),
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async publish(account: ConnectedAccount, post: PublishablePost): Promise<PublishResult> {
    const sandbox = account.config?.sandbox === true;
    if (post.externalId) {
      return {
        externalId: post.externalId,
        url: pinUrl(post.externalId),
        visibility: sandbox ? "private" : "public",
      };
    }

    const host = apiHost(account.config);
    const token = tokenOf(account);
    const boardId = boardIdOf(account);
    const context = { businessId: account.businessId, accountId: account.id, postId: post.id };

    const image = post.media.find((m) => m.kind === "image");
    if (!image) {
      throw new ConnectorError(
        "Pinterest pins need an image; there is no text-only pin",
        PLATFORM,
        "invalid_media",
        false,
      );
    }

    const description = truncateForPlatform(
      composeBody({ body: post.body, hashtags: post.hashtags, linkUrl: null, platform: PLATFORM }),
      MAX_DESCRIPTION_CHARS,
    );
    const title = truncateForPlatform(post.title?.trim() || post.body.trim(), MAX_TITLE_CHARS);

    const body: Record<string, unknown> = {
      board_id: boardId,
      title,
      description,
      // The image is fetched by Pinterest from our public media URL.
      media_source: { source_type: "image_url", url: image.url },
    };
    if (post.linkUrl) body.link = post.linkUrl;
    if (image.altText) body.alt_text = image.altText.slice(0, MAX_ALT_TEXT_CHARS);
    if (account.config?.boardSectionId) body.board_section_id = account.config.boardSectionId;

    const { data } = await fetchJson<PinResource>(
      `${host}/v5/pins`,
      {
        method: "POST",
        headers: { ...authHeaders(token), "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      http(context),
    );

    const id = data.id;
    if (!id) {
      throw new ConnectorError("Pinterest accepted the pin but returned no id", PLATFORM, "unknown", false);
    }

    logger.info({ ...context, platform: PLATFORM, externalId: id, sandbox }, "connector.pinterest.published");
    return {
      externalId: id,
      url: pinUrl(id),
      visibility: sandbox ? "private" : "public",
      raw: { boardId, sandbox },
    };
  },

  async fetchInsights(
    account: ConnectedAccount,
    since: string,
    posts: Array<{ id: string; externalId: string }>,
  ): Promise<MetricSnapshotInput[]> {
    const host = apiHost(account.config);
    const token = tokenOf(account);
    const headers = authHeaders(token);
    const capturedAt = new Date().toISOString();
    const startDate = isoDate(Number.isFinite(Date.parse(since)) ? since : Date.now() - 30 * 86_400_000);
    const endDate = isoDate(Date.now());
    const metricTypes = PIN_METRIC_TYPES.join(",");
    const out: MetricSnapshotInput[] = [];

    const { data: accountAnalytics } = await fetchJson<unknown>(
      `${host}/v5/user_account/analytics?start_date=${startDate}&end_date=${endDate}&metric_types=${metricTypes}`,
      { headers },
      { ...http(), retries: 1 },
    );
    for (const [metric, value] of Object.entries(collectSummaryMetrics(accountAnalytics))) {
      const mapped = METRIC_MAP[metric];
      if (mapped) out.push({ metric: mapped, value, capturedAt });
    }

    for (const post of posts) {
      if (!post.externalId) continue;
      const { data: pinAnalytics } = await fetchJson<unknown>(
        `${host}/v5/pins/${encodeURIComponent(post.externalId)}/analytics?start_date=${startDate}&end_date=${endDate}&metric_types=${metricTypes}`,
        { headers },
        { ...http(), retries: 1 },
      );
      for (const [metric, value] of Object.entries(collectSummaryMetrics(pinAnalytics))) {
        const mapped = METRIC_MAP[metric];
        if (mapped) out.push({ metric: mapped, value, capturedAt, externalPostId: post.externalId });
      }
    }
    return out;
  },
};

async function listBoards(host: string, token: string): Promise<BoardResource[]> {
  const { data } = await fetchJson<{ items?: BoardResource[] }>(
    `${host}/v5/boards?page_size=50`,
    { headers: authHeaders(token) },
    http(),
  );
  return data.items ?? [];
}

export default pinterestConnector;
