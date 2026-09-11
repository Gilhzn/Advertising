import type { BrandKit } from "@adv/shared";
import { logger } from "@adv/shared";
import { longBioFor, taglineOf, type WizardContext } from "../brand.js";
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
import {
  googleAuthHeaders,
  googleAuthUrl,
  googleExchangeCode,
  googleHttp,
  googleRefresh,
  requireGoogleToken,
} from "../google/oauth.js";
import { downloadMedia, fetchJson } from "../http.js";
import { composeBody, truncateForPlatform } from "../text.js";

const PLATFORM = "youtube" as const;
const DATA_API = "https://www.googleapis.com/youtube/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3/videos";
const MAX_CHARS = 5000;
const MAX_TITLE_CHARS = 100;
/** `snippet.tags` is capped at 500 characters in total, not per tag. */
const MAX_TAGS_CHARS = 500;
/** We buffer the file before the resumable PUT, so this is a memory ceiling. */
const MAX_VIDEO_BYTES = 128 * 1024 * 1024;
/** "People & Blogs" - the safe default when we do not know the vertical. */
const DEFAULT_CATEGORY_ID = "22";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

/* ------------------------------------------------------------------ */
/* wire types                                                          */
/* ------------------------------------------------------------------ */

interface VideoResource {
  id?: string;
  snippet?: { title?: string; description?: string; tags?: string[]; channelId?: string };
  status?: { privacyStatus?: string; uploadStatus?: string; publishAt?: string };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
    favoriteCount?: string;
  };
}

interface ChannelResource {
  id?: string;
  snippet?: { title?: string; customUrl?: string; description?: string };
  statistics?: {
    viewCount?: string;
    subscriberCount?: string;
    videoCount?: string;
    hiddenSubscriberCount?: boolean;
  };
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function tokenOf(account: ConnectedAccount): string {
  return requireGoogleToken(PLATFORM, account.tokens?.accessToken);
}

function num(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function videoUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** Vertical or square clips under 3 minutes are Shorts; the tag helps classification. */
export function isVertical(media: PublishablePost["media"][number] | undefined): boolean {
  if (!media?.width || !media?.height) return false;
  return media.height >= media.width;
}

/** `#tag` -> `tag`, trimmed to YouTube's 500-character total budget. */
export function tagsFromHashtags(hashtags: string[]): string[] {
  const out: string[] = [];
  let used = 0;
  for (const raw of hashtags) {
    const tag = raw.trim().replace(/^#+/, "");
    if (!tag) continue;
    if (used + tag.length + 1 > MAX_TAGS_CHARS) break;
    out.push(tag);
    used += tag.length + 1;
  }
  return out;
}

export interface VideoMetadata {
  snippet: Record<string, unknown>;
  status: Record<string, unknown>;
}

/**
 * Builds the `snippet` + `status` resource. `privacyStatus` is `private` unless
 * the deployment has recorded that Google's compliance audit passed
 * (`config.audited === true`) - an unaudited project has its uploads forced
 * private by YouTube anyway, so we say so rather than pretending.
 */
export function buildVideoMetadata(account: ConnectedAccount, post: PublishablePost): VideoMetadata {
  const vertical = isVertical(post.media.find((m) => m.kind === "video"));
  const audited = account.config?.audited === true;

  const rawTitle = post.title?.trim() || post.body.trim();
  let title = truncateForPlatform(rawTitle, vertical ? MAX_TITLE_CHARS - 8 : MAX_TITLE_CHARS);
  if (vertical && !/#shorts/i.test(title)) title = `${title} #Shorts`;

  const description = truncateForPlatform(
    composeBody({ body: post.body, hashtags: post.hashtags, linkUrl: post.linkUrl, platform: PLATFORM }),
    MAX_CHARS,
  );

  const status: Record<string, unknown> = {
    privacyStatus: audited ? "public" : "private",
    selfDeclaredMadeForKids: false,
  };
  // publishAt only works on a private video, which is exactly what an
  // unaudited project produces; for an audited one we flip it back to private
  // so the scheduled release actually happens.
  if (post.scheduledAt) {
    status.privacyStatus = "private";
    status.publishAt = new Date(post.scheduledAt).toISOString();
  }

  return {
    snippet: {
      title,
      description,
      tags: tagsFromHashtags(post.hashtags),
      categoryId: (account.config?.categoryId as string | undefined) ?? DEFAULT_CATEGORY_ID,
      defaultLanguage: post.language,
      defaultAudioLanguage: post.language,
    },
    status,
  };
}

/* ------------------------------------------------------------------ */
/* connector                                                           */
/* ------------------------------------------------------------------ */

export const youtubeConnector: Connector = {
  id: PLATFORM,
  authKind: "oauth",
  capabilities: {
    text: false,
    image: false,
    video: true,
    carousel: false,
    // status.publishAt schedules the release natively - better than holding the
    // job in our scheduler, because the bytes are already on YouTube.
    nativeSchedule: true,
    insights: true,
    privateUntilReview: true,
    maxChars: MAX_CHARS,
    maxMedia: 1,
    imageAspects: ["9:16", "16:9"],
  },
  // `videos.insert` bills 1 unit against its own 100 calls/day project bucket
  // (since 1 June 2026). We stay far below that per account.
  rateLimit: { limit: 20, windowMs: 24 * 60 * 60 * 1000 },

  wizard(brandKit: BrandKit | null, ctx: WizardContext): WizardStep[] {
    return [
      {
        kind: "create_account",
        title: "Create the YouTube channel",
        url: "https://www.youtube.com/create_channel",
        instructions: [
          "Sign in with the business Google account and create a channel (a Brand Account channel, not your personal one, so ownership can be transferred later).",
          "Verify the channel by phone - unverified channels cannot upload videos longer than 15 minutes or set custom thumbnails.",
        ].join("\n\n"),
        prefill: [
          { label: "Channel name", value: ctx.businessName },
          { label: "Channel description", value: longBioFor(brandKit, PLATFORM, ctx), multiline: true },
          { label: "Tagline", value: taglineOf(brandKit, ctx) },
          ...(ctx.websiteUrl ? [{ label: "Website link", value: ctx.websiteUrl }] : []),
        ],
      },
      {
        kind: "configure",
        title: "Enable the YouTube Data API and request the audit",
        url: "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
        instructions: [
          "In Google Cloud, enable **YouTube Data API v3** and **YouTube Analytics API**, configure the OAuth consent screen, and add our callback URL to the OAuth client.",
          "Then submit the **API compliance audit**. Until it passes, every video this app uploads is forced to *private* by YouTube, no matter what we send.",
          "Upload quota since 1 June 2026: `videos.insert` costs 1 unit against a separate bucket capped at **100 calls/day** per Cloud project.",
        ].join("\n\n"),
        caveat:
          "Uploads stay private until the compliance audit passes (2-4 weeks). We mark those posts as published with a private visibility note.",
      },
      {
        kind: "connect_oauth",
        title: "Connect with Google",
        instructions: [
          "You will be sent to Google to approve the connection.",
          `Requested scopes: ${YOUTUBE_SCOPES.join(", ")}.`,
          "We ask for offline access so the refresh token keeps the connection alive; Google only issues one when you approve the consent screen.",
        ].join("\n\n"),
      },
      {
        kind: "verify",
        title: "Verify the YouTube connection",
        instructions:
          "We read channels.list?mine=true to confirm the token and store your channel id and handle.",
      },
    ];
  },

  authUrl(input: AuthorizeInput): string {
    return googleAuthUrl(PLATFORM, input, YOUTUBE_SCOPES);
  },

  async exchangeCode(code: string, input: AuthorizeInput) {
    const tokens = await googleExchangeCode(PLATFORM, code, input);
    const channel = await fetchChannel(tokens.accessToken);
    return {
      tokens,
      account: {
        externalId: channel?.id ?? null,
        handle: channel?.snippet?.customUrl ?? channel?.snippet?.title ?? null,
        config: {
          channelId: channel?.id ?? null,
          channelTitle: channel?.snippet?.title ?? null,
          // Flipped to true by an operator once the compliance audit passes.
          audited: false,
        },
      },
    };
  },

  async refresh(tokens: OAuthTokens): Promise<OAuthTokens> {
    return googleRefresh(PLATFORM, tokens);
  },

  async verify(account: ConnectedAccount): Promise<VerifyResult> {
    try {
      const channel = await fetchChannel(tokenOf(account));
      const audited = account.config?.audited === true;
      return {
        ok: true,
        handle: channel?.snippet?.customUrl ?? channel?.id,
        displayName: channel?.snippet?.title,
        profileUrl: channel?.id ? `https://www.youtube.com/channel/${channel.id}` : undefined,
        ...(audited
          ? {}
          : {
              warning:
                "This Google project has not passed YouTube's API compliance audit, so uploads are forced private until it does.",
            }),
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async publish(account: ConnectedAccount, post: PublishablePost): Promise<PublishResult> {
    const audited = account.config?.audited === true;
    if (post.externalId) {
      return {
        externalId: post.externalId,
        url: videoUrl(post.externalId),
        visibility: audited ? "public" : "private",
      };
    }

    const token = tokenOf(account);
    const context = { businessId: account.businessId, accountId: account.id, postId: post.id };

    const video = post.media.find((m) => m.kind === "video");
    if (!video) {
      throw new ConnectorError(
        "YouTube posts need a video; there is nothing else to upload",
        PLATFORM,
        "invalid_media",
        false,
      );
    }

    const { buffer, mimeType } = await downloadMedia(video.url, {
      platform: PLATFORM,
      context,
      maxBytes: MAX_VIDEO_BYTES,
    });
    const contentType = video.mimeType ?? mimeType;
    const metadata = buildVideoMetadata(account, post);

    // Step 1: start a resumable session. The upload URL comes back in `Location`.
    const init = await fetchJson<unknown>(
      `${UPLOAD_API}?uploadType=resumable&part=snippet,status`,
      {
        method: "POST",
        headers: {
          ...googleAuthHeaders(token),
          "content-type": "application/json; charset=UTF-8",
          "x-upload-content-type": contentType,
          "x-upload-content-length": String(buffer.byteLength),
        },
        body: JSON.stringify(metadata),
      },
      googleHttp(PLATFORM, context),
    );

    const uploadUrl = init.headers.get("location") ?? init.headers.get("x-guploader-uploadid-location");
    if (!uploadUrl) {
      throw new ConnectorError("YouTube did not return a resumable upload URL", PLATFORM, "unknown", false);
    }

    // Step 2: send the bytes. One PUT - the resumable protocol allows chunking,
    // but we already hold the whole (capped) file and a single PUT is resumable
    // at the job level because the session URL is short-lived anyway.
    const { data } = await fetchJson<VideoResource>(
      uploadUrl,
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": contentType,
          "content-length": String(buffer.byteLength),
        },
        body: new Uint8Array(buffer),
      },
      { ...googleHttp(PLATFORM, context), retries: 1, timeoutMs: 120_000 },
    );

    const id = data.id;
    if (!id) {
      throw new ConnectorError(
        "YouTube accepted the upload but returned no video id",
        PLATFORM,
        "unknown",
        false,
      );
    }

    const privacyStatus = data.status?.privacyStatus ?? (metadata.status.privacyStatus as string);
    logger.info(
      { ...context, platform: PLATFORM, externalId: id, privacyStatus },
      "connector.youtube.published",
    );

    return {
      externalId: id,
      url: videoUrl(id),
      visibility: privacyStatus === "public" ? "public" : "private",
      raw: { privacyStatus, publishAt: metadata.status.publishAt ?? null },
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

    const channel = await fetchChannel(token);
    const subs = num(channel?.statistics?.subscriberCount);
    if (subs !== undefined) out.push({ metric: "followers", value: subs, capturedAt });
    const channelViews = num(channel?.statistics?.viewCount);
    if (channelViews !== undefined) out.push({ metric: "views", value: channelViews, capturedAt });

    const ids = posts.map((p) => p.externalId).filter(Boolean);
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50).join(",");
      const { data } = await fetchJson<{ items?: VideoResource[] }>(
        `${DATA_API}/videos?part=statistics&id=${encodeURIComponent(batch)}`,
        { headers: googleAuthHeaders(token) },
        { ...googleHttp(PLATFORM), retries: 1 },
      );
      for (const item of data.items ?? []) {
        if (!item.id) continue;
        const base = { capturedAt, externalPostId: item.id };
        const views = num(item.statistics?.viewCount);
        const likes = num(item.statistics?.likeCount);
        const comments = num(item.statistics?.commentCount);
        if (views !== undefined) out.push({ metric: "views", value: views, ...base });
        if (likes !== undefined) out.push({ metric: "likes", value: likes, ...base });
        if (comments !== undefined) out.push({ metric: "comments", value: comments, ...base });
      }
    }
    return out;
  },
};

async function fetchChannel(token: string): Promise<ChannelResource | undefined> {
  const { data } = await fetchJson<{ items?: ChannelResource[] }>(
    `${DATA_API}/channels?part=snippet,statistics&mine=true`,
    { headers: googleAuthHeaders(token) },
    googleHttp(PLATFORM),
  );
  return data.items?.[0];
}

export default youtubeConnector;
