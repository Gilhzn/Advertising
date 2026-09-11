import type { BrandKit, MetricName } from "@adv/shared";
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
import {
  exchangeForLongLivedUserToken,
  exchangeMetaCodeForUserToken,
  flattenInsights,
  graphGet,
  graphPost,
  listPages,
  META_SCOPES,
  type MetaPage,
  metaAuthUrl,
  pageTokenFor,
  pickPage,
} from "../meta/graph.js";
import { composeBody } from "../text.js";

const PLATFORM = "facebook" as const;
const MAX_CHARS = 63_206;
/** Meta requires a scheduled post to be at least 10 minutes in the future. */
const MIN_SCHEDULE_LEAD_MS = 10 * 60 * 1000;
const MAX_SCHEDULE_LEAD_MS = 75 * 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* account plumbing                                                   */
/* ------------------------------------------------------------------ */

/**
 * Token layout: `tokens.accessToken` is the **Page** access token (what every
 * publish and insights call uses) and `tokens.refreshToken` holds the long-lived
 * **user** token, which is the only thing that can mint a new Page token. Both
 * are encrypted at rest by the db layer; `config` keeps only non-secret ids.
 */
function pageTokenOf(account: ConnectedAccount): string {
  const token = account.tokens?.accessToken;
  if (!token) {
    throw new ConnectorError(
      "Facebook Page token missing; reconnect the Page",
      PLATFORM,
      "auth_expired",
      false,
    );
  }
  return token;
}

function pageIdOf(account: ConnectedAccount): string {
  const id = account.config?.pageId ?? account.externalId;
  if (typeof id !== "string" || !id) {
    throw new ConnectorError("Facebook account has no pageId", PLATFORM, "not_configured", false);
  }
  return id;
}

function accountFromPage(page: MetaPage, userId?: string) {
  return {
    externalId: page.id,
    handle: page.username ?? page.name,
    config: {
      pageId: page.id,
      pageName: page.name,
      pageUsername: page.username ?? null,
      pageUrl: page.link ?? `https://www.facebook.com/${page.id}`,
      ...(userId ? { metaUserId: userId } : {}),
    },
  };
}

function scheduleFor(post: PublishablePost): number | undefined {
  if (!post.scheduledAt) return undefined;
  const at = Date.parse(post.scheduledAt);
  if (!Number.isFinite(at)) return undefined;
  const lead = at - Date.now();
  if (lead < MIN_SCHEDULE_LEAD_MS) return undefined; // publish now, the worker is already late
  if (lead > MAX_SCHEDULE_LEAD_MS) {
    throw new ConnectorError(
      "Facebook can only schedule posts up to 75 days ahead",
      PLATFORM,
      "rejected",
      false,
    );
  }
  return Math.floor(at / 1000);
}

/* ------------------------------------------------------------------ */
/* insights metric mapping                                             */
/* ------------------------------------------------------------------ */

/**
 * Page-level metrics. Meta is mid-migration here (see NOTES.md): the classic
 * names are requested first and the `*_media_view*` replacements are requested
 * as a second, independent call so one deprecated name cannot blank the batch.
 */
const PAGE_METRICS = ["page_impressions_unique", "page_post_engagements", "page_fans"] as const;
const PAGE_METRICS_NEW = ["page_total_media_view_unique", "page_follows"] as const;

const PAGE_METRIC_MAP: Record<string, MetricName> = {
  page_impressions_unique: "reach",
  page_total_media_view_unique: "reach",
  // There is no "engagements" in METRIC_NAMES; `score` is our generic engagement bucket.
  page_post_engagements: "score",
  page_fans: "followers",
  page_follows: "followers",
};

const POST_METRICS = ["post_impressions_unique", "post_clicks"] as const;
const POST_METRIC_MAP: Record<string, MetricName> = {
  post_impressions_unique: "reach",
  post_clicks: "clicks",
};

interface PostEngagement {
  likes?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
  shares?: { count?: number };
}

/* ------------------------------------------------------------------ */
/* connector                                                           */
/* ------------------------------------------------------------------ */

export const facebookConnector: Connector = {
  id: PLATFORM,
  authKind: "oauth",
  capabilities: {
    text: true,
    image: true,
    video: true,
    carousel: true,
    nativeSchedule: true,
    insights: true,
    maxChars: MAX_CHARS,
    maxMedia: 10,
    imageAspects: ["1:1", "4:5", "16:9", "9:16"],
  },
  // Page-level: 4,800 calls per 24h per asset in Meta's published formula. We pace posts far below.
  rateLimit: { limit: 25, windowMs: 60 * 60 * 1000 },

  wizard(brandKit: BrandKit | null, ctx: WizardContext): WizardStep[] {
    const bio = bioFor(brandKit, PLATFORM, ctx);
    return [
      {
        kind: "create_account",
        title: "Create the Facebook Page",
        url: "https://www.facebook.com/pages/create",
        instructions: [
          "Create a Page from your personal Facebook account (a Page cannot exist on its own).",
          "Pick the category that matches the business, then paste the name and description below.",
        ].join("\n\n"),
        prefill: [
          { label: "Page name", value: ctx.businessName },
          { label: "Short description (255 chars)", value: bio, multiline: true },
          { label: "About", value: longBioFor(brandKit, PLATFORM, ctx), multiline: true },
          ...(ctx.websiteUrl ? [{ label: "Website", value: ctx.websiteUrl }] : []),
          ...(ctx.contactEmail ? [{ label: "Contact email", value: ctx.contactEmail }] : []),
        ],
      },
      {
        kind: "configure",
        title: "Check your Page role",
        url: "https://www.facebook.com/settings?tab=profile_access",
        instructions: [
          "You need **Facebook access with full control** of the Page for publishing to work.",
          `Optional but recommended: add the Page to a Business Portfolio at business.facebook.com so the connection survives personal-account changes.`,
          `Set the Page's short description to: “${taglineOf(brandKit, ctx)}”.`,
        ].join("\n\n"),
      },
      {
        kind: "connect_oauth",
        title: "Connect with Facebook",
        instructions: [
          "You will be sent to Facebook to approve the connection. **Grant every permission** - if you skip one, publishing or analytics will fail.",
          `Requested: ${META_SCOPES.join(", ")}.`,
          "On the Page selection screen, pick the Page you just created.",
        ].join("\n\n"),
        caveat:
          "Until our Meta app passes App Review, only people with a role on the app (admin/developer/tester) can complete this. Development mode works for your own Pages.",
      },
      {
        kind: "verify",
        title: "Verify the Page connection",
        instructions: "We read the Page profile and confirm the Page access token can publish.",
      },
    ];
  },

  authUrl(input: AuthorizeInput): string {
    return metaAuthUrl(PLATFORM, input);
  },

  async exchangeCode(code: string, input: AuthorizeInput) {
    const userTokens = await exchangeMetaCodeForUserToken(PLATFORM, code, input.redirectUri);
    const pages = await listPages(PLATFORM, userTokens.accessToken);
    const page = pickPage(pages);

    return {
      tokens: {
        accessToken: page.access_token,
        refreshToken: userTokens.accessToken,
        tokenType: "page",
        scopes: META_SCOPES,
        ...(userTokens.expiresAt ? { expiresAt: userTokens.expiresAt } : {}),
      } satisfies OAuthTokens,
      account: accountFromPage(page),
    };
  },

  /** Refreshes the long-lived *user* token. The Page token is re-derived in `refreshForAccount`. */
  async refresh(tokens: OAuthTokens): Promise<OAuthTokens> {
    const userToken = tokens.refreshToken;
    if (!userToken) {
      throw new ConnectorError(
        "No Facebook user token stored; the owner must reconnect the Page",
        PLATFORM,
        "auth_expired",
        false,
      );
    }
    const refreshed = await exchangeForLongLivedUserToken(PLATFORM, userToken);
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
    if (!userToken) {
      throw new ConnectorError(
        "No Facebook user token stored; the owner must reconnect the Page",
        PLATFORM,
        "auth_expired",
        false,
      );
    }
    const refreshedUser = await exchangeForLongLivedUserToken(PLATFORM, userToken);
    const page = await pageTokenFor(PLATFORM, refreshedUser.accessToken, pageIdOf(account));
    return {
      tokens: {
        accessToken: page.access_token,
        refreshToken: refreshedUser.accessToken,
        tokenType: "page",
        ...(account.tokens?.scopes ? { scopes: account.tokens.scopes } : {}),
        ...(refreshedUser.expiresAt ? { expiresAt: refreshedUser.expiresAt } : {}),
      } satisfies OAuthTokens,
      config: { ...account.config, pageName: page.name },
    };
  },

  async verify(account: ConnectedAccount) {
    try {
      const { data } = await graphGet<{ id: string; name: string; username?: string; link?: string }>(
        PLATFORM,
        pageIdOf(account),
        { fields: "id,name,username,link", access_token: pageTokenOf(account) },
      );
      return {
        ok: true,
        handle: data.username ?? data.name,
        displayName: data.name,
        profileUrl: data.link ?? `https://www.facebook.com/${data.id}`,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async publish(account: ConnectedAccount, post: PublishablePost): Promise<PublishResult> {
    if (post.externalId) {
      return { externalId: post.externalId, url: `https://www.facebook.com/${post.externalId}` };
    }

    const pageId = pageIdOf(account);
    const token = pageTokenOf(account);
    const context = { businessId: account.businessId, accountId: account.id, postId: post.id };

    const message = composeBody({
      body: post.body,
      hashtags: post.hashtags,
      linkUrl: post.linkUrl,
      platform: PLATFORM,
    });

    const scheduledPublishTime = scheduleFor(post);
    const scheduling = scheduledPublishTime
      ? { published: false, scheduled_publish_time: scheduledPublishTime }
      : {};

    const images = post.media.filter((m) => m.kind === "image");
    const videos = post.media.filter((m) => m.kind === "video");

    let id: string;

    if (videos.length > 0) {
      const video = videos[0];
      const { data } = await graphPost<{ id: string }>(
        PLATFORM,
        `${pageId}/videos`,
        {
          file_url: video?.url,
          description: message,
          title: post.title ?? undefined,
          access_token: token,
          ...scheduling,
        },
        context,
      );
      id = data.id;
    } else if (images.length === 1) {
      const { data } = await graphPost<{ id: string; post_id?: string }>(
        PLATFORM,
        `${pageId}/photos`,
        {
          url: images[0]?.url,
          caption: message,
          alt_text_custom: images[0]?.altText ?? undefined,
          access_token: token,
          ...(scheduledPublishTime ? scheduling : { published: true }),
        },
        context,
      );
      id = data.post_id ?? data.id;
    } else if (images.length > 1) {
      // Multi-photo: upload each as unpublished, then attach them to one feed post.
      const mediaFbids: string[] = [];
      for (const image of images.slice(0, 10)) {
        const { data } = await graphPost<{ id: string }>(
          PLATFORM,
          `${pageId}/photos`,
          {
            url: image.url,
            published: false,
            alt_text_custom: image.altText ?? undefined,
            access_token: token,
          },
          context,
        );
        mediaFbids.push(data.id);
      }
      const { data } = await graphPost<{ id: string }>(
        PLATFORM,
        `${pageId}/feed`,
        {
          message,
          attached_media: JSON.stringify(mediaFbids.map((fbid) => ({ media_fbid: fbid }))),
          access_token: token,
          ...scheduling,
        },
        context,
      );
      id = data.id;
    } else {
      const { data } = await graphPost<{ id: string }>(
        PLATFORM,
        `${pageId}/feed`,
        {
          message,
          link: post.linkUrl ?? undefined,
          access_token: token,
          ...scheduling,
        },
        context,
      );
      id = data.id;
    }

    logger.info(
      { ...context, platform: PLATFORM, externalId: id, scheduledPublishTime },
      "connector.facebook.published",
    );

    return {
      externalId: id,
      url: `https://www.facebook.com/${id}`,
      raw: scheduledPublishTime ? { scheduled_publish_time: scheduledPublishTime } : undefined,
    };
  },

  async fetchInsights(
    account: ConnectedAccount,
    since: string,
    posts: Array<{ id: string; externalId: string }>,
  ): Promise<MetricSnapshotInput[]> {
    const pageId = pageIdOf(account);
    const token = pageTokenOf(account);
    const context = { businessId: account.businessId, accountId: account.id };
    const out: MetricSnapshotInput[] = [];
    const capturedAt = new Date().toISOString();
    const sinceUnix = Math.floor(Date.parse(since) / 1000);

    /** Page insights are requested in two batches so a deprecated name cannot blank the other. */
    for (const metrics of [PAGE_METRICS, PAGE_METRICS_NEW]) {
      try {
        const { data } = await graphGet<Parameters<typeof flattenInsights>[0]>(
          PLATFORM,
          `${pageId}/insights`,
          {
            metric: metrics.join(","),
            period: "day",
            since: Number.isFinite(sinceUnix) ? sinceUnix : undefined,
            until: Math.floor(Date.now() / 1000),
            access_token: token,
          },
          context,
        );
        for (const point of flattenInsights(data)) {
          const metric = PAGE_METRIC_MAP[point.name];
          if (!metric) continue;
          out.push({ metric, value: point.value, capturedAt: point.endTime ?? capturedAt });
        }
      } catch (err) {
        // A retired metric name must not take the whole ingest down.
        logger.warn(
          { ...context, platform: PLATFORM, metrics, err: err instanceof Error ? err.message : err },
          "connector.facebook.page_insights_failed",
        );
      }
    }

    for (const post of posts) {
      try {
        const { data } = await graphGet<Parameters<typeof flattenInsights>[0]>(
          PLATFORM,
          `${post.externalId}/insights`,
          { metric: POST_METRICS.join(","), access_token: token },
          context,
        );
        for (const point of flattenInsights(data)) {
          const metric = POST_METRIC_MAP[point.name];
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
          "connector.facebook.post_insights_failed",
        );
      }

      // Engagement counters are plain edge summaries, not insights, and are not deprecated.
      try {
        const { data } = await graphGet<PostEngagement>(
          PLATFORM,
          post.externalId,
          { fields: "likes.summary(true),comments.summary(true),shares", access_token: token },
          context,
        );
        const base = { capturedAt, externalPostId: post.externalId };
        if (typeof data.likes?.summary?.total_count === "number") {
          out.push({ metric: "likes", value: data.likes.summary.total_count, ...base });
        }
        if (typeof data.comments?.summary?.total_count === "number") {
          out.push({ metric: "comments", value: data.comments.summary.total_count, ...base });
        }
        if (typeof data.shares?.count === "number") {
          out.push({ metric: "shares", value: data.shares.count, ...base });
        }
      } catch (err) {
        logger.warn(
          {
            ...context,
            platform: PLATFORM,
            externalId: post.externalId,
            err: err instanceof Error ? err.message : err,
          },
          "connector.facebook.post_engagement_failed",
        );
      }
    }

    return out;
  },
};

export default facebookConnector;
