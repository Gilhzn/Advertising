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
import { fetchJson, type HttpOptions, postForm } from "../http.js";
import { buildAuthUrl, exchangeAuthorizationCode, refreshWithRefreshToken, requireEnv } from "../oauth.js";
import { composeBody, truncateForPlatform } from "../text.js";

const PLATFORM = "reddit" as const;
const WWW = "https://www.reddit.com";
const OAUTH = "https://oauth.reddit.com";
const MAX_CHARS = 40_000;
const MAX_TITLE_CHARS = 300;
/** Subreddits and AutoModerator routinely remove posts from accounts younger than this. */
export const MIN_ACCOUNT_AGE_DAYS = 30;

export const REDDIT_SCOPES = ["identity", "submit", "read", "mysubreddits"];

/* ------------------------------------------------------------------ */
/* wire types                                                          */
/* ------------------------------------------------------------------ */

interface SubmitResponse {
  json?: {
    errors?: Array<[string, string, string | null] | string[]>;
    data?: { url?: string; id?: string; name?: string; websocket_url?: string | null };
  };
}

interface MeResponse {
  name?: string;
  id?: string;
  created_utc?: number;
  link_karma?: number;
  comment_karma?: number;
  total_karma?: number;
  is_suspended?: boolean;
  icon_img?: string;
}

interface InfoResponse {
  data?: {
    children?: Array<{
      kind?: string;
      data?: {
        name?: string;
        id?: string;
        score?: number;
        ups?: number;
        upvote_ratio?: number;
        num_comments?: number;
        permalink?: string;
      };
    }>;
  };
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function clientId(): string {
  return requireEnv("REDDIT_CLIENT_ID", PLATFORM);
}
function clientSecret(): string {
  return requireEnv("REDDIT_CLIENT_SECRET", PLATFORM);
}

/**
 * Reddit rejects (and shadow-throttles) requests without a descriptive
 * User-Agent that names the app and the owning redditor. The format is
 * `<platform>:<app id>:<version> (by /u/<handle>)` in Reddit's own wording; we
 * keep the short `adv-engine/0.1 by <handle>` shape the brief asked for.
 */
export function userAgent(handle?: string | null): string {
  const who = (handle ?? process.env.REDDIT_OWNER_HANDLE ?? "unknown").replace(/^\/?u\//, "");
  return `adv-engine/0.1 by ${who}`;
}

function headersFor(account: ConnectedAccount | null, token?: string): Record<string, string> {
  const handle = account?.handle ?? (account?.config?.username as string | undefined) ?? null;
  const headers: Record<string, string> = { "user-agent": userAgent(handle), accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

function tokenOf(account: ConnectedAccount): string {
  const token = account.tokens?.accessToken;
  if (!token) {
    throw new ConnectorError(
      "Reddit account has no access token; reconnect",
      PLATFORM,
      "auth_expired",
      false,
    );
  }
  return token;
}

interface RedditErrorBody {
  message?: string;
  error?: number | string;
  reason?: string;
  explanation?: string;
}

function mapRedditError(status: number, body: unknown): ConnectorError | undefined {
  const b = (body ?? {}) as RedditErrorBody;
  const message = b.explanation ?? b.message ?? String(b.error ?? `HTTP ${status}`);
  if (status === 401) {
    return new ConnectorError(
      `Reddit token is invalid or expired: ${message}`,
      PLATFORM,
      "auth_expired",
      false,
    );
  }
  if (status === 403) {
    return new ConnectorError(
      `Reddit refused the request: ${message}. The account may be banned from this subreddit or missing a scope.`,
      PLATFORM,
      "rejected",
      false,
    );
  }
  if (status === 429) {
    return new ConnectorError(`Reddit rate limited: ${message}`, PLATFORM, "rate_limited", true);
  }
  return undefined;
}

/**
 * `/api/submit` answers **HTTP 200** with the real outcome in
 * `json.errors: [["CODE", "explanation", field]]`. Anything left in that array
 * is a rejection (RATELIMIT, SUBREDDIT_NOTALLOWED, NO_TEXT, BAD_CAPTCHA…).
 */
function checkSubmitBody(body: unknown): ConnectorError | undefined {
  const errors = (body as SubmitResponse)?.json?.errors ?? [];
  if (errors.length === 0) return undefined;
  const first = errors[0] as string[];
  const code = String(first?.[0] ?? "UNKNOWN");
  const explanation = String(first?.[1] ?? code);
  if (code === "RATELIMIT") {
    // "you are doing that too much. try again in 8 minutes."
    const minutes = /(\d+)\s*minute/i.exec(explanation);
    const seconds = /(\d+)\s*second/i.exec(explanation);
    const waitMs = minutes ? Number(minutes[1]) * 60_000 : seconds ? Number(seconds[1]) * 1000 : 60_000;
    return new ConnectorError(
      `Reddit rate limited the submission: ${explanation}`,
      PLATFORM,
      "rate_limited",
      true,
      waitMs,
    );
  }
  return new ConnectorError(
    `Reddit rejected the submission (${code}): ${explanation}`,
    PLATFORM,
    "rejected",
    false,
  );
}

function http(context: Record<string, unknown> = {}): HttpOptions {
  return { platform: PLATFORM, context, mapError: mapRedditError };
}

/** `t3_1abcdef` -> the id Reddit's own URLs use. */
export function fullnameOf(data: { name?: string; id?: string } | undefined): string | undefined {
  if (data?.name) return data.name;
  return data?.id ? `t3_${data.id}` : undefined;
}

export function accountAgeDays(createdUtcSeconds: number | undefined, now = Date.now()): number | undefined {
  if (typeof createdUtcSeconds !== "number" || !Number.isFinite(createdUtcSeconds)) return undefined;
  return (now - createdUtcSeconds * 1000) / (24 * 60 * 60 * 1000);
}

function subredditOf(post: PublishablePost): string {
  const ref = post.communityRef?.trim().replace(/^\/?r\//i, "");
  if (!ref) {
    // Every Reddit post lands in someone else's community, so the caller must
    // have picked (and a human must have approved) a subreddit first.
    throw new ConnectorError(
      "Reddit posts must target a subreddit: post.communityRef is empty. A human has to approve the community before we publish.",
      PLATFORM,
      "rejected",
      false,
    );
  }
  return ref;
}

/* ------------------------------------------------------------------ */
/* connector                                                           */
/* ------------------------------------------------------------------ */

export const redditConnector: Connector = {
  id: PLATFORM,
  authKind: "oauth",
  capabilities: {
    text: true,
    // Image/video posts need the asset-lease upload plus a WebSocket to learn
    // the resulting post id - see NOTES.md. Wave 2 publishes self and link posts.
    image: false,
    video: false,
    carousel: false,
    nativeSchedule: false,
    insights: true,
    maxChars: MAX_CHARS,
    maxMedia: 0,
    imageAspects: ["1:1", "16:9", "4:5"],
  },
  // Sitewide Reddit throttles new/low-karma accounts to roughly one post per
  // 10 minutes, and subreddit etiquette is far stricter than that.
  rateLimit: { limit: 5, windowMs: 60 * 60 * 1000 },

  wizard(brandKit: BrandKit | null, ctx: WizardContext): WizardStep[] {
    const handles = handleSuggestions(brandKit, ctx, 3);
    const handle = primaryHandle(brandKit, ctx);
    return [
      {
        kind: "create_account",
        title: "Create (or pick) the Reddit account",
        url: "https://www.reddit.com/register/",
        instructions: [
          "Reddit rewards people, not brands. Use a real account with history if you have one - a brand-new account posting a link is removed on sight.",
          `If you do create one: suggestions \`u/${handles.join("`, `u/")}\`.`,
          `**Then wait.** Comment usefully in your target subreddits for 2-4 weeks before the first post; most communities gate on ${MIN_ACCOUNT_AGE_DAYS}+ days of age and 50-500 comment karma.`,
        ].join("\n\n"),
        prefill: [
          { label: "Username", value: `u/${handle}` },
          { label: "Profile bio", value: bioFor(brandKit, PLATFORM, ctx), multiline: true },
        ],
        caveat:
          "Never post the same text to more than one subreddit, and always disclose that you built the thing. Both are instant-ban behaviours.",
      },
      {
        kind: "configure",
        title: "Create the API app",
        url: "https://www.reddit.com/prefs/apps",
        instructions: [
          'Open preferences -> apps -> "create another app", choose **web app**, and set the redirect URI to our callback.',
          "Copy the client id (under the app name) and the secret into this deployment's `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`.",
          "New API apps can need manual approval from Reddit before they work for anyone but their owner.",
        ].join("\n\n"),
        caveat:
          "Reddit's API terms require approval (and a paid agreement) for commercial use. Review this before onboarding customers.",
      },
      {
        kind: "connect_oauth",
        title: "Connect with Reddit",
        instructions: [
          "You will be sent to Reddit to approve the connection.",
          `Requested scopes: ${REDDIT_SCOPES.join(", ")}, with \`duration=permanent\` so we get a refresh token instead of a one-hour session.`,
        ].join("\n\n"),
      },
      {
        kind: "verify",
        title: "Verify the Reddit connection",
        instructions:
          "We read /api/v1/me to confirm the token and check the account's age and karma - we warn you if the account is too young to post safely.",
      },
    ];
  },

  authUrl(input: AuthorizeInput): string {
    return buildAuthUrl(`${WWW}/api/v1/authorize`, {
      client_id: clientId(),
      response_type: "code",
      state: input.state,
      redirect_uri: input.redirectUri,
      duration: "permanent",
      scope: REDDIT_SCOPES.join(" "),
    });
  },

  async exchangeCode(code: string, input: AuthorizeInput) {
    const tokens = await exchangeAuthorizationCode(
      `${WWW}/api/v1/access_token`,
      { grant_type: "authorization_code", code, redirect_uri: input.redirectUri },
      {
        platform: PLATFORM,
        basicAuth: { clientId: clientId(), clientSecret: clientSecret() },
        headers: { "user-agent": userAgent() },
      },
    );

    const { data } = await fetchJson<MeResponse>(
      `${OAUTH}/api/v1/me`,
      { headers: headersFor(null, tokens.accessToken) },
      http(),
    );

    return {
      tokens,
      account: {
        externalId: data.id ?? null,
        handle: data.name ?? null,
        config: {
          username: data.name ?? null,
          createdUtc: data.created_utc ?? null,
          commentKarma: data.comment_karma ?? null,
        },
      },
    };
  },

  async refresh(tokens: OAuthTokens): Promise<OAuthTokens> {
    return refreshWithRefreshToken(
      `${WWW}/api/v1/access_token`,
      tokens,
      {},
      {
        platform: PLATFORM,
        basicAuth: { clientId: clientId(), clientSecret: clientSecret() },
        headers: { "user-agent": userAgent() },
      },
    );
  },

  async verify(account: ConnectedAccount): Promise<VerifyResult> {
    try {
      const { data } = await fetchJson<MeResponse>(
        `${OAUTH}/api/v1/me`,
        { headers: headersFor(account, tokenOf(account)) },
        http(),
      );
      const ageDays = accountAgeDays(data.created_utc);
      const karma = data.comment_karma ?? 0;
      const warnings: string[] = [];
      if (ageDays !== undefined && ageDays < MIN_ACCOUNT_AGE_DAYS) {
        warnings.push(
          `This Reddit account is ${Math.floor(ageDays)} days old. Most subreddits remove posts from accounts under ${MIN_ACCOUNT_AGE_DAYS} days.`,
        );
      }
      if (karma < 50) {
        warnings.push(`Comment karma is ${karma}; many communities require 50-500 before you can post.`);
      }
      if (data.is_suspended) warnings.push("This account is suspended and cannot post.");

      return {
        ok: !data.is_suspended,
        handle: data.name,
        displayName: data.name,
        profileUrl: data.name ? `${WWW}/user/${data.name}/` : undefined,
        ...(warnings.length ? { warning: warnings.join(" ") } : {}),
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async publish(account: ConnectedAccount, post: PublishablePost): Promise<PublishResult> {
    if (post.externalId) {
      return { externalId: post.externalId, url: postPermalink(post.externalId) };
    }

    const subreddit = subredditOf(post);
    const token = tokenOf(account);
    const context = {
      businessId: account.businessId,
      accountId: account.id,
      postId: post.id,
      subreddit,
    };

    const title = truncateForPlatform(post.title?.trim() || post.body.trim(), MAX_TITLE_CHARS);
    if (!title) throw new ConnectorError("Reddit posts need a title", PLATFORM, "rejected", false);

    if (post.media.length > 0) {
      logger.warn(
        { ...context, platform: PLATFORM, mediaCount: post.media.length },
        "connector.reddit.media_dropped",
      );
    }

    const flairId = (account.config?.flairId ?? account.config?.flair_id) as string | undefined;
    const flairText = account.config?.flairText as string | undefined;

    const fields: Record<string, string | number | boolean | undefined> = {
      api_type: "json",
      sr: subreddit,
      title,
      nsfw: false,
      spoiler: false,
      sendreplies: true,
      resubmit: false,
      validate_on_submit: true,
      flair_id: flairId,
      flair_text: flairId ? flairText : undefined,
    };

    if (post.linkUrl) {
      fields.kind = "link";
      fields.url = post.linkUrl;
      const body = composeBody({ body: post.body, hashtags: [], linkUrl: null, platform: PLATFORM });
      if (body) fields.text = body;
    } else {
      fields.kind = "self";
      fields.text = composeBody({ body: post.body, hashtags: [], linkUrl: null, platform: PLATFORM });
    }

    const { data } = await postForm<SubmitResponse>(`${OAUTH}/api/submit`, fields, {
      ...http(context),
      headers: headersFor(account, token),
      checkBody: checkSubmitBody,
    });

    const submitted = data.json?.data;
    const externalId = fullnameOf(submitted);
    if (!externalId) {
      throw new ConnectorError("Reddit accepted the post but returned no id", PLATFORM, "unknown", false);
    }

    logger.info({ ...context, platform: PLATFORM, externalId }, "connector.reddit.published");
    return {
      externalId,
      url: submitted?.url ?? postPermalink(externalId),
      visibility: "public",
      raw: { subreddit, kind: fields.kind },
    };
  },

  async fetchInsights(
    account: ConnectedAccount,
    _since: string,
    posts: Array<{ id: string; externalId: string }>,
  ): Promise<MetricSnapshotInput[]> {
    if (posts.length === 0) return [];
    const token = tokenOf(account);
    const capturedAt = new Date().toISOString();
    const out: MetricSnapshotInput[] = [];

    const ids = posts.map((p) => p.externalId).filter(Boolean);
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100).join(",");
      const { data } = await fetchJson<InfoResponse>(
        `${OAUTH}/api/info?id=${encodeURIComponent(batch)}`,
        { headers: headersFor(account, token) },
        { ...http(), retries: 1 },
      );
      for (const child of data.data?.children ?? []) {
        const d = child.data;
        const externalPostId = fullnameOf(d);
        if (!externalPostId) continue;
        const base = { capturedAt, externalPostId };
        const score = d?.score ?? d?.ups;
        if (typeof score === "number") out.push({ metric: "score", value: score, ...base });
        if (typeof d?.upvote_ratio === "number") {
          out.push({ metric: "upvote_ratio", value: d.upvote_ratio, ...base });
        }
        if (typeof d?.num_comments === "number") {
          out.push({ metric: "comments", value: d.num_comments, ...base });
        }
      }
    }
    return out;
  },
};

export function postPermalink(fullname: string): string {
  return `${WWW}/comments/${fullname.replace(/^t3_/, "")}/`;
}

export default redditConnector;
