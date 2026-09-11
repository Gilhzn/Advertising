import type { BrandKit } from "@adv/shared";
import { RichText } from "@atproto/api";
import { bioFor, handleSuggestions, primaryHandle, taglineOf, type WizardContext } from "../brand.js";
import {
  type ConnectedAccount,
  type Connector,
  ConnectorError,
  type MetricSnapshotInput,
  type OAuthTokens,
  type PublishablePost,
  type PublishResult,
  type WizardStep,
} from "../connector.js";
import { downloadMedia, fetchJson } from "../http.js";
import { assertPublicUrl } from "../net-guard.js";
import { composeBody, splitThread } from "../text.js";

const PLATFORM = "bluesky" as const;
const DEFAULT_SERVICE = "https://bsky.social";
const MAX_CHARS = 300;
const MAX_IMAGES = 4;
/** app.bsky.embed.images#image lexicon: maxSize 2,000,000 bytes. */
const MAX_BLOB_BYTES = 2_000_000;

/* ------------------------------------------------------------------ */
/* wire types (subset of the lexicons we use)                          */
/* ------------------------------------------------------------------ */

interface SessionResponse {
  accessJwt: string;
  refreshJwt: string;
  handle: string;
  did: string;
  active?: boolean;
  status?: string;
}

interface BlobRef {
  $type: "blob";
  ref: { $link: string };
  mimeType: string;
  size: number;
}

interface ProfileResponse {
  did: string;
  handle: string;
  displayName?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
}

interface PostView {
  uri: string;
  cid: string;
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  quoteCount?: number;
  indexedAt?: string;
}

interface StrongRef {
  uri: string;
  cid: string;
}

interface Facet {
  index: { byteStart: number; byteEnd: number };
  features: Array<Record<string, unknown>>;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function serviceOf(account: Pick<ConnectedAccount, "config">): string {
  const url = account.config?.pdsUrl;
  return typeof url === "string" && url ? url.replace(/\/$/, "") : DEFAULT_SERVICE;
}

/** A self-hosted PDS must be a plain public https origin (SSRF guard: no ports, paths, private hosts). */
async function normalizeService(raw: string | undefined): Promise<string> {
  const s = (raw ?? "").trim().replace(/\/$/, "") || DEFAULT_SERVICE;
  const u = await assertPublicUrl(s, { platform: PLATFORM });
  if (u.port || (u.pathname !== "/" && u.pathname !== "") || u.search || u.hash) {
    throw new ConnectorError(
      "PDS host must be a plain https origin like https://bsky.social",
      PLATFORM,
      "not_configured",
      false,
    );
  }
  return u.origin;
}

function xrpc(service: string, nsid: string, params?: Record<string, string | number | undefined>): string {
  const url = new URL(`/xrpc/${nsid}`, service);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function authHeaders(jwt: string): Record<string, string> {
  return { authorization: `Bearer ${jwt}`, accept: "application/json" };
}

function requireTokens(account: ConnectedAccount): OAuthTokens {
  if (!account.tokens?.accessToken) {
    throw new ConnectorError(
      "Bluesky account has no session; reconnect with an app password",
      PLATFORM,
      "auth_expired",
      false,
    );
  }
  return account.tokens;
}

function didOf(account: ConnectedAccount): string {
  const did = account.config?.did ?? account.externalId;
  if (typeof did !== "string" || !did) {
    throw new ConnectorError("Bluesky account has no DID stored", PLATFORM, "not_configured", false);
  }
  return did;
}

/** at://did:plc:xxx/app.bsky.feed.post/3k2a -> 3k2a */
export function rkeyOf(atUri: string): string {
  return atUri.split("/").pop() ?? atUri;
}

export function postUrl(handle: string, atUri: string): string {
  return `https://bsky.app/profile/${handle}/post/${rkeyOf(atUri)}`;
}

/** Bluesky answers errors as `{ error: "InvalidRequest", message: "..." }`. */
function mapXrpcError(status: number, body: unknown): ConnectorError | undefined {
  const b = (body ?? {}) as { error?: string; message?: string };
  const name = b.error ?? "";
  const message = b.message ?? name ?? `HTTP ${status}`;
  if (name === "ExpiredToken" || name === "InvalidToken" || status === 401) {
    return new ConnectorError(`Bluesky session expired: ${message}`, PLATFORM, "auth_expired", false);
  }
  if (name === "AuthenticationRequired" || name === "AuthFactorTokenRequired") {
    return new ConnectorError(`Bluesky auth failed: ${message}`, PLATFORM, "auth_expired", false);
  }
  if (name === "AccountTakedown") {
    return new ConnectorError(`Bluesky account is taken down: ${message}`, PLATFORM, "rejected", false);
  }
  if (name === "BlobTooLarge" || name === "InvalidMimeType" || name === "UnsupportedMimeType") {
    return new ConnectorError(`Bluesky rejected the media: ${message}`, PLATFORM, "invalid_media", false);
  }
  if (status === 429) {
    return new ConnectorError(`Bluesky rate limited: ${message}`, PLATFORM, "rate_limited", true);
  }
  return undefined;
}

/**
 * Builds facets for links, hashtags and mentions with @atproto/api's RichText
 * detector (byte offsets, UTF-8), then resolves mention handles to DIDs through
 * our own http client so every request still goes through `fetchJson`.
 */
export async function buildFacets(service: string, jwt: string, text: string): Promise<Facet[] | undefined> {
  const rt = new RichText({ text });
  rt.detectFacetsWithoutResolution();
  const facets = rt.facets as Facet[] | undefined;
  if (!facets?.length) return undefined;

  const resolved: Facet[] = [];
  for (const facet of facets) {
    const features: Array<Record<string, unknown>> = [];
    for (const feature of facet.features) {
      if (feature.$type === "app.bsky.richtext.facet#mention") {
        // detectFacetsWithoutResolution puts the *handle* in `did`.
        const handle = String(feature.did ?? "");
        try {
          const { data } = await fetchJson<{ did: string }>(
            xrpc(service, "com.atproto.identity.resolveHandle", { handle }),
            { headers: authHeaders(jwt) },
            { platform: PLATFORM, retries: 0, mapError: mapXrpcError },
          );
          features.push({ $type: "app.bsky.richtext.facet#mention", did: data.did });
        } catch {
          // An unresolvable @mention is just text; drop the facet, keep the post.
        }
      } else {
        features.push(feature);
      }
    }
    if (features.length) resolved.push({ index: facet.index, features });
  }
  return resolved.length ? resolved : undefined;
}

async function uploadImage(
  service: string,
  jwt: string,
  media: PublishablePost["media"][number],
  context: Record<string, unknown>,
): Promise<{ blob: BlobRef; alt: string }> {
  const { buffer, mimeType } = await downloadMedia(media.url, { platform: PLATFORM, context });
  if (buffer.byteLength > MAX_BLOB_BYTES) {
    throw new ConnectorError(
      `Bluesky images must be under ${MAX_BLOB_BYTES} bytes (got ${buffer.byteLength}); resize before publishing`,
      PLATFORM,
      "invalid_media",
      false,
    );
  }
  const { data } = await fetchJson<{ blob: BlobRef }>(
    xrpc(service, "com.atproto.repo.uploadBlob"),
    {
      method: "POST",
      headers: { ...authHeaders(jwt), "content-type": media.mimeType ?? mimeType },
      body: new Uint8Array(buffer),
    },
    { platform: PLATFORM, context, mapError: mapXrpcError },
  );
  return { blob: data.blob, alt: media.altText ?? "" };
}

/* ------------------------------------------------------------------ */
/* connector                                                           */
/* ------------------------------------------------------------------ */

export const blueskyConnector: Connector = {
  id: PLATFORM,
  authKind: "token",
  capabilities: {
    text: true,
    image: true,
    // app.bsky.embed.video needs the separate video.bsky.app upload service - not wave 1.
    video: false,
    carousel: false,
    nativeSchedule: false,
    insights: true,
    maxChars: MAX_CHARS,
    maxMedia: MAX_IMAGES,
    imageAspects: ["1:1", "4:5", "16:9", "3:2"],
  },
  // PDS shared limit: 5,000 points/hour, a createRecord costs 3 -> ~1,666 posts/h.
  // We pace far below that; the publisher never needs more.
  rateLimit: { limit: 60, windowMs: 60 * 60 * 1000 },

  wizard(brandKit: BrandKit | null, ctx: WizardContext): WizardStep[] {
    const handles = handleSuggestions(brandKit, ctx, 3);
    const handle = primaryHandle(brandKit, ctx);
    const bio = bioFor(brandKit, PLATFORM, ctx);
    return [
      {
        kind: "create_account",
        title: "Create the Bluesky account",
        url: `https://bsky.app/?handle=${encodeURIComponent(handle)}`,
        instructions: [
          "Open Bluesky and sign up with the business email.",
          `Pick a handle - suggestions: ${handles.map((h) => `\`${h}.bsky.social\``).join(", ")}.`,
          "Skip the starter packs; we will fill the profile in the next step.",
        ].join("\n\n"),
        prefill: [
          { label: "Handle", value: `${handle}.bsky.social` },
          { label: "Display name", value: ctx.businessName },
        ],
      },
      {
        kind: "configure",
        title: "Fill in the profile",
        url: "https://bsky.app/settings",
        instructions:
          "Set the avatar and banner from the brand kit, then paste the bio below. Add the website link at the end of the bio - Bluesky has no dedicated link field.",
        prefill: [
          { label: "Display name", value: ctx.businessName },
          { label: "Bio", value: bio, multiline: true },
          ...(ctx.websiteUrl ? [{ label: "Website (append to bio)", value: ctx.websiteUrl }] : []),
          { label: "Tagline", value: taglineOf(brandKit, ctx) },
        ],
      },
      {
        kind: "connect_token",
        title: "Create an app password and connect",
        url: "https://bsky.app/settings/app-passwords",
        instructions: [
          "Go to Settings -> Privacy and security -> App passwords -> Add app password.",
          'Name it "Advertising" and copy the generated `xxxx-xxxx-xxxx-xxxx` value.',
          "Paste your handle and that app password below. We never ask for your main password.",
        ].join("\n\n"),
        inputs: [
          {
            name: "handle",
            label: "Handle",
            placeholder: `${handle}.bsky.social`,
            help: "Without the leading @",
          },
          {
            name: "appPassword",
            label: "App password",
            secret: true,
            placeholder: "xxxx-xxxx-xxxx-xxxx",
          },
          {
            name: "service",
            label: "PDS host (advanced)",
            placeholder: DEFAULT_SERVICE,
            help: "Leave empty unless you self-host your Bluesky data server.",
          },
        ],
        caveat:
          "App passwords cannot change your account settings or delete your account, but they can post. Revoke it from the same screen at any time.",
      },
      {
        kind: "verify",
        title: "Verify the connection",
        instructions: "We fetch your profile to confirm the session works and store your DID.",
      },
    ];
  },

  async connectWithInputs(inputs: Record<string, string>) {
    const handle = (inputs.handle ?? "").trim().replace(/^@/, "");
    const password = (inputs.appPassword ?? inputs.password ?? "").trim();
    const service = await normalizeService(inputs.service);
    if (!handle || !password) {
      throw new ConnectorError("Handle and app password are required", PLATFORM, "not_configured", false);
    }

    const { data } = await fetchJson<SessionResponse>(
      xrpc(service, "com.atproto.server.createSession"),
      {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ identifier: handle, password }),
      },
      { platform: PLATFORM, mapError: mapXrpcError },
    );

    if (data.active === false) {
      throw new ConnectorError(
        `Bluesky account is not active (${data.status ?? "unknown"})`,
        PLATFORM,
        "rejected",
        false,
      );
    }

    return {
      tokens: {
        accessToken: data.accessJwt,
        refreshToken: data.refreshJwt,
        tokenType: "Bearer",
      } satisfies OAuthTokens,
      account: {
        externalId: data.did,
        handle: data.handle,
        config: { did: data.did, pdsUrl: service, handle: data.handle },
      },
    };
  },

  async refresh(tokens: OAuthTokens): Promise<OAuthTokens> {
    return refreshSession(DEFAULT_SERVICE, tokens);
  },

  async refreshForAccount(account: ConnectedAccount) {
    const tokens = await refreshSession(serviceOf(account), requireTokens(account));
    return { tokens };
  },

  async verify(account: ConnectedAccount) {
    const service = serviceOf(account);
    const tokens = requireTokens(account);
    try {
      const { data } = await fetchJson<ProfileResponse>(
        xrpc(service, "app.bsky.actor.getProfile", { actor: didOf(account) }),
        { headers: authHeaders(tokens.accessToken) },
        { platform: PLATFORM, mapError: mapXrpcError },
      );
      return {
        ok: true,
        handle: data.handle,
        displayName: data.displayName ?? data.handle,
        profileUrl: `https://bsky.app/profile/${data.handle}`,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async publish(account: ConnectedAccount, post: PublishablePost): Promise<PublishResult> {
    const handle = account.handle ?? String(account.config?.handle ?? "");
    if (post.externalId) {
      return { externalId: post.externalId, url: postUrl(handle, post.externalId) };
    }

    const service = serviceOf(account);
    const tokens = requireTokens(account);
    const jwt = tokens.accessToken;
    const did = didOf(account);
    const context = { businessId: account.businessId, accountId: account.id, postId: post.id };

    const body = composeBody({
      body: post.body,
      hashtags: post.hashtags,
      linkUrl: post.linkUrl,
      platform: PLATFORM,
      maxChars: Number.MAX_SAFE_INTEGER, // let splitThread do the fitting
    });
    const parts = splitThread(body, MAX_CHARS);
    if (parts.length === 0) {
      throw new ConnectorError("Post body is empty", PLATFORM, "rejected", false);
    }

    const images = post.media.filter((m) => m.kind === "image").slice(0, MAX_IMAGES);
    if (post.media.some((m) => m.kind === "video")) {
      throw new ConnectorError(
        "Bluesky video publishing is not enabled in wave 1; publish an image or text instead",
        PLATFORM,
        "invalid_media",
        false,
      );
    }

    const embed =
      images.length > 0
        ? {
            $type: "app.bsky.embed.images",
            images: await Promise.all(
              images.map(async (media) => {
                const { blob, alt } = await uploadImage(service, jwt, media, context);
                return {
                  image: blob,
                  alt,
                  ...(media.width && media.height
                    ? { aspectRatio: { width: media.width, height: media.height } }
                    : {}),
                };
              }),
            ),
          }
        : undefined;

    const createdAt = new Date().toISOString();
    let root: StrongRef | undefined;
    let parent: StrongRef | undefined;

    for (const [index, text] of parts.entries()) {
      const facets = await buildFacets(service, jwt, text);
      const record: Record<string, unknown> = {
        $type: "app.bsky.feed.post",
        text,
        createdAt,
        langs: [post.language],
      };
      if (facets) record.facets = facets;
      if (index === 0 && embed) record.embed = embed;
      if (root && parent) record.reply = { root, parent };

      const { data } = await fetchJson<StrongRef>(
        xrpc(service, "com.atproto.repo.createRecord"),
        {
          method: "POST",
          headers: { ...authHeaders(jwt), "content-type": "application/json" },
          body: JSON.stringify({ repo: did, collection: "app.bsky.feed.post", record }),
        },
        { platform: PLATFORM, context, mapError: mapXrpcError },
      );

      parent = { uri: data.uri, cid: data.cid };
      root ??= parent;
    }

    const first = root as StrongRef;
    return {
      externalId: first.uri,
      url: postUrl(handle || did, first.uri),
      raw: { parts: parts.length, cid: first.cid },
    };
  },

  async fetchInsights(
    account: ConnectedAccount,
    since: string,
    posts: Array<{ id: string; externalId: string }>,
  ): Promise<MetricSnapshotInput[]> {
    const service = serviceOf(account);
    const tokens = requireTokens(account);
    const headers = authHeaders(tokens.accessToken);
    const capturedAt = new Date().toISOString();
    const out: MetricSnapshotInput[] = [];

    const { data: profile } = await fetchJson<ProfileResponse>(
      xrpc(service, "app.bsky.actor.getProfile", { actor: didOf(account) }),
      { headers },
      { platform: PLATFORM, mapError: mapXrpcError },
    );
    if (typeof profile.followersCount === "number") {
      out.push({ metric: "followers", value: profile.followersCount, capturedAt });
    }

    const seen = new Set<string>();
    const pushPost = (view: PostView) => {
      if (seen.has(view.uri)) return;
      seen.add(view.uri);
      const base = { capturedAt, externalPostId: view.uri };
      if (typeof view.likeCount === "number") out.push({ metric: "likes", value: view.likeCount, ...base });
      if (typeof view.repostCount === "number")
        out.push({ metric: "reposts", value: view.repostCount, ...base });
      if (typeof view.replyCount === "number")
        out.push({ metric: "replies", value: view.replyCount, ...base });
    };

    if (posts.length > 0) {
      for (const post of posts) {
        const { data } = await fetchJson<{ thread: { post?: PostView } }>(
          xrpc(service, "app.bsky.feed.getPostThread", { uri: post.externalId, depth: 0 }),
          { headers },
          { platform: PLATFORM, retries: 1, mapError: mapXrpcError },
        );
        if (data.thread?.post) pushPost(data.thread.post);
      }
      return out;
    }

    // No known post ids yet: fall back to the author feed since `since`.
    const { data: feed } = await fetchJson<{ feed: Array<{ post: PostView }> }>(
      xrpc(service, "app.bsky.feed.getAuthorFeed", {
        actor: didOf(account),
        limit: 50,
        filter: "posts_no_replies",
      }),
      { headers },
      { platform: PLATFORM, mapError: mapXrpcError },
    );
    const sinceMs = Date.parse(since);
    for (const item of feed.feed ?? []) {
      const indexed = item.post.indexedAt ? Date.parse(item.post.indexedAt) : Number.NaN;
      if (Number.isFinite(sinceMs) && Number.isFinite(indexed) && indexed < sinceMs) continue;
      pushPost(item.post);
    }
    return out;
  },
};

async function refreshSession(service: string, tokens: OAuthTokens): Promise<OAuthTokens> {
  if (!tokens.refreshToken) {
    throw new ConnectorError(
      "Bluesky session has no refreshJwt; reconnect with an app password",
      PLATFORM,
      "auth_expired",
      false,
    );
  }
  const { data } = await fetchJson<SessionResponse>(
    xrpc(service, "com.atproto.server.refreshSession"),
    { method: "POST", headers: authHeaders(tokens.refreshToken) },
    { platform: PLATFORM, mapError: mapXrpcError },
  );
  return { accessToken: data.accessJwt, refreshToken: data.refreshJwt, tokenType: "Bearer" };
}

export default blueskyConnector;
