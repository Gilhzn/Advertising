import type { BrandKit } from "@adv/shared";
import { logger } from "@adv/shared";
import { bioFor, longBioFor, taglineOf, type WizardContext } from "../brand.js";
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
import { downloadMedia, fetchJson, type HttpOptions } from "../http.js";
import { buildAuthUrl, exchangeAuthorizationCode, refreshWithRefreshToken, requireEnv } from "../oauth.js";
import { composeBody } from "../text.js";

const PLATFORM = "linkedin" as const;
const AUTH_HOST = "https://www.linkedin.com";
const API_HOST = "https://api.linkedin.com";
const MAX_CHARS = 3000;

/** `openid` + `profile` give us /v2/userinfo; `w_member_social` is the posting permission. */
export const LINKEDIN_SCOPES = ["openid", "profile", "w_member_social"];

/** `LinkedIn-Version` is a required YYYYMM header on every /rest/ call. */
function apiVersion(): string {
  return process.env.LINKEDIN_API_VERSION ?? "202505";
}

function restHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "linkedin-version": apiVersion(),
    "x-restli-protocol-version": "2.0.0",
    accept: "application/json",
  };
}

function http(context: Record<string, unknown> = {}): HttpOptions {
  return { platform: PLATFORM, context, mapError: mapLinkedInError };
}

interface LinkedInErrorBody {
  message?: string;
  serviceErrorCode?: number;
  status?: number;
  code?: string;
}

function mapLinkedInError(status: number, body: unknown): ConnectorError | undefined {
  const b = (body ?? {}) as LinkedInErrorBody;
  const message = b.message ?? `HTTP ${status}`;
  if (status === 401) {
    return new ConnectorError(
      `LinkedIn token expired or revoked: ${message}`,
      PLATFORM,
      "auth_expired",
      false,
    );
  }
  if (status === 403) {
    return new ConnectorError(
      `LinkedIn denied the request: ${message}. Check that w_member_social was granted.`,
      PLATFORM,
      "auth_expired",
      false,
    );
  }
  if (status === 422 || status === 400) {
    return new ConnectorError(`LinkedIn rejected the post: ${message}`, PLATFORM, "rejected", false);
  }
  if (status === 429) {
    return new ConnectorError(`LinkedIn throttled the app: ${message}`, PLATFORM, "rate_limited", true);
  }
  return undefined;
}

/**
 * LinkedIn "little text format": every reserved character in `commentary` must
 * be backslash-escaped even when it is not being used as markup.
 * Reserved set per the docs: \ | { } @ [ ] ( ) < > # * _ ~
 */
export function escapeCommentary(text: string): string {
  return text.replace(/[\\|{}@[\]()<>#*_~]/g, (ch) => `\\${ch}`);
}

function memberUrnOf(account: ConnectedAccount): string {
  const urn = account.config?.memberUrn;
  if (typeof urn !== "string" || !urn) {
    throw new ConnectorError("LinkedIn account has no member URN", PLATFORM, "not_configured", false);
  }
  return urn;
}

function tokenOf(account: ConnectedAccount): string {
  const token = account.tokens?.accessToken;
  if (!token) {
    throw new ConnectorError("LinkedIn token missing; reconnect", PLATFORM, "auth_expired", false);
  }
  return token;
}

function postUrl(urn: string): string {
  return `https://www.linkedin.com/feed/update/${urn}/`;
}

/* ------------------------------------------------------------------ */
/* image upload                                                        */
/* ------------------------------------------------------------------ */

interface InitializeUploadResponse {
  value: { uploadUrl: string; image: string; uploadUrlExpiresAt?: number };
}

/**
 * Two-step Images API: initializeUpload returns a signed `uploadUrl` plus the
 * `urn:li:image:…` the post will reference; the bytes are then PUT to that URL.
 * The upload URL expires, so both steps run back to back.
 */
async function uploadImage(
  token: string,
  ownerUrn: string,
  mediaUrl: string,
  context: Record<string, unknown>,
): Promise<string> {
  const { data } = await fetchJson<InitializeUploadResponse>(
    `${API_HOST}/rest/images?action=initializeUpload`,
    {
      method: "POST",
      headers: { ...restHeaders(token), "content-type": "application/json" },
      body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } }),
    },
    http(context),
  );

  const { uploadUrl, image } = data.value ?? {};
  if (!uploadUrl || !image) {
    throw new ConnectorError(
      "LinkedIn initializeUpload did not return an upload URL",
      PLATFORM,
      "unknown",
      false,
    );
  }

  const { buffer, mimeType } = await downloadMedia(mediaUrl, { platform: PLATFORM, context });
  await fetchJson<unknown>(
    uploadUrl,
    {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": mimeType },
      body: new Uint8Array(buffer),
    },
    { ...http(context), retries: 1 },
  );

  logger.debug({ ...context, platform: PLATFORM, image }, "connector.linkedin.image_uploaded");
  return image;
}

/* ------------------------------------------------------------------ */
/* connector                                                           */
/* ------------------------------------------------------------------ */

export const linkedinConnector: Connector = {
  id: PLATFORM,
  authKind: "oauth",
  capabilities: {
    text: true,
    image: true,
    // Video needs the Videos API with multipart part-upload; not wave 1.
    video: false,
    carousel: false,
    nativeSchedule: false,
    insights: false,
    maxChars: MAX_CHARS,
    maxMedia: 1,
    imageAspects: ["1:1", "4:5", "16:9", "1.91:1"],
  },
  // LinkedIn throttles per app+member per day; 100/day is far below any documented tier.
  rateLimit: { limit: 100, windowMs: 24 * 60 * 60 * 1000 },

  wizard(brandKit: BrandKit | null, ctx: WizardContext): WizardStep[] {
    const bio = bioFor(brandKit, PLATFORM, ctx);
    return [
      {
        kind: "create_account",
        title: "Use your personal LinkedIn profile",
        url: "https://www.linkedin.com/signup",
        instructions: [
          "Wave 1 posts to a **personal profile**, not a Company Page - personal posting is self-serve, Company Pages need LinkedIn's Community Management API review.",
          "If you do not have a profile yet, create one; otherwise just sign in.",
        ].join("\n\n"),
        prefill: [
          { label: "Headline", value: taglineOf(brandKit, ctx) },
          { label: "About", value: longBioFor(brandKit, PLATFORM, ctx), multiline: true },
          ...(ctx.websiteUrl ? [{ label: "Website", value: ctx.websiteUrl }] : []),
        ],
      },
      {
        kind: "configure",
        title: "Optional: create the Company Page",
        url: "https://www.linkedin.com/company/setup/new/",
        instructions: [
          "Create the Company Page now so the brand exists and you can link it from your profile, even though wave 1 publishes from your personal profile.",
          "Add yourself as an employee so posts can tag the company.",
        ].join("\n\n"),
        prefill: [
          { label: "Company name", value: ctx.businessName },
          { label: "Tagline", value: taglineOf(brandKit, ctx) },
          { label: "About", value: bio, multiline: true },
        ],
        caveat: "Publishing to a Company Page is wave 2 - it requires LinkedIn partner approval.",
      },
      {
        kind: "connect_oauth",
        title: "Connect with LinkedIn",
        instructions: [
          "You will be sent to LinkedIn to approve the connection.",
          `Requested: ${LINKEDIN_SCOPES.join(", ")} - sign-in plus permission to post on your behalf.`,
          "LinkedIn access tokens last 60 days; we refresh them automatically when refresh tokens are enabled for the app.",
        ].join("\n\n"),
      },
      {
        kind: "verify",
        title: "Verify the LinkedIn connection",
        instructions: "We read /v2/userinfo to confirm the token and store your member URN.",
      },
    ];
  },

  authUrl(input: AuthorizeInput): string {
    return buildAuthUrl(`${AUTH_HOST}/oauth/v2/authorization`, {
      response_type: "code",
      client_id: requireEnv("LINKEDIN_CLIENT_ID", PLATFORM),
      redirect_uri: input.redirectUri,
      state: input.state,
      scope: LINKEDIN_SCOPES.join(" "),
    });
  },

  async exchangeCode(code: string, input: AuthorizeInput) {
    const tokens = await exchangeAuthorizationCode(
      `${AUTH_HOST}/oauth/v2/accessToken`,
      {
        grant_type: "authorization_code",
        code,
        redirect_uri: input.redirectUri,
        client_id: requireEnv("LINKEDIN_CLIENT_ID", PLATFORM),
        client_secret: requireEnv("LINKEDIN_CLIENT_SECRET", PLATFORM),
      },
      { platform: PLATFORM },
    );

    const { data } = await fetchJson<{
      sub: string;
      name?: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
      email?: string;
    }>(
      `${API_HOST}/v2/userinfo`,
      { headers: { authorization: `Bearer ${tokens.accessToken}`, accept: "application/json" } },
      http(),
    );

    const memberUrn = `urn:li:person:${data.sub}`;
    return {
      tokens,
      account: {
        externalId: data.sub,
        handle: data.name ?? (`${data.given_name ?? ""} ${data.family_name ?? ""}`.trim() || data.sub),
        config: { memberUrn, displayName: data.name ?? null, authorType: "member" },
      },
    };
  },

  async refresh(tokens: OAuthTokens): Promise<OAuthTokens> {
    return refreshWithRefreshToken(
      `${AUTH_HOST}/oauth/v2/accessToken`,
      tokens,
      {
        client_id: requireEnv("LINKEDIN_CLIENT_ID", PLATFORM),
        client_secret: requireEnv("LINKEDIN_CLIENT_SECRET", PLATFORM),
      },
      { platform: PLATFORM },
    );
  },

  async verify(account: ConnectedAccount) {
    try {
      const { data } = await fetchJson<{ sub: string; name?: string }>(
        `${API_HOST}/v2/userinfo`,
        { headers: { authorization: `Bearer ${tokenOf(account)}`, accept: "application/json" } },
        http(),
      );
      return {
        ok: true,
        handle: data.name ?? data.sub,
        displayName: data.name,
        profileUrl: "https://www.linkedin.com/in/me/",
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async publish(account: ConnectedAccount, post: PublishablePost): Promise<PublishResult> {
    if (post.externalId) {
      return { externalId: post.externalId, url: postUrl(post.externalId) };
    }

    const token = tokenOf(account);
    const author = memberUrnOf(account);
    const context = { businessId: account.businessId, accountId: account.id, postId: post.id };

    if (post.media.some((m) => m.kind === "video")) {
      throw new ConnectorError(
        "LinkedIn video publishing is not enabled in wave 1; publish text or a single image",
        PLATFORM,
        "invalid_media",
        false,
      );
    }

    const commentary = escapeCommentary(
      composeBody({
        body: post.body,
        hashtags: post.hashtags,
        linkUrl: post.linkUrl,
        platform: PLATFORM,
      }),
    );

    const image = post.media.find((m) => m.kind === "image");
    const imageUrn = image ? await uploadImage(token, author, image.url, context) : undefined;

    const body: Record<string, unknown> = {
      author,
      commentary,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };
    if (imageUrn) {
      body.content = {
        media: {
          id: imageUrn,
          ...(image?.altText ? { altText: image.altText } : {}),
          ...(post.title ? { title: post.title } : {}),
        },
      };
    }

    const { data, headers } = await fetchJson<{ id?: string }>(
      `${API_HOST}/rest/posts`,
      {
        method: "POST",
        headers: { ...restHeaders(token), "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      http(context),
    );

    // 201 Created carries the post URN in x-restli-id; the body is usually empty.
    const urn = headers.get("x-restli-id") ?? headers.get("x-linkedin-id") ?? data?.id;
    if (!urn) {
      throw new ConnectorError(
        "LinkedIn accepted the post but returned no post URN",
        PLATFORM,
        "unknown",
        false,
      );
    }

    logger.info({ ...context, platform: PLATFORM, externalId: urn }, "connector.linkedin.published");
    return { externalId: urn, url: postUrl(urn) };
  },

  /**
   * No analytics for personal profiles: LinkedIn's organic analytics
   * (organizationalEntityShareStatistics) is Company-Page-only and behind the
   * Community Management API review.
   */
  async fetchInsights(): Promise<MetricSnapshotInput[]> {
    return [];
  },
};

export default linkedinConnector;
