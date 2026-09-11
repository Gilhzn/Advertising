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
import { sleep } from "../http.js";
import {
  exchangeForLongLivedUserToken,
  exchangeMetaCodeForUserToken,
  flattenInsights,
  graphGet,
  graphPost,
  listPages,
  META_SCOPES,
  metaAuthUrl,
  pageTokenFor,
  pickPage,
} from "../meta/graph.js";
import { composeBody } from "../text.js";

const PLATFORM = "instagram" as const;
const MAX_CAPTION = 2200;
const MAX_CAROUSEL = 10;
/** Container processing poll: we give video/reel transcoding at most 60s. */
const CONTAINER_POLL_TIMEOUT_MS = 60_000;
const CONTAINER_POLL_START_MS = 2_000;

type ContainerStatus = "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED";

/* ------------------------------------------------------------------ */
/* account plumbing                                                   */
/* ------------------------------------------------------------------ */

function igUserIdOf(account: ConnectedAccount): string {
  const id = account.config?.igUserId ?? account.externalId;
  if (typeof id !== "string" || !id) {
    throw new ConnectorError(
      "Instagram account has no igUserId; reconnect and pick a Business/Creator account linked to a Page",
      PLATFORM,
      "not_configured",
      false,
    );
  }
  return id;
}

function tokenOf(account: ConnectedAccount): string {
  const token = account.tokens?.accessToken;
  if (!token) {
    throw new ConnectorError("Instagram Page token missing; reconnect", PLATFORM, "auth_expired", false);
  }
  return token;
}

/* ------------------------------------------------------------------ */
/* insights metric mapping                                             */
/* ------------------------------------------------------------------ */

const USER_METRICS = ["reach", "follower_count", "profile_views"] as const;
const MEDIA_METRICS = ["reach", "likes", "comments", "saved", "shares", "views"] as const;

const USER_METRIC_MAP: Record<string, MetricName> = {
  reach: "reach",
  follower_count: "followers",
  profile_views: "views",
};

const MEDIA_METRIC_MAP: Record<string, MetricName> = {
  reach: "reach",
  likes: "likes",
  comments: "comments",
  saved: "saves",
  shares: "shares",
  views: "views",
};

/* ------------------------------------------------------------------ */
/* container flow                                                      */
/* ------------------------------------------------------------------ */

async function createContainer(
  igUserId: string,
  fields: Record<string, string | number | boolean | undefined>,
  token: string,
  context: Record<string, unknown>,
): Promise<string> {
  const { data } = await graphPost<{ id: string }>(
    PLATFORM,
    `${igUserId}/media`,
    { ...fields, access_token: token },
    context,
  );
  if (!data.id) {
    throw new ConnectorError("Instagram did not return a container id", PLATFORM, "unknown", false);
  }
  return data.id;
}

/**
 * Polls `?fields=status_code` with exponential backoff until the container is
 * FINISHED. Meta's guidance is one query per minute for at most 5 minutes; we
 * cap at 60s because the worker owns the job timeout.
 */
export async function waitForContainer(
  containerId: string,
  token: string,
  context: Record<string, unknown>,
  timeoutMs = CONTAINER_POLL_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let delay = CONTAINER_POLL_START_MS;

  for (;;) {
    const { data } = await graphGet<{ status_code?: ContainerStatus; status?: string }>(
      PLATFORM,
      containerId,
      { fields: "status_code,status", access_token: token },
      context,
    );
    const status = data.status_code;

    if (status === "FINISHED" || status === "PUBLISHED") return;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new ConnectorError(
        `Instagram container ${status}: ${data.status ?? "no detail"}. Check the media URL, format and aspect ratio.`,
        PLATFORM,
        "invalid_media",
        false,
      );
    }

    if (Date.now() + delay > deadline) {
      throw new ConnectorError(
        `Instagram media was still ${status ?? "IN_PROGRESS"} after ${timeoutMs}ms; the job will retry`,
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

export const instagramConnector: Connector = {
  id: PLATFORM,
  authKind: "oauth",
  capabilities: {
    // Instagram has no text-only post format.
    text: false,
    image: true,
    video: true,
    carousel: true,
    nativeSchedule: false,
    insights: true,
    maxChars: MAX_CAPTION,
    maxMedia: MAX_CAROUSEL,
    imageAspects: ["1:1", "4:5", "16:9", "9:16"],
  },
  // Hard platform rule: 100 API-published posts per rolling 24h (a carousel counts as one).
  rateLimit: { limit: 100, windowMs: 24 * 60 * 60 * 1000 },

  wizard(brandKit: BrandKit | null, ctx: WizardContext): WizardStep[] {
    const handle = primaryHandle(brandKit, ctx);
    const bio = bioFor(brandKit, PLATFORM, ctx);
    return [
      {
        kind: "create_account",
        title: "Create the Instagram account",
        url: "https://www.instagram.com/accounts/emailsignup/",
        instructions: [
          "Sign up with the business email (not a personal account).",
          `Use the handle below if it is free.`,
        ].join("\n\n"),
        prefill: [
          { label: "Username", value: handle },
          { label: "Name", value: ctx.businessName },
          { label: "Bio (150 chars)", value: bio, multiline: true },
          ...(ctx.websiteUrl ? [{ label: "Link in bio", value: ctx.websiteUrl }] : []),
        ],
      },
      {
        kind: "configure",
        title: "Switch to a Business account and link the Page",
        instructions: [
          "In the Instagram app: **Settings -> Account type and tools -> Switch to professional account** -> Business.",
          "Then **Settings -> Accounts Centre -> Sharing across profiles** (or Page settings in the app) and **link the Facebook Page** created in the Facebook step.",
          "Publishing via the API only works for a Business or Creator account that is linked to a Page - there is no way around this.",
        ].join("\n\n"),
        prefill: [{ label: "Category", value: "Product/Service" }],
        caveat:
          "A personal Instagram account cannot be published to by any API. If the switch is skipped, the connection will fail.",
      },
      {
        kind: "connect_oauth",
        title: "Connect with Facebook",
        instructions: [
          "Instagram is connected through the same Facebook login as the Page - you will not be asked for an Instagram password.",
          `Requested: ${META_SCOPES.join(", ")}.`,
          "Grant every permission, then pick the Page the Instagram account is linked to.",
        ].join("\n\n"),
      },
      {
        kind: "verify",
        title: "Verify the Instagram connection",
        instructions: `We resolve the Business account id from the Page and read the profile. Tagline for the bio: “${taglineOf(brandKit, ctx)}”.`,
      },
    ];
  },

  authUrl(input: AuthorizeInput): string {
    return metaAuthUrl(PLATFORM, input);
  },

  /** Reuses the Facebook flow, then resolves `instagram_business_account` from the chosen Page. */
  async exchangeCode(code: string, input: AuthorizeInput) {
    const userTokens = await exchangeMetaCodeForUserToken(PLATFORM, code, input.redirectUri);
    const pages = await listPages(PLATFORM, userTokens.accessToken);
    // Prefer a Page that actually has an Instagram account linked.
    const linked = pages.filter((p) => p.instagram_business_account?.id);
    const page = pickPage(linked.length > 0 ? linked : pages);
    const ig = page.instagram_business_account;

    if (!ig?.id) {
      throw new ConnectorError(
        `Page "${page.name}" has no linked Instagram Business account. Switch the Instagram account to Business and link it to this Page, then reconnect.`,
        PLATFORM,
        "not_configured",
        false,
      );
    }

    return {
      tokens: {
        accessToken: page.access_token,
        refreshToken: userTokens.accessToken,
        tokenType: "page",
        scopes: META_SCOPES,
        ...(userTokens.expiresAt ? { expiresAt: userTokens.expiresAt } : {}),
      } satisfies OAuthTokens,
      account: {
        externalId: ig.id,
        handle: ig.username ?? page.username ?? page.name,
        config: {
          igUserId: ig.id,
          igUsername: ig.username ?? null,
          pageId: page.id,
          pageName: page.name,
        },
      },
    };
  },

  async refresh(tokens: OAuthTokens): Promise<OAuthTokens> {
    if (!tokens.refreshToken) {
      throw new ConnectorError(
        "No Facebook user token stored; reconnect the Instagram account",
        PLATFORM,
        "auth_expired",
        false,
      );
    }
    const refreshed = await exchangeForLongLivedUserToken(PLATFORM, tokens.refreshToken);
    return {
      accessToken: tokens.accessToken,
      refreshToken: refreshed.accessToken,
      tokenType: "page",
      ...(tokens.scopes ? { scopes: tokens.scopes } : {}),
      ...(refreshed.expiresAt ? { expiresAt: refreshed.expiresAt } : {}),
    };
  },

  async refreshForAccount(account: ConnectedAccount) {
    const userToken = account.tokens?.refreshToken;
    const pageId = account.config?.pageId;
    if (!userToken || typeof pageId !== "string") {
      throw new ConnectorError(
        "Instagram account is missing the user token or pageId; reconnect",
        PLATFORM,
        "auth_expired",
        false,
      );
    }
    const refreshedUser = await exchangeForLongLivedUserToken(PLATFORM, userToken);
    const page = await pageTokenFor(PLATFORM, refreshedUser.accessToken, pageId);
    return {
      tokens: {
        accessToken: page.access_token,
        refreshToken: refreshedUser.accessToken,
        tokenType: "page",
        ...(account.tokens?.scopes ? { scopes: account.tokens.scopes } : {}),
        ...(refreshedUser.expiresAt ? { expiresAt: refreshedUser.expiresAt } : {}),
      } satisfies OAuthTokens,
      config: {
        ...account.config,
        igUserId: page.instagram_business_account?.id ?? account.config?.igUserId,
      },
    };
  },

  async verify(account: ConnectedAccount) {
    try {
      const { data } = await graphGet<{
        id: string;
        username?: string;
        name?: string;
        followers_count?: number;
      }>(PLATFORM, igUserIdOf(account), {
        fields: "id,username,name,followers_count",
        access_token: tokenOf(account),
      });
      return {
        ok: true,
        handle: data.username ?? data.id,
        displayName: data.name ?? data.username,
        profileUrl: data.username ? `https://www.instagram.com/${data.username}/` : undefined,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async publish(account: ConnectedAccount, post: PublishablePost): Promise<PublishResult> {
    if (post.externalId) {
      return { externalId: post.externalId, url: await permalinkFor(account, post.externalId) };
    }

    const igUserId = igUserIdOf(account);
    const token = tokenOf(account);
    const context = { businessId: account.businessId, accountId: account.id, postId: post.id };

    const media = post.media.slice(0, MAX_CAROUSEL);
    if (media.length === 0) {
      throw new ConnectorError(
        "Instagram requires at least one image or video; there is no text-only post",
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

    let containerId: string;

    if (media.length === 1) {
      const item = media[0];
      containerId =
        item?.kind === "video"
          ? await createContainer(
              igUserId,
              { video_url: item.url, media_type: "REELS", caption, share_to_feed: true },
              token,
              context,
            )
          : await createContainer(
              igUserId,
              { image_url: item?.url, caption, alt_text: item?.altText },
              token,
              context,
            );
      await waitForContainer(containerId, token, context);
    } else {
      // Carousel: every child is created with is_carousel_item, then wrapped.
      const children: string[] = [];
      for (const item of media) {
        const childId = await createContainer(
          igUserId,
          item.kind === "video"
            ? { video_url: item.url, media_type: "VIDEO", is_carousel_item: true }
            : { image_url: item.url, is_carousel_item: true, alt_text: item.altText },
          token,
          context,
        );
        children.push(childId);
      }
      for (const child of children) await waitForContainer(child, token, context);

      containerId = await createContainer(
        igUserId,
        { media_type: "CAROUSEL", children: children.join(","), caption },
        token,
        context,
      );
      await waitForContainer(containerId, token, context);
    }

    const { data } = await graphPost<{ id: string }>(
      PLATFORM,
      `${igUserId}/media_publish`,
      { creation_id: containerId, access_token: token },
      context,
    );

    logger.info({ ...context, platform: PLATFORM, externalId: data.id }, "connector.instagram.published");
    return { externalId: data.id, url: await permalinkFor(account, data.id), raw: { containerId } };
  },

  async fetchInsights(
    account: ConnectedAccount,
    since: string,
    posts: Array<{ id: string; externalId: string }>,
  ): Promise<MetricSnapshotInput[]> {
    const igUserId = igUserIdOf(account);
    const token = tokenOf(account);
    const context = { businessId: account.businessId, accountId: account.id };
    const capturedAt = new Date().toISOString();
    const out: MetricSnapshotInput[] = [];
    const sinceUnix = Math.floor(Date.parse(since) / 1000);

    try {
      const { data } = await graphGet<Parameters<typeof flattenInsights>[0]>(
        PLATFORM,
        `${igUserId}/insights`,
        {
          metric: USER_METRICS.join(","),
          period: "day",
          since: Number.isFinite(sinceUnix) ? sinceUnix : undefined,
          until: Math.floor(Date.now() / 1000),
          access_token: token,
        },
        context,
      );
      for (const point of flattenInsights(data)) {
        const metric = USER_METRIC_MAP[point.name];
        if (!metric) continue;
        out.push({ metric, value: point.value, capturedAt: point.endTime ?? capturedAt });
      }
    } catch (err) {
      logger.warn(
        { ...context, platform: PLATFORM, err: err instanceof Error ? err.message : err },
        "connector.instagram.user_insights_failed",
      );
    }

    for (const post of posts) {
      try {
        const { data } = await graphGet<Parameters<typeof flattenInsights>[0]>(
          PLATFORM,
          `${post.externalId}/insights`,
          { metric: MEDIA_METRICS.join(","), access_token: token },
          context,
        );
        for (const point of flattenInsights(data)) {
          const metric = MEDIA_METRIC_MAP[point.name];
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
          "connector.instagram.media_insights_failed",
        );
      }
    }

    return out;
  },
};

async function permalinkFor(account: ConnectedAccount, mediaId: string): Promise<string | undefined> {
  try {
    const { data } = await graphGet<{ permalink?: string }>(PLATFORM, mediaId, {
      fields: "permalink",
      access_token: tokenOf(account),
    });
    return data.permalink;
  } catch {
    return undefined;
  }
}

export default instagramConnector;
