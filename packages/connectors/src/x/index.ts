import type { BrandKit } from "@adv/shared";
import { logger } from "@adv/shared";
import { bioFor, handleSuggestions, primaryHandle, taglineOf, type WizardContext } from "../brand.js";
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
import { downloadMedia, fetchJson, type HttpOptions, sleep } from "../http.js";
import {
  buildAuthUrl,
  codeChallengeS256,
  exchangeAuthorizationCode,
  refreshWithRefreshToken,
  requireEnv,
} from "../oauth.js";
import { composeBody, splitThread } from "../text.js";

const PLATFORM = "x" as const;
const API = "https://api.x.com";
const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const MAX_CHARS = 280;
const MAX_IMAGES = 4;
/** 4 MB is the chunk size the official sample uses. */
const CHUNK_BYTES = 4 * 1024 * 1024;
/**
 * X accepts 512 MB videos, but we buffer the asset in memory before chunking,
 * so the connector caps itself well below that. Marketing clips are seconds long.
 */
const MAX_VIDEO_BYTES = 64 * 1024 * 1024;

/* ------------------------------------------------------------------ */
/* pricing                                                             */
/* ------------------------------------------------------------------ */

/** Pay-per-use price of a post without a link (see NOTES.md). */
export const COST_PER_POST_USD = 0.015;
/** Pay-per-use price of a post that contains a link - 13x the plain price. */
export const COST_PER_LINK_POST_USD = 0.2;

/**
 * `media.write` is not in the brief but the official X sample requests it for
 * the v2 media upload; without it INIT answers 403. See NOTES.md.
 */
export const X_SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"];

/* ------------------------------------------------------------------ */
/* wire types                                                          */
/* ------------------------------------------------------------------ */

interface CreatePostResponse {
  data?: { id: string; text?: string };
}

interface MediaUploadData {
  id: string;
  media_key?: string;
  expires_after_secs?: number;
  processing_info?: { state: string; check_after_secs?: number; progress_percent?: number };
}

interface XUser {
  id: string;
  name?: string;
  username?: string;
  public_metrics?: {
    followers_count?: number;
    following_count?: number;
    post_count?: number;
    tweet_count?: number;
    like_count?: number;
  };
}

interface XPost {
  id: string;
  public_metrics?: {
    impression_count?: number;
    like_count?: number;
    reply_count?: number;
    repost_count?: number;
    /** older spelling still returned by some edges */
    retweet_count?: number;
    quote_count?: number;
    bookmark_count?: number;
  };
  non_public_metrics?: {
    impression_count?: number;
    url_link_clicks?: number;
    user_profile_clicks?: number;
  };
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function clientId(): string {
  return requireEnv("X_CLIENT_ID", PLATFORM);
}
function clientSecret(): string {
  return requireEnv("X_CLIENT_SECRET", PLATFORM);
}

function tokenOf(account: ConnectedAccount): string {
  const token = account.tokens?.accessToken;
  if (!token) {
    throw new ConnectorError("X account has no access token; reconnect", PLATFORM, "auth_expired", false);
  }
  return token;
}

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, accept: "application/json" };
}

export function postUrl(handle: string | null | undefined, id: string): string {
  return `https://x.com/${handle || "i"}/status/${id}`;
}

interface XProblem {
  title?: string;
  detail?: string;
  type?: string;
  status?: number;
  errors?: Array<{ message?: string; parameters?: unknown }>;
  reason?: string;
}

/**
 * v2 answers with RFC 7807 problem objects: `{ title, detail, type, status }`.
 * The `type` URI is the stable discriminator.
 */
function mapXError(status: number, body: unknown): ConnectorError | undefined {
  const b = (body ?? {}) as XProblem;
  const type = b.type ?? "";
  const message = b.detail ?? b.title ?? b.errors?.[0]?.message ?? `HTTP ${status}`;

  if (status === 401 || type.endsWith("unauthorized") || b.reason === "client-not-enrolled") {
    return new ConnectorError(`X token is invalid or expired: ${message}`, PLATFORM, "auth_expired", false);
  }
  if (status === 403) {
    return new ConnectorError(
      `X refused the request: ${message}. Check the app's scopes (${X_SCOPES.join(" ")}) and that billing is attached.`,
      PLATFORM,
      "auth_expired",
      false,
    );
  }
  if (status === 429 || type.endsWith("usage-capped")) {
    return new ConnectorError(`X rate limited: ${message}`, PLATFORM, "rate_limited", true);
  }
  if (type.endsWith("payment-required") || status === 402) {
    return new ConnectorError(
      `X rejected the post for billing reasons: ${message}. X is pay-per-use ($${COST_PER_POST_USD}/post, $${COST_PER_LINK_POST_USD} with a link).`,
      PLATFORM,
      "not_configured",
      false,
    );
  }
  if (status === 400 && /media|image|video/i.test(message)) {
    return new ConnectorError(`X rejected the media: ${message}`, PLATFORM, "invalid_media", false);
  }
  return undefined;
}

function http(context: Record<string, unknown> = {}): HttpOptions {
  return { platform: PLATFORM, context, mapError: mapXError };
}

/* ------------------------------------------------------------------ */
/* media upload (v2 chunked INIT / APPEND / FINALIZE / STATUS)          */
/* ------------------------------------------------------------------ */

function mediaCategory(mime: string): string {
  if (mime.startsWith("video/")) return "tweet_video";
  if (mime === "image/gif") return "tweet_gif";
  return "tweet_image";
}

function uploadUrl(params: Record<string, string | number>): string {
  const url = new URL(`${API}/2/media/upload`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  return url.toString();
}

/**
 * Uploads one asset and returns its media id. Verified against
 * `xdevplatform/samples@main:python/media/media_upload_v2.py`: INIT and
 * FINALIZE take their `command` in the **query string**, APPEND sends
 * multipart form data, STATUS is a GET.
 */
export async function uploadMedia(
  token: string,
  media: PublishablePost["media"][number],
  context: Record<string, unknown>,
): Promise<string> {
  const { buffer, mimeType } = await downloadMedia(media.url, {
    platform: PLATFORM,
    context,
    maxBytes: media.kind === "video" ? MAX_VIDEO_BYTES : undefined,
  });
  const type = media.mimeType ?? mimeType;

  const init = await fetchJson<{ data: MediaUploadData }>(
    uploadUrl({
      command: "INIT",
      media_type: type,
      total_bytes: buffer.byteLength,
      media_category: mediaCategory(type),
    }),
    { method: "POST", headers: authHeaders(token) },
    http(context),
  );
  const mediaId = init.data.data?.id;
  if (!mediaId) {
    throw new ConnectorError("X media INIT returned no media id", PLATFORM, "unknown", false);
  }

  for (let offset = 0, segment = 0; offset < buffer.byteLength; offset += CHUNK_BYTES, segment += 1) {
    const chunk = buffer.subarray(offset, Math.min(offset + CHUNK_BYTES, buffer.byteLength));
    const form = new FormData();
    form.set("command", "APPEND");
    form.set("media_id", mediaId);
    form.set("segment_index", String(segment));
    const bytes = new Uint8Array(chunk.byteLength);
    bytes.set(chunk);
    form.set("media", new Blob([bytes], { type: "application/octet-stream" }), "chunk");
    await fetchJson<unknown>(
      `${API}/2/media/upload`,
      { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form },
      http(context),
    );
  }

  const finalize = await fetchJson<{ data: MediaUploadData }>(
    uploadUrl({ command: "FINALIZE", media_id: mediaId }),
    { method: "POST", headers: authHeaders(token) },
    http(context),
  );

  let info = finalize.data.data?.processing_info;
  for (let attempt = 0; info && info.state !== "succeeded" && attempt < 10; attempt += 1) {
    if (info.state === "failed") {
      throw new ConnectorError("X failed to process the uploaded media", PLATFORM, "invalid_media", false);
    }
    await sleep(Math.max(1, info.check_after_secs ?? 1) * 1000);
    const status = await fetchJson<{ data: MediaUploadData }>(
      uploadUrl({ command: "STATUS", media_id: mediaId }),
      { headers: authHeaders(token) },
      http(context),
    );
    info = status.data.data?.processing_info;
  }

  logger.debug({ ...context, platform: PLATFORM, mediaId }, "connector.x.media_uploaded");
  return mediaId;
}

/* ------------------------------------------------------------------ */
/* cost                                                                */
/* ------------------------------------------------------------------ */

function threadParts(post: PublishablePost): string[] {
  const body = composeBody({
    body: post.body,
    hashtags: post.hashtags,
    linkUrl: post.linkUrl,
    platform: PLATFORM,
    maxChars: Number.MAX_SAFE_INTEGER,
  });
  return splitThread(body, MAX_CHARS);
}

/**
 * X bills per created post, and 13x more for a post carrying a link. A thread
 * therefore costs `(n-1) * $0.015 + $0.20` when one of its posts has the link.
 */
export function estimateCostUsd(post: PublishablePost): number {
  const parts = threadParts(post);
  const link = post.linkUrl?.trim();
  const linkParts = link ? parts.filter((p) => p.includes(link)).length : 0;
  const plain = parts.length - linkParts;
  return Math.round((plain * COST_PER_POST_USD + linkParts * COST_PER_LINK_POST_USD) * 10_000) / 10_000;
}

/* ------------------------------------------------------------------ */
/* connector                                                           */
/* ------------------------------------------------------------------ */

export const xConnector: Connector = {
  id: PLATFORM,
  authKind: "oauth",
  capabilities: {
    text: true,
    image: true,
    video: true,
    carousel: false,
    nativeSchedule: false,
    insights: true,
    costPerPostUsd: COST_PER_POST_USD,
    maxChars: MAX_CHARS,
    maxMedia: MAX_IMAGES,
    imageAspects: ["16:9", "1:1", "4:5"],
  },
  // Conservative: X is pay-per-use, so the limiter is a spend guard as much as
  // a rate guard. 25 posts / 15 minutes is far under any documented ceiling.
  rateLimit: { limit: 25, windowMs: 15 * 60 * 1000 },

  wizard(brandKit: BrandKit | null, ctx: WizardContext): WizardStep[] {
    const handles = handleSuggestions(brandKit, ctx, 3);
    const handle = primaryHandle(brandKit, ctx);
    return [
      {
        kind: "create_account",
        title: "Create the X account",
        url: "https://x.com/i/flow/signup",
        instructions: [
          "Sign up with the business email and confirm it - X blocks posting from unconfirmed accounts.",
          `Pick a handle - suggestions: ${handles.map((h) => `\`@${h}\``).join(", ")}.`,
        ].join("\n\n"),
        prefill: [
          { label: "Name", value: ctx.businessName },
          { label: "Handle", value: `@${handle}` },
        ],
      },
      {
        kind: "configure",
        title: "Fill in the profile and add the developer app",
        url: "https://developer.x.com/en/portal/dashboard",
        instructions: [
          "Set the avatar, header, bio and website link from the brand kit.",
          "Then open the developer portal with the same account, create a project + app, turn on **User authentication settings** with OAuth 2.0, type *Web App*, and add our callback URL.",
          "Attach a payment method: the X API is **pay-per-use**.",
        ].join("\n\n"),
        prefill: [
          { label: "Name", value: ctx.businessName },
          { label: "Bio", value: bioFor(brandKit, PLATFORM, ctx), multiline: true },
          { label: "Tagline", value: taglineOf(brandKit, ctx) },
          ...(ctx.websiteUrl ? [{ label: "Website", value: ctx.websiteUrl }] : []),
        ],
        caveat: `Posting costs about $${COST_PER_POST_USD} per post and $${COST_PER_LINK_POST_USD} per post that contains a link. We show the estimated cost on every scheduled X post.`,
      },
      {
        kind: "connect_oauth",
        title: "Connect with X",
        instructions: [
          "You will be sent to X to approve the connection (OAuth 2.0 with PKCE).",
          `Requested scopes: ${X_SCOPES.join(", ")}. \`offline.access\` is what lets us refresh the token instead of asking you to reconnect every two hours.`,
        ].join("\n\n"),
      },
      {
        kind: "verify",
        title: "Verify the X connection",
        instructions: "We read /2/users/me to confirm the token and store your user id and handle.",
      },
    ];
  },

  authUrl(input: AuthorizeInput): string {
    if (!input.codeVerifier) {
      throw new ConnectorError("X requires PKCE; no code verifier was generated", PLATFORM, "unknown", false);
    }
    return buildAuthUrl(AUTHORIZE_URL, {
      response_type: "code",
      client_id: clientId(),
      redirect_uri: input.redirectUri,
      scope: X_SCOPES.join(" "),
      state: input.state,
      code_challenge: codeChallengeS256(input.codeVerifier),
      code_challenge_method: "S256",
    });
  },

  async exchangeCode(code: string, input: AuthorizeInput) {
    const tokens = await exchangeAuthorizationCode(
      `${API}/2/oauth2/token`,
      {
        grant_type: "authorization_code",
        code,
        redirect_uri: input.redirectUri,
        code_verifier: input.codeVerifier ?? "challenge",
      },
      { platform: PLATFORM, basicAuth: { clientId: clientId(), clientSecret: clientSecret() } },
    );

    const { data } = await fetchJson<{ data: XUser }>(
      `${API}/2/users/me?user.fields=public_metrics,username,name`,
      { headers: authHeaders(tokens.accessToken) },
      http(),
    );
    const user = data.data;
    return {
      tokens,
      account: {
        externalId: user.id,
        handle: user.username ?? null,
        config: { userId: user.id, username: user.username ?? null, displayName: user.name ?? null },
      },
    };
  },

  async refresh(tokens: OAuthTokens): Promise<OAuthTokens> {
    return refreshWithRefreshToken(
      `${API}/2/oauth2/token`,
      tokens,
      {},
      {
        platform: PLATFORM,
        basicAuth: { clientId: clientId(), clientSecret: clientSecret() },
      },
    );
  },

  async verify(account: ConnectedAccount): Promise<VerifyResult> {
    try {
      const { data } = await fetchJson<{ data: XUser }>(
        `${API}/2/users/me?user.fields=public_metrics,username,name`,
        { headers: authHeaders(tokenOf(account)) },
        http(),
      );
      const user = data.data;
      return {
        ok: true,
        handle: user.username ?? user.id,
        displayName: user.name ?? user.username,
        profileUrl: `https://x.com/${user.username ?? "i"}`,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  estimatedCostUsd: estimateCostUsd,

  async publish(account: ConnectedAccount, post: PublishablePost): Promise<PublishResult> {
    const handle = account.handle ?? (account.config?.username as string | undefined) ?? null;
    if (post.externalId) {
      return { externalId: post.externalId, url: postUrl(handle, post.externalId) };
    }

    const token = tokenOf(account);
    const context = { businessId: account.businessId, accountId: account.id, postId: post.id };
    const parts = threadParts(post);
    if (parts.length === 0) {
      throw new ConnectorError("Post body is empty", PLATFORM, "rejected", false);
    }

    const media = post.media.slice(0, post.media.some((m) => m.kind === "video") ? 1 : MAX_IMAGES);
    const mediaIds: string[] = [];
    for (const item of media) mediaIds.push(await uploadMedia(token, item, context));

    let rootId: string | undefined;
    let parentId: string | undefined;

    for (const [index, text] of parts.entries()) {
      const body: Record<string, unknown> = { text };
      if (index === 0 && mediaIds.length > 0) body.media = { media_ids: mediaIds };
      if (parentId) body.reply = { in_reply_to_tweet_id: parentId };

      const { data } = await fetchJson<CreatePostResponse>(
        `${API}/2/tweets`,
        {
          method: "POST",
          headers: { ...authHeaders(token), "content-type": "application/json" },
          body: JSON.stringify(body),
        },
        http(context),
      );
      const id = data.data?.id;
      if (!id) {
        throw new ConnectorError("X accepted the post but returned no id", PLATFORM, "unknown", false);
      }
      parentId = id;
      rootId ??= id;
    }

    const externalId = rootId as string;
    const costUsd = estimateCostUsd(post);
    logger.info({ ...context, platform: PLATFORM, externalId, costUsd }, "connector.x.published");
    return {
      externalId,
      url: postUrl(handle, externalId),
      raw: { parts: parts.length, costUsd, mediaIds },
    };
  },

  async fetchInsights(
    account: ConnectedAccount,
    _since: string,
    posts: Array<{ id: string; externalId: string }>,
  ): Promise<MetricSnapshotInput[]> {
    const token = tokenOf(account);
    const headers = authHeaders(token);
    const capturedAt = new Date().toISOString();
    const out: MetricSnapshotInput[] = [];

    const { data: me } = await fetchJson<{ data: XUser }>(
      `${API}/2/users/me?user.fields=public_metrics`,
      { headers },
      http(),
    );
    const followers = me.data?.public_metrics?.followers_count;
    if (typeof followers === "number") out.push({ metric: "followers", value: followers, capturedAt });

    const ids = posts.map((p) => p.externalId).filter(Boolean);
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100).join(",");
      let tweets: XPost[] = [];
      try {
        const { data } = await fetchJson<{ data?: XPost[] }>(
          `${API}/2/tweets?ids=${encodeURIComponent(batch)}&tweet.fields=public_metrics,non_public_metrics`,
          { headers },
          { ...http(), retries: 1 },
        );
        tweets = data.data ?? [];
      } catch (err) {
        // non_public_metrics needs user context on posts we own and is rejected
        // for anything else; fall back to the public counters rather than
        // losing the whole batch.
        if (err instanceof ConnectorError && (err.code === "rejected" || err.code === "auth_expired")) {
          const { data } = await fetchJson<{ data?: XPost[] }>(
            `${API}/2/tweets?ids=${encodeURIComponent(batch)}&tweet.fields=public_metrics`,
            { headers },
            { ...http(), retries: 1 },
          );
          tweets = data.data ?? [];
        } else {
          throw err;
        }
      }

      for (const tweet of tweets) {
        const base = { capturedAt, externalPostId: tweet.id };
        const pm = tweet.public_metrics ?? {};
        const npm = tweet.non_public_metrics ?? {};
        const impressions = npm.impression_count ?? pm.impression_count;
        if (typeof impressions === "number") out.push({ metric: "impressions", value: impressions, ...base });
        if (typeof pm.like_count === "number") out.push({ metric: "likes", value: pm.like_count, ...base });
        if (typeof pm.reply_count === "number")
          out.push({ metric: "replies", value: pm.reply_count, ...base });
        const reposts = pm.repost_count ?? pm.retweet_count;
        if (typeof reposts === "number") out.push({ metric: "reposts", value: reposts, ...base });
        if (typeof npm.url_link_clicks === "number") {
          out.push({ metric: "clicks", value: npm.url_link_clicks, ...base });
        }
      }
    }
    return out;
  },
};

export default xConnector;
