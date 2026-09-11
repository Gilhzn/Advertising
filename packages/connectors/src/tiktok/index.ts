import type { BrandKit } from "@adv/shared";
import { logger } from "@adv/shared";
import { bioFor, handleSuggestions, primaryHandle, type WizardContext } from "../brand.js";
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
import { fetchJson, type HttpOptions, postForm, sleep } from "../http.js";
import { buildAuthUrl, codeChallengeS256, normalizeTokenResponse, requireEnv } from "../oauth.js";
import { composeBody } from "../text.js";

const PLATFORM = "tiktok" as const;
const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const API = "https://open.tiktokapis.com";
const MAX_CHARS = 2200;
/** Direct Post titles are capped well below the caption limit. */
const MAX_TITLE_CHARS = 90;
const MAX_PHOTOS = 35;
const STATUS_POLL_ATTEMPTS = 8;
const STATUS_POLL_INTERVAL_MS = 3000;

export const TIKTOK_SCOPES = ["user.info.basic", "video.publish", "video.upload"];

export type PrivacyLevel =
  | "PUBLIC_TO_EVERYONE"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "FOLLOWER_OF_CREATOR"
  | "SELF_ONLY";

/* ------------------------------------------------------------------ */
/* wire types                                                          */
/* ------------------------------------------------------------------ */

interface TikTokEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string; log_id?: string };
}

interface PublishInitData {
  publish_id?: string;
}

interface PublishStatusData {
  status?: string;
  fail_reason?: string;
  publicaly_available_post_id?: string[];
  publicly_available_post_id?: string[];
}

interface UserInfoData {
  user?: {
    open_id?: string;
    union_id?: string;
    display_name?: string;
    username?: string;
    profile_deep_link?: string;
    follower_count?: number;
    likes_count?: number;
    video_count?: number;
  };
}

interface VideoQueryData {
  videos?: Array<{
    id?: string;
    like_count?: number;
    comment_count?: number;
    share_count?: number;
    view_count?: number;
    share_url?: string;
  }>;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function clientKey(): string {
  return requireEnv("TIKTOK_CLIENT_KEY", PLATFORM);
}
function clientSecret(): string {
  return requireEnv("TIKTOK_CLIENT_SECRET", PLATFORM);
}

function tokenOf(account: ConnectedAccount): string {
  const token = account.tokens?.accessToken;
  if (!token) {
    throw new ConnectorError(
      "TikTok account has no access token; reconnect",
      PLATFORM,
      "auth_expired",
      false,
    );
  }
  return token;
}

function jsonHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json; charset=UTF-8",
    accept: "application/json",
  };
}

/**
 * TikTok always answers with `{ data, error: { code, message, log_id } }` and
 * uses `error.code === "ok"` for success - including on HTTP 200 responses that
 * actually failed, which is why this is wired into `checkBody` as well as
 * `mapError`.
 */
function errorToConnectorError(code: string, message: string): ConnectorError {
  if (code === "access_token_invalid" || code === "invalid_access_token" || code === "token_expired") {
    return new ConnectorError(
      `TikTok token is invalid or expired: ${message}`,
      PLATFORM,
      "auth_expired",
      false,
    );
  }
  if (code === "scope_not_authorized" || code === "scope_permission_missed") {
    return new ConnectorError(
      `TikTok is missing a scope (${code}): ${message}. Reconnect and grant ${TIKTOK_SCOPES.join(", ")}.`,
      PLATFORM,
      "auth_expired",
      false,
    );
  }
  if (code === "rate_limit_exceeded" || code === "spam_risk_too_many_posts" || code === "spam_risk") {
    return new ConnectorError(
      `TikTok rate limited the account (${code}): ${message}`,
      PLATFORM,
      "rate_limited",
      true,
    );
  }
  if (code === "url_ownership_unverified") {
    return new ConnectorError(
      `TikTok refused the media URL (${code}): ${message}. PULL_FROM_URL only accepts URLs on a domain verified in the TikTok developer portal.`,
      PLATFORM,
      "invalid_media",
      false,
    );
  }
  if (
    code === "file_format_check_failed" ||
    code === "duration_check_failed" ||
    code === "frame_rate_check_failed"
  ) {
    return new ConnectorError(
      `TikTok rejected the media (${code}): ${message}`,
      PLATFORM,
      "invalid_media",
      false,
    );
  }
  if (code === "privacy_level_option_mismatch") {
    return new ConnectorError(
      `TikTok rejected the privacy level (${code}): ${message}. An unaudited app may only post SELF_ONLY.`,
      PLATFORM,
      "rejected",
      false,
    );
  }
  return new ConnectorError(`TikTok rejected the request (${code}): ${message}`, PLATFORM, "rejected", false);
}

function mapTikTokError(status: number, body: unknown): ConnectorError | undefined {
  const error = (body as TikTokEnvelope<unknown>)?.error;
  if (error?.code && error.code !== "ok") {
    return errorToConnectorError(error.code, error.message ?? `HTTP ${status}`);
  }
  if (status === 401) {
    return new ConnectorError("TikTok token is invalid or expired", PLATFORM, "auth_expired", false);
  }
  if (status === 429) {
    return new ConnectorError("TikTok rate limited the app", PLATFORM, "rate_limited", true);
  }
  return undefined;
}

function checkTikTokBody(body: unknown): ConnectorError | undefined {
  const error = (body as TikTokEnvelope<unknown>)?.error;
  if (error?.code && error.code !== "ok") {
    return errorToConnectorError(error.code, error.message ?? error.code);
  }
  return undefined;
}

function http(context: Record<string, unknown> = {}): HttpOptions {
  return { platform: PLATFORM, context, mapError: mapTikTokError, checkBody: checkTikTokBody };
}

/**
 * Unaudited apps may only create `SELF_ONLY` (private) posts. We refuse to send
 * anything else unless the deployment has explicitly recorded that the audit
 * passed (`account.config.audited === true`).
 */
export function resolvePrivacyLevel(config: Record<string, unknown>): PrivacyLevel {
  const audited = config?.audited === true;
  const wanted = config?.privacyLevel as PrivacyLevel | undefined;
  if (!audited) return "SELF_ONLY";
  return wanted ?? "PUBLIC_TO_EVERYONE";
}

function postUrlFor(account: ConnectedAccount, postId?: string): string | undefined {
  const handle = account.handle ?? (account.config?.username as string | undefined);
  if (!handle || !postId) return undefined;
  return `https://www.tiktok.com/@${handle}/video/${postId}`;
}

async function postJson<T>(
  url: string,
  token: string,
  body: unknown,
  context: Record<string, unknown>,
): Promise<TikTokEnvelope<T>> {
  const { data } = await fetchJson<TikTokEnvelope<T>>(
    url,
    { method: "POST", headers: jsonHeaders(token), body: JSON.stringify(body) },
    http(context),
  );
  return data;
}

/* ------------------------------------------------------------------ */
/* connector                                                           */
/* ------------------------------------------------------------------ */

export const tiktokConnector: Connector = {
  id: PLATFORM,
  authKind: "oauth",
  capabilities: {
    // Every TikTok post carries media; the caption is never the post.
    text: false,
    image: true,
    video: true,
    carousel: true,
    nativeSchedule: false,
    insights: true,
    privateUntilReview: true,
    maxChars: MAX_CHARS,
    maxMedia: MAX_PHOTOS,
    imageAspects: ["9:16", "1:1"],
  },
  // The Content Posting API is documented (secondary sources) at ~6 requests
  // per minute per user, and a creator can only take ~15 direct posts a day.
  rateLimit: { limit: 6, windowMs: 60 * 60 * 1000 },

  wizard(brandKit: BrandKit | null, ctx: WizardContext): WizardStep[] {
    const handles = handleSuggestions(brandKit, ctx, 3);
    const handle = primaryHandle(brandKit, ctx);
    return [
      {
        kind: "create_account",
        title: "Create the TikTok account",
        url: "https://www.tiktok.com/signup",
        instructions: [
          "Sign up with the business email, then switch to a **Business account** in Settings -> Account -> Switch to Business Account so you get the analytics tab and the bio link.",
          `Handle suggestions: ${handles.map((h) => `\`@${h}\``).join(", ")}.`,
        ].join("\n\n"),
        prefill: [
          { label: "Name", value: ctx.businessName },
          { label: "Handle", value: `@${handle}` },
          { label: "Bio", value: bioFor(brandKit, PLATFORM, ctx), multiline: true },
          ...(ctx.websiteUrl ? [{ label: "Website", value: ctx.websiteUrl }] : []),
        ],
      },
      {
        kind: "configure",
        title: "Register the app and verify the media domain",
        url: "https://developers.tiktok.com/",
        instructions: [
          "Create a developer app, add **Login Kit** and the **Content Posting API** products, and add our callback URL.",
          "Direct Post pulls the video from a URL (`PULL_FROM_URL`), and TikTok only accepts URLs on a **domain you have verified** in the portal. Add the media CDN domain there before the first post.",
          "Then apply for the Content Posting API **audit**. Until it passes, every post we create is private (SELF_ONLY).",
        ].join("\n\n"),
        caveat:
          "Unaudited apps can only publish private posts, and only for up to 5 users. The audit takes 2-4 weeks and needs a demo video of the posting flow plus a published privacy policy.",
      },
      {
        kind: "connect_oauth",
        title: "Connect with TikTok",
        instructions: [
          "You will be sent to TikTok to approve the connection (Login Kit, OAuth 2.0 with PKCE).",
          `Requested scopes: ${TIKTOK_SCOPES.join(", ")}.`,
        ].join("\n\n"),
      },
      {
        kind: "verify",
        title: "Verify the TikTok connection",
        instructions:
          "We read /v2/user/info/ to confirm the token and store your open id, display name and follower count.",
      },
    ];
  },

  authUrl(input: AuthorizeInput): string {
    return buildAuthUrl(AUTHORIZE_URL, {
      // TikTok calls it client_key, not client_id.
      client_key: clientKey(),
      scope: TIKTOK_SCOPES.join(","),
      response_type: "code",
      redirect_uri: input.redirectUri,
      state: input.state,
      ...(input.codeVerifier
        ? { code_challenge: codeChallengeS256(input.codeVerifier), code_challenge_method: "S256" }
        : {}),
    });
  },

  async exchangeCode(code: string, input: AuthorizeInput) {
    const { data: raw } = await postForm<Record<string, unknown>>(
      `${API}/v2/oauth/token/`,
      {
        client_key: clientKey(),
        client_secret: clientSecret(),
        grant_type: "authorization_code",
        code,
        redirect_uri: input.redirectUri,
        code_verifier: input.codeVerifier,
      },
      http(),
    );
    const tokens = normalizeTokenResponse(raw, PLATFORM);
    const openId = typeof raw.open_id === "string" ? raw.open_id : undefined;

    const { data } = await fetchJson<TikTokEnvelope<UserInfoData>>(
      `${API}/v2/user/info/?fields=open_id,union_id,display_name,username,profile_deep_link`,
      { headers: { authorization: `Bearer ${tokens.accessToken}`, accept: "application/json" } },
      http(),
    );
    const user = data.data?.user ?? {};

    return {
      tokens,
      account: {
        externalId: user.open_id ?? openId ?? null,
        handle: user.username ?? null,
        config: {
          openId: user.open_id ?? openId ?? null,
          username: user.username ?? null,
          displayName: user.display_name ?? null,
          profileUrl: user.profile_deep_link ?? null,
          // Flipped to true by an operator once TikTok's audit passes.
          audited: false,
          privacyLevel: "SELF_ONLY" satisfies PrivacyLevel,
        },
      },
    };
  },

  async refresh(tokens: OAuthTokens): Promise<OAuthTokens> {
    if (!tokens.refreshToken) {
      throw new ConnectorError(
        "TikTok account has no refresh token; the user must reconnect",
        PLATFORM,
        "auth_expired",
        false,
      );
    }
    const { data: raw } = await postForm<Record<string, unknown>>(
      `${API}/v2/oauth/token/`,
      {
        client_key: clientKey(),
        client_secret: clientSecret(),
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
      },
      http(),
    );
    return normalizeTokenResponse(raw, PLATFORM, tokens);
  },

  async verify(account: ConnectedAccount): Promise<VerifyResult> {
    try {
      const { data } = await fetchJson<TikTokEnvelope<UserInfoData>>(
        `${API}/v2/user/info/?fields=open_id,display_name,username,profile_deep_link,follower_count`,
        { headers: { authorization: `Bearer ${tokenOf(account)}`, accept: "application/json" } },
        http(),
      );
      const user = data.data?.user ?? {};
      const audited = account.config?.audited === true;
      return {
        ok: true,
        handle: user.username ?? user.open_id,
        displayName: user.display_name,
        profileUrl:
          user.profile_deep_link ?? (user.username ? `https://www.tiktok.com/@${user.username}` : undefined),
        ...(audited
          ? {}
          : {
              warning:
                "This TikTok app has not passed the Content Posting API audit, so every post we publish is private (SELF_ONLY) and visible only to you.",
            }),
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async publish(account: ConnectedAccount, post: PublishablePost): Promise<PublishResult> {
    const privacyLevel = resolvePrivacyLevel(account.config ?? {});
    if (post.externalId) {
      return {
        externalId: post.externalId,
        url: postUrlFor(account, (account.config?.lastPostId as string | undefined) ?? undefined),
        visibility: privacyLevel === "PUBLIC_TO_EVERYONE" ? "public" : "private",
      };
    }

    const token = tokenOf(account);
    const context = { businessId: account.businessId, accountId: account.id, postId: post.id };

    const video = post.media.find((m) => m.kind === "video");
    const photos = post.media.filter((m) => m.kind === "image").slice(0, MAX_PHOTOS);
    if (!video && photos.length === 0) {
      throw new ConnectorError(
        "TikTok posts need a video or at least one photo; a caption alone is not a post",
        PLATFORM,
        "invalid_media",
        false,
      );
    }

    const caption = composeBody({
      body: post.body,
      hashtags: post.hashtags,
      linkUrl: post.linkUrl,
      platform: PLATFORM,
    });
    const title = (post.title?.trim() || caption).slice(0, MAX_TITLE_CHARS);

    const postInfo: Record<string, unknown> = {
      privacy_level: privacyLevel,
      disable_comment: false,
    };

    let envelope: TikTokEnvelope<PublishInitData>;
    if (video) {
      // PULL_FROM_URL: TikTok fetches the file itself, so the URL must live on a
      // domain verified in the developer portal.
      envelope = await postJson<PublishInitData>(
        `${API}/v2/post/publish/video/init/`,
        token,
        {
          post_info: { ...postInfo, title: caption.slice(0, MAX_CHARS) },
          source_info: { source: "PULL_FROM_URL", video_url: video.url },
        },
        context,
      );
    } else {
      envelope = await postJson<PublishInitData>(
        `${API}/v2/post/publish/content/init/`,
        token,
        {
          media_type: "PHOTO",
          post_mode: "DIRECT_POST",
          post_info: { ...postInfo, title, description: caption.slice(0, MAX_CHARS) },
          source_info: {
            source: "PULL_FROM_URL",
            photo_cover_index: 0,
            photo_images: photos.map((p) => p.url),
          },
        },
        context,
      );
    }

    const publishId = envelope.data?.publish_id;
    if (!publishId) {
      throw new ConnectorError("TikTok returned no publish_id", PLATFORM, "unknown", false);
    }

    const status = await pollPublishStatus(token, publishId, context);
    const postId =
      status?.publicaly_available_post_id?.[0] ?? status?.publicly_available_post_id?.[0] ?? undefined;

    logger.info(
      { ...context, platform: PLATFORM, publishId, status: status?.status, privacyLevel },
      "connector.tiktok.published",
    );

    return {
      externalId: publishId,
      url: postUrlFor(account, postId),
      visibility: privacyLevel === "PUBLIC_TO_EVERYONE" ? "public" : "private",
      raw: { status: status?.status, postId },
    };
  },

  async fetchInsights(
    account: ConnectedAccount,
    _since: string,
    posts: Array<{ id: string; externalId: string }>,
  ): Promise<MetricSnapshotInput[]> {
    const token = tokenOf(account);
    const capturedAt = new Date().toISOString();
    const out: MetricSnapshotInput[] = [];

    const { data: info } = await fetchJson<TikTokEnvelope<UserInfoData>>(
      `${API}/v2/user/info/?fields=follower_count,likes_count,video_count`,
      { headers: { authorization: `Bearer ${token}`, accept: "application/json" } },
      http(),
    );
    const user = info.data?.user ?? {};
    if (typeof user.follower_count === "number") {
      out.push({ metric: "followers", value: user.follower_count, capturedAt });
    }
    if (typeof user.likes_count === "number") {
      out.push({ metric: "likes", value: user.likes_count, capturedAt });
    }

    const ids = posts.map((p) => p.externalId).filter(Boolean);
    if (ids.length === 0) return out;

    const { data: query } = await fetchJson<TikTokEnvelope<VideoQueryData>>(
      `${API}/v2/video/query/?fields=id,like_count,comment_count,share_count,view_count,share_url`,
      {
        method: "POST",
        headers: jsonHeaders(token),
        body: JSON.stringify({ filters: { video_ids: ids.slice(0, 20) } }),
      },
      { ...http(), retries: 1 },
    );

    for (const video of query.data?.videos ?? []) {
      if (!video.id) continue;
      const base = { capturedAt, externalPostId: video.id };
      if (typeof video.view_count === "number")
        out.push({ metric: "views", value: video.view_count, ...base });
      if (typeof video.like_count === "number")
        out.push({ metric: "likes", value: video.like_count, ...base });
      if (typeof video.comment_count === "number") {
        out.push({ metric: "comments", value: video.comment_count, ...base });
      }
      if (typeof video.share_count === "number")
        out.push({ metric: "shares", value: video.share_count, ...base });
    }
    return out;
  },
};

async function pollPublishStatus(
  token: string,
  publishId: string,
  context: Record<string, unknown>,
): Promise<PublishStatusData | undefined> {
  let last: PublishStatusData | undefined;
  for (let attempt = 0; attempt < STATUS_POLL_ATTEMPTS; attempt += 1) {
    const envelope = await postJson<PublishStatusData>(
      `${API}/v2/post/publish/status/fetch/`,
      token,
      { publish_id: publishId },
      context,
    );
    last = envelope.data;
    const status = last?.status ?? "";
    if (status === "PUBLISH_COMPLETE" || status === "SEND_TO_USER_INBOX") return last;
    if (status === "FAILED") {
      throw new ConnectorError(
        `TikTok failed to publish the post: ${last?.fail_reason ?? "unknown reason"}`,
        PLATFORM,
        "rejected",
        false,
      );
    }
    await sleep(STATUS_POLL_INTERVAL_MS);
  }
  // Still processing: the post is accepted, the id is the publish_id, and the
  // next insights run will pick up the real post.
  return last;
}

export default tiktokConnector;
