import { createHash, randomBytes } from "node:crypto";
import type { PlatformId } from "@adv/shared";
import type { OAuthTokens } from "./connector.js";
import { ConnectorError } from "./connector.js";
import { fetchJson, type HttpOptions, postForm } from "./http.js";

/* ------------------------------------------------------------------ */
/* PKCE                                                                */
/* ------------------------------------------------------------------ */

/** RFC 7636 code verifier: 43-128 chars of unreserved base64url. */
export function generateCodeVerifier(bytes = 64): string {
  return randomBytes(bytes).toString("base64url").slice(0, 128);
}

/** RFC 7636 S256 challenge: base64url(SHA256(verifier)). */
export function codeChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/* ------------------------------------------------------------------ */
/* authorize URL                                                       */
/* ------------------------------------------------------------------ */

export type AuthParams = Record<string, string | number | boolean | undefined | null>;

/** Builds an authorization URL, dropping undefined params and preserving any already on `base`. */
export function buildAuthUrl(base: string, params: AuthParams): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/* ------------------------------------------------------------------ */
/* token endpoints                                                     */
/* ------------------------------------------------------------------ */

export interface RawTokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number | string;
  /** Meta long-lived user tokens use this spelling on some edges. */
  expires?: number | string;
  scope?: string | string[];
  error?: unknown;
  error_description?: string;
  [key: string]: unknown;
}

export interface TokenExchangeOptions {
  platform: PlatformId;
  /** Send client credentials as an HTTP Basic header instead of form fields. */
  basicAuth?: { clientId: string; clientSecret: string };
  /** Some providers (Meta, Threads) use GET with query params for token endpoints. */
  method?: "POST" | "GET";
  headers?: Record<string, string>;
  http?: Partial<Omit<HttpOptions, "platform">>;
}

/** Normalises the many shapes of an OAuth token response onto {@link OAuthTokens}. */
export function normalizeTokenResponse(
  raw: RawTokenResponse,
  platform: PlatformId,
  previous?: OAuthTokens,
): OAuthTokens {
  const accessToken = raw.access_token;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new ConnectorError(
      `${platform} token response did not contain an access_token`,
      platform,
      "auth_expired",
      false,
    );
  }
  const expiresInRaw = raw.expires_in ?? raw.expires;
  const expiresIn = expiresInRaw === undefined ? undefined : Number(expiresInRaw);
  const scopes = Array.isArray(raw.scope)
    ? raw.scope
    : typeof raw.scope === "string"
      ? raw.scope.split(/[\s,]+/).filter(Boolean)
      : previous?.scopes;

  const tokens: OAuthTokens = { accessToken };
  const refreshToken = typeof raw.refresh_token === "string" ? raw.refresh_token : previous?.refreshToken;
  if (refreshToken) tokens.refreshToken = refreshToken;
  if (typeof raw.token_type === "string") tokens.tokenType = raw.token_type;
  if (scopes?.length) tokens.scopes = scopes;
  if (expiresIn !== undefined && Number.isFinite(expiresIn)) {
    tokens.expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  }
  return tokens;
}

function basicHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

/** Generic `grant_type=authorization_code` exchange. */
export async function exchangeAuthorizationCode(
  tokenUrl: string,
  params: AuthParams,
  opts: TokenExchangeOptions,
): Promise<OAuthTokens> {
  const { platform, basicAuth, method = "POST", headers = {}, http = {} } = opts;
  const allHeaders: Record<string, string> = { accept: "application/json", ...headers };
  if (basicAuth) allHeaders.authorization = basicHeader(basicAuth.clientId, basicAuth.clientSecret);

  const httpOpts: HttpOptions = { ...http, platform };

  const raw =
    method === "GET"
      ? (await fetchJson<RawTokenResponse>(buildAuthUrl(tokenUrl, params), { headers: allHeaders }, httpOpts))
          .data
      : (await postForm<RawTokenResponse>(tokenUrl, params, { ...httpOpts, headers: allHeaders })).data;

  return normalizeTokenResponse(raw, platform);
}

/** Generic `grant_type=refresh_token` exchange. */
export async function refreshWithRefreshToken(
  tokenUrl: string,
  tokens: OAuthTokens,
  extraParams: AuthParams,
  opts: TokenExchangeOptions,
): Promise<OAuthTokens> {
  if (!tokens.refreshToken) {
    throw new ConnectorError(
      `${opts.platform} account has no refresh token; the user must reconnect`,
      opts.platform,
      "auth_expired",
      false,
    );
  }
  const { platform, basicAuth, method = "POST", headers = {}, http = {} } = opts;
  const allHeaders: Record<string, string> = { accept: "application/json", ...headers };
  if (basicAuth) allHeaders.authorization = basicHeader(basicAuth.clientId, basicAuth.clientSecret);

  const params: AuthParams = {
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
    ...extraParams,
  };
  const httpOpts: HttpOptions = { ...http, platform };

  const raw =
    method === "GET"
      ? (await fetchJson<RawTokenResponse>(buildAuthUrl(tokenUrl, params), { headers: allHeaders }, httpOpts))
          .data
      : (await postForm<RawTokenResponse>(tokenUrl, params, { ...httpOpts, headers: allHeaders })).data;

  return normalizeTokenResponse(raw, platform, tokens);
}

/**
 * True when the token expires within `skewSec` (default 5 minutes), so the
 * publisher refreshes before a job rather than failing mid-publish.
 * Tokens without an `expiresAt` are treated as long-lived.
 */
export function isExpiringSoon(tokens: OAuthTokens | null | undefined, skewSec = 300): boolean {
  if (!tokens?.expiresAt) return false;
  const expiry = Date.parse(tokens.expiresAt);
  if (!Number.isFinite(expiry)) return false;
  return expiry - Date.now() <= skewSec * 1000;
}

/** Required env var lookup that produces a `not_configured` ConnectorError instead of a bare throw. */
export function requireEnv(name: string, platform: PlatformId): string {
  const value = process.env[name];
  if (!value) {
    throw new ConnectorError(
      `${name} is not set; ${platform} is not configured on this deployment`,
      platform,
      "not_configured",
      false,
    );
  }
  return value;
}
