import type { BrandKit, MetricName } from "@adv/shared";
import { logger } from "@adv/shared";
import { bioFor, primaryHandle, taglineOf, type WizardContext } from "../brand.js";
import {
  type AuthorizeInput,
  type ConnectedAccount,
  type Connector,
  ConnectorError,
  type MetricSnapshotInput,
  type OAuthTokens,
  type PublishablePost,
  type PublishResult,
  type WizardStep,
} from "../connector.js";
import { fetchJson, type HttpOptions, postForm, sleep } from "../http.js";
import { flattenInsights, mapMetaError } from "../meta/graph.js";
import { buildAuthUrl, normalizeTokenResponse, requireEnv } from "../oauth.js";
import { composeBody } from "../text.js";

const PLATFORM = "threads" as const;
const AUTH_HOST = "https://threads.net";
const API_HOST = "https://graph.threads.net";
const API_VERSION = "v1.0";
const MAX_CHARS = 500;
const MAX_CAROUSEL = 20;
const CONTAINER_POLL_TIMEOUT_MS = 60_000;

export const THREADS_SCOPES = ["threads_basic", "threads_content_publish", "threads_manage_insights"];

type ContainerStatus = "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED";

function api(path: string, params: Record<string, string | number | undefined> = {}): string {
  const url = new URL(`${API_HOST}/${API_VERSION}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function http(context: Record<string, unknown> = {}): HttpOptions {
  return { platform: PLATFORM, context, mapError: mapMetaError(PLATFORM) };
}

function appId(): string {
  return requireEnv("THREADS_APP_ID", PLATFORM);
}
function appSecret(): string {
  return requireEnv("THREADS_APP_SECRET", PLATFORM);
}

function userIdOf(account: ConnectedAccount): string {
  const id = account.config?.threadsUserId ?? account.externalId;
  if (typeof id !== "string" || !id) {
    throw new ConnectorError("Threads account has no user id", PLATFORM, "not_configured", false);
  }
  return id;
}

function tokenOf(account: ConnectedAccount): string {
  const token = account.tokens?.accessToken;
  if (!token) {
    throw new ConnectorError("Threads token missing; reconnect", PLATFORM, "auth_expired", false);
  }
  return token;
}

/* ------------------------------------------------------------------ */
/* insights mapping                                                    */
/* ------------------------------------------------------------------ */

const MEDIA_METRICS = ["views", "likes", "replies", "reposts", "quotes"] as const;
const USER_METRICS = ["views", "likes", "replies", "reposts", "quotes", "followers_count"] as const;

const METRIC_MAP: Record<string, MetricName> = {
  views: "views",
  likes: "likes",
  replies: "replies",
  reposts: "reposts",
  // No "quotes" in METRIC_NAMES; a quote is a reshare with commentary -> `shares`.
  quotes: "shares",
  followers_count: "followers",
};

/* ------------------------------------------------------------------ */
/* container flow                                                      */
/* ------------------------------------------------------------------ */

async function createContainer(
  userId: string,
  fields: Record<string, string | number | boolean | undefined>,
  token: string,
  context: Record<string, unknown>,
): Promise<string> {
  const { data } = await postForm<{ id: string }>(
    api(`${userId}/threads`),
    { ...fields, access_token: token },
    http(context),
  );
  if (!data.id) {
    throw new ConnectorError("Threads did not return a container id", PLATFORM, "unknown", false);
  }
  return data.id;
}

async function waitForContainer(
  containerId: string,
  token: string,
  context: Record<string, unknown>,
  timeoutMs = CONTAINER_POLL_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let delay = 2_000;
  for (;;) {
    const { data } = await fetchJson<{ status?: ContainerStatus; error_message?: string }>(
      api(containerId, { fields: "status,error_message", access_token: token }),
      { headers: { accept: "application/json" } },
      http(context),
    );
    if (data.status === "FINISHED" || data.status === "PUBLISHED") return;
    if (data.status === "ERROR" || data.status === "EXPIRED") {
      throw new ConnectorError(
        `Threads container ${data.status}: ${data.error_message ?? "no detail"}`,
        PLATFORM,
        "invalid_media",
        false,
      );
    }
    if (Date.now() + delay > deadline) {
      throw new ConnectorError(
        `Threads media was still ${data.status ?? "IN_PROGRESS"} after ${timeoutMs}ms; the job will retry`,
        PLATFORM,
        "network",
        true,
      );
    }
    await sleep(delay);
    delay = Math.min(delay * 2, 10_000);
  }
}

/* ------------------------------------------------------------------ */
/* connector                                                           */
/* ------------------------------------------------------------------ */

export const threadsConnector: Connector = {
  id: PLATFORM,
  authKind: "oauth",
  capabilities: {
    text: true,
    image: true,
    video: true,
    carousel: true,
    nativeSchedule: false,
    insights: true,
    maxChars: MAX_CHARS,
    maxMedia: MAX_CAROUSEL,
    imageAspects: ["1:1", "4:5", "16:9", "9:16"],
  },
  // Documented ceiling is 250 published posts per 24h per user.
  rateLimit: { limit: 250, windowMs: 24 * 60 * 60 * 1000 },

  wizard(brandKit: BrandKit | null, ctx: WizardContext): WizardStep[] {
    const handle = primaryHandle(brandKit, ctx);
    const bio = bioFor(brandKit, PLATFORM, ctx);
    return [
      {
        kind: "create_account",
        title: "Create the Threads profile",
        url: "https://www.threads.net/login",
        instructions: [
          "Threads profiles are created from an Instagram account - sign in with the Instagram account from the previous step and accept the Threads profile.",
          "The handle is inherited from Instagram, so there is nothing to choose here.",
        ].join("\n\n"),
        prefill: [
          { label: "Handle (from Instagram)", value: `@${handle}` },
          { label: "Bio (150 chars)", value: bio, multiline: true },
          ...(ctx.websiteUrl ? [{ label: "Link", value: ctx.websiteUrl }] : []),
        ],
      },
      {
        kind: "configure",
        title: "Make sure the profile is public",
        instructions: [
          "Threads -> Settings -> Privacy: the profile must be **public** for API publishing and insights.",
          `Set the bio to: “${taglineOf(brandKit, ctx)}”.`,
        ].join("\n\n"),
      },
      {
        kind: "connect_oauth",
        title: "Connect with Threads",
        instructions: [
          "You will be sent to threads.net to approve the connection. This is a **separate** authorization from Facebook/Instagram - the Threads API has its own app credentials.",
          `Requested: ${THREADS_SCOPES.join(", ")}.`,
        ].join("\n\n"),
        caveat:
          "Threads API apps need Tech Provider verification before third parties can use them; in development mode only app-role users can connect.",
      },
      {
        kind: "verify",
        title: "Verify the Threads connection",
        instructions: "We read /me to confirm the token and store your Threads user id.",
      },
    ];
  },

  authUrl(input: AuthorizeInput): string {
    return buildAuthUrl(`${AUTH_HOST}/oauth/authorize`, {
      client_id: appId(),
      redirect_uri: input.redirectUri,
      scope: THREADS_SCOPES.join(","),
      response_type: "code",
      state: input.state,
    });
  },

  async exchangeCode(code: string, input: AuthorizeInput) {
    // Short-lived token: form POST to the Threads-specific token endpoint.
    const { data: short } = await postForm<Record<string, unknown>>(
      `${API_HOST}/oauth/access_token`,
      {
        client_id: appId(),
        client_secret: appSecret(),
        grant_type: "authorization_code",
        redirect_uri: input.redirectUri,
        code,
      },
      http(),
    );
    const shortTokens = normalizeTokenResponse(short, PLATFORM);

    // Exchange for the 60-day long-lived token.
    const { data: long } = await fetchJson<Record<string, unknown>>(
      buildAuthUrl(`${API_HOST}/access_token`, {
        grant_type: "th_exchange_token",
        client_secret: appSecret(),
        access_token: shortTokens.accessToken,
      }),
      { headers: { accept: "application/json" } },
      http(),
    );
    const tokens = normalizeTokenResponse(long, PLATFORM);
    tokens.scopes = THREADS_SCOPES;

    const { data: me } = await fetchJson<{ id: string; username?: string; name?: string }>(
      api("me", { fields: "id,username,name,threads_profile_picture_url", access_token: tokens.accessToken }),
      { headers: { accept: "application/json" } },
      http(),
    );

    return {
      tokens,
      account: {
        externalId: me.id,
        handle: me.username ?? me.id,
        config: { threadsUserId: me.id, username: me.username ?? null },
      },
    };
  },

  /** Threads uses a self-refresh grant (`th_refresh_token`) on the access token itself. */
  async refresh(tokens: OAuthTokens): Promise<OAuthTokens> {
    const { data } = await fetchJson<Record<string, unknown>>(
      buildAuthUrl(`${API_HOST}/refresh_access_token`, {
        grant_type: "th_refresh_token",
        access_token: tokens.accessToken,
      }),
      { headers: { accept: "application/json" } },
      http(),
    );
    const refreshed = normalizeTokenResponse(data, PLATFORM, tokens);
    refreshed.scopes = tokens.scopes ?? THREADS_SCOPES;
    return refreshed;
  },

  async verify(account: ConnectedAccount) {
    try {
      const { data } = await fetchJson<{ id: string; username?: string; name?: string }>(
        api("me", { fields: "id,username,name", access_token: tokenOf(account) }),
        { headers: { accept: "application/json" } },
        http(),
      );
      return {
        ok: true,
        handle: data.username ?? data.id,
        displayName: data.name ?? data.username,
        profileUrl: data.username ? `https://www.threads.net/@${data.username}` : undefined,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async publish(account: ConnectedAccount, post: PublishablePost): Promise<PublishResult> {
    if (post.externalId) {
      return { externalId: post.externalId, url: await permalinkFor(account, post.externalId) };
    }

    const userId = userIdOf(account);
    const token = tokenOf(account);
    const context = { businessId: account.businessId, accountId: account.id, postId: post.id };

    const text = composeBody({
      body: post.body,
      hashtags: post.hashtags,
      linkUrl: post.linkUrl,
      platform: PLATFORM,
    });

    const media = post.media.slice(0, MAX_CAROUSEL);
    let containerId: string;

    if (media.length === 0) {
      containerId = await createContainer(userId, { media_type: "TEXT", text }, token, context);
    } else if (media.length === 1) {
      const item = media[0];
      containerId = await createContainer(
        userId,
        item?.kind === "video"
          ? { media_type: "VIDEO", video_url: item.url, text }
          : { media_type: "IMAGE", image_url: item?.url, text, alt_text: item?.altText },
        token,
        context,
      );
      await waitForContainer(containerId, token, context);
    } else {
      const children: string[] = [];
      for (const item of media) {
        children.push(
          await createContainer(
            userId,
            item.kind === "video"
              ? { media_type: "VIDEO", video_url: item.url, is_carousel_item: true }
              : { media_type: "IMAGE", image_url: item.url, is_carousel_item: true, alt_text: item.altText },
            token,
            context,
          ),
        );
      }
      for (const child of children) await waitForContainer(child, token, context);
      containerId = await createContainer(
        userId,
        { media_type: "CAROUSEL", children: children.join(","), text },
        token,
        context,
      );
      await waitForContainer(containerId, token, context);
    }

    const { data } = await postForm<{ id: string }>(
      api(`${userId}/threads_publish`),
      { creation_id: containerId, access_token: token },
      http(context),
    );

    logger.info({ ...context, platform: PLATFORM, externalId: data.id }, "connector.threads.published");
    return { externalId: data.id, url: await permalinkFor(account, data.id), raw: { containerId } };
  },

  async fetchInsights(
    account: ConnectedAccount,
    since: string,
    posts: Array<{ id: string; externalId: string }>,
  ): Promise<MetricSnapshotInput[]> {
    const userId = userIdOf(account);
    const token = tokenOf(account);
    const context = { businessId: account.businessId, accountId: account.id };
    const capturedAt = new Date().toISOString();
    const out: MetricSnapshotInput[] = [];
    const sinceUnix = Math.floor(Date.parse(since) / 1000);

    try {
      const { data } = await fetchJson<Parameters<typeof flattenInsights>[0]>(
        api(`${userId}/threads_insights`, {
          metric: USER_METRICS.join(","),
          since: Number.isFinite(sinceUnix) ? sinceUnix : undefined,
          access_token: token,
        }),
        { headers: { accept: "application/json" } },
        http(context),
      );
      for (const point of flattenInsights(data)) {
        const metric = METRIC_MAP[point.name];
        if (!metric) continue;
        out.push({ metric, value: point.value, capturedAt: point.endTime ?? capturedAt });
      }
    } catch (err) {
      logger.warn(
        { ...context, platform: PLATFORM, err: err instanceof Error ? err.message : err },
        "connector.threads.user_insights_failed",
      );
    }

    for (const post of posts) {
      try {
        const { data } = await fetchJson<Parameters<typeof flattenInsights>[0]>(
          api(`${post.externalId}/insights`, { metric: MEDIA_METRICS.join(","), access_token: token }),
          { headers: { accept: "application/json" } },
          http(context),
        );
        for (const point of flattenInsights(data)) {
          const metric = METRIC_MAP[point.name];
          if (!metric) continue;
          out.push({ metric, value: point.value, capturedAt, externalPostId: post.externalId });
        }
      } catch (err) {
        logger.warn(
          {
            ...context,
            platform: PLATFORM,
            externalId: post.externalId,
            err: err instanceof Error ? err.message : err,
          },
          "connector.threads.media_insights_failed",
        );
      }
    }

    return out;
  },
};

async function permalinkFor(account: ConnectedAccount, mediaId: string): Promise<string | undefined> {
  try {
    const { data } = await fetchJson<{ permalink?: string }>(
      api(mediaId, { fields: "permalink", access_token: tokenOf(account) }),
      { headers: { accept: "application/json" } },
      http(),
    );
    return data.permalink;
  } catch {
    return undefined;
  }
}

export default threadsConnector;
