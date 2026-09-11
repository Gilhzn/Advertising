import type { PlatformId } from "@adv/shared";
import { logger } from "@adv/shared";
import { type AuthorizeInput, ConnectorError, type OAuthTokens } from "../connector.js";
import { fetchJson, type HttpOptions, postForm } from "../http.js";
import { buildAuthUrl, normalizeTokenResponse, requireEnv } from "../oauth.js";

/**
 * Graph API version. Meta retires versions on a ~2 year cadence, so this is an
 * env knob rather than a constant baked into releases.
 */
export function graphVersion(): string {
  return process.env.META_GRAPH_VERSION ?? "v22.0";
}

export function graphBase(): string {
  return `https://graph.facebook.com/${graphVersion()}`;
}

export function graphUrl(path: string, params: Record<string, string | number | undefined> = {}): string {
  const url = new URL(`${graphBase()}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/** Facebook Login for Business scopes shared by the facebook and instagram connectors. */
export const META_SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "read_insights",
  "business_management",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
];

export interface MetaErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
    fbtrace_id?: string;
  };
}

/**
 * Maps Graph API errors. Meta answers HTTP 400 for almost everything and puts
 * the real meaning in `error.code` / `error.error_subcode`.
 * Codes: 190 invalid/expired token, 102 session, 4/17/32/613 throttling,
 * 10 + 200-299 permission, 368 temporarily blocked.
 */
export function mapMetaError(platform: PlatformId) {
  return (status: number, body: unknown): ConnectorError | undefined => {
    const error = (body as MetaErrorBody)?.error;
    const message = error?.error_user_msg ?? error?.message ?? `HTTP ${status}`;
    const code = error?.code;
    const subcode = error?.error_subcode;

    if (code === 190 || code === 102 || status === 401) {
      return new ConnectorError(
        `${platform} access token is invalid or expired (code ${code ?? status}): ${message}`,
        platform,
        "auth_expired",
        false,
      );
    }
    if (code !== undefined && [4, 17, 32, 613, 80001, 80002, 80004].includes(code)) {
      return new ConnectorError(
        `${platform} API call limit reached (code ${code}): ${message}`,
        platform,
        "rate_limited",
        true,
      );
    }
    if (code === 368 || subcode === 1346003) {
      return new ConnectorError(
        `${platform} temporarily blocked this action: ${message}`,
        platform,
        "rejected",
        false,
      );
    }
    if (code === 10 || (code !== undefined && code >= 200 && code <= 299)) {
      return new ConnectorError(
        `${platform} is missing a permission (code ${code}): ${message}. Re-run the connect flow and grant every requested scope.`,
        platform,
        "auth_expired",
        false,
      );
    }
    if (code === 324 || code === 2207026 || subcode === 2207005) {
      return new ConnectorError(
        `${platform} rejected the media: ${message}`,
        platform,
        "invalid_media",
        false,
      );
    }
    if (status === 429) {
      return new ConnectorError(`${platform} rate limited: ${message}`, platform, "rate_limited", true);
    }
    if (status >= 400 && status < 500) {
      return new ConnectorError(
        `${platform} rejected the request (code ${code ?? status}): ${message}`,
        platform,
        "rejected",
        false,
      );
    }
    return undefined;
  };
}

export function metaHttp(platform: PlatformId, context: Record<string, unknown> = {}): HttpOptions {
  return { platform, context, mapError: mapMetaError(platform) };
}

/* ------------------------------------------------------------------ */
/* OAuth                                                               */
/* ------------------------------------------------------------------ */

export function metaAppId(platform: PlatformId): string {
  return requireEnv("META_APP_ID", platform);
}
export function metaAppSecret(platform: PlatformId): string {
  return requireEnv("META_APP_SECRET", platform);
}

/** Facebook Login dialog. `config_id` selects a Login-for-Business configuration when set. */
export function metaAuthUrl(platform: PlatformId, input: AuthorizeInput): string {
  return buildAuthUrl(`https://www.facebook.com/${graphVersion()}/dialog/oauth`, {
    client_id: metaAppId(platform),
    redirect_uri: input.redirectUri,
    state: input.state,
    response_type: "code",
    scope: META_SCOPES.join(","),
    config_id: process.env.META_LOGIN_CONFIG_ID,
  });
}

export interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  username?: string;
  link?: string;
  category?: string;
  instagram_business_account?: { id: string; username?: string };
  tasks?: string[];
}

/** code -> short-lived user token -> long-lived (≈60 day) user token. */
export async function exchangeMetaCodeForUserToken(
  platform: PlatformId,
  code: string,
  redirectUri: string,
): Promise<OAuthTokens> {
  const http = metaHttp(platform);
  const short = await fetchJson<Record<string, unknown>>(
    graphUrl("oauth/access_token", {
      client_id: metaAppId(platform),
      client_secret: metaAppSecret(platform),
      redirect_uri: redirectUri,
      code,
    }),
    { headers: { accept: "application/json" } },
    http,
  );
  const shortTokens = normalizeTokenResponse(short.data, platform);
  return exchangeForLongLivedUserToken(platform, shortTokens.accessToken);
}

export async function exchangeForLongLivedUserToken(
  platform: PlatformId,
  userToken: string,
): Promise<OAuthTokens> {
  const { data } = await fetchJson<Record<string, unknown>>(
    graphUrl("oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: metaAppId(platform),
      client_secret: metaAppSecret(platform),
      fb_exchange_token: userToken,
    }),
    { headers: { accept: "application/json" } },
    metaHttp(platform),
  );
  return normalizeTokenResponse(data, platform);
}

/** Pages the user administers, with their never-expiring Page access tokens. */
export async function listPages(platform: PlatformId, userToken: string): Promise<MetaPage[]> {
  const { data } = await fetchJson<{ data: MetaPage[] }>(
    graphUrl("me/accounts", {
      fields: "id,name,username,link,category,tasks,access_token,instagram_business_account{id,username}",
      limit: 100,
      access_token: userToken,
    }),
    { headers: { accept: "application/json" } },
    metaHttp(platform),
  );
  const pages = data.data ?? [];
  if (pages.length === 0) {
    throw new ConnectorError(
      `No Facebook Page is available for this login. Create a Page (or grant access to it) and reconnect.`,
      platform,
      "not_configured",
      false,
    );
  }
  logger.info({ platform, pageCount: pages.length }, "connector.meta.pages_listed");
  return pages;
}

export function pickPage(pages: MetaPage[], wanted?: string | null): MetaPage {
  if (wanted) {
    const match = pages.find((p) => p.id === wanted || p.username === wanted || p.name === wanted);
    if (match) return match;
  }
  return pages[0] as MetaPage;
}

/** Re-reads the Page token for `pageId` using a (long-lived) user token. */
export async function pageTokenFor(
  platform: PlatformId,
  userToken: string,
  pageId: string,
): Promise<MetaPage> {
  const pages = await listPages(platform, userToken);
  const page = pages.find((p) => p.id === pageId);
  if (!page) {
    throw new ConnectorError(
      `This login no longer administers Page ${pageId}; reconnect the account.`,
      platform,
      "auth_expired",
      false,
    );
  }
  return page;
}

/** POST to a Graph edge with form encoding (what the Graph API expects for writes). */
export function graphPost<T>(
  platform: PlatformId,
  path: string,
  fields: Record<string, string | number | boolean | undefined | null>,
  context: Record<string, unknown> = {},
) {
  return postForm<T>(graphUrl(path), fields, metaHttp(platform, context));
}

export function graphGet<T>(
  platform: PlatformId,
  path: string,
  params: Record<string, string | number | undefined>,
  context: Record<string, unknown> = {},
) {
  return fetchJson<T>(
    graphUrl(path, params),
    { headers: { accept: "application/json" } },
    metaHttp(platform, context),
  );
}

/* ------------------------------------------------------------------ */
/* insights helpers                                                    */
/* ------------------------------------------------------------------ */

export interface InsightsEnvelope {
  data?: Array<{
    name: string;
    period?: string;
    values?: Array<{ value: unknown; end_time?: string }>;
    total_value?: { value?: number };
  }>;
}

/**
 * Flattens a Graph insights payload to `[metricName, value, endTime]`. Handles
 * both the `values[]` time-series shape and the `total_value` shape Meta uses
 * for the newer metrics.
 */
export function flattenInsights(
  envelope: InsightsEnvelope,
): Array<{ name: string; value: number; endTime?: string }> {
  const out: Array<{ name: string; value: number; endTime?: string }> = [];
  for (const entry of envelope.data ?? []) {
    if (typeof entry.total_value?.value === "number") {
      out.push({ name: entry.name, value: entry.total_value.value });
      continue;
    }
    for (const point of entry.values ?? []) {
      if (typeof point.value === "number") {
        out.push({ name: entry.name, value: point.value, endTime: point.end_time });
      }
    }
  }
  return out;
}
