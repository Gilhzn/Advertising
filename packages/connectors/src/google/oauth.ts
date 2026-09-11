import type { PlatformId } from "@adv/shared";
import { type AuthorizeInput, ConnectorError, type OAuthTokens } from "../connector.js";
import type { HttpOptions } from "../http.js";
import { buildAuthUrl, exchangeAuthorizationCode, refreshWithRefreshToken, requireEnv } from "../oauth.js";

/**
 * Shared Google OAuth 2.0 plumbing for the two Google connectors (YouTube and
 * Google Business Profile). Both use the same web-server flow with a client
 * secret and an offline refresh token; only the scope list differs.
 *
 * Endpoints are read from Google's own OpenID discovery document
 * (https://accounts.google.com/.well-known/openid-configuration), verified
 * 2026-09-11:
 *   authorization_endpoint  https://accounts.google.com/o/oauth2/v2/auth
 *   token_endpoint          https://oauth2.googleapis.com/token
 *
 * We deliberately do NOT depend on `googleapis`: each connector implements the
 * handful of REST calls it needs through `fetchJson`.
 */
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export function googleClientId(platform: PlatformId): string {
  return requireEnv("GOOGLE_CLIENT_ID", platform);
}
export function googleClientSecret(platform: PlatformId): string {
  return requireEnv("GOOGLE_CLIENT_SECRET", platform);
}

/**
 * `access_type=offline` + `prompt=consent` is what makes Google hand back a
 * refresh token; without `prompt=consent` a user who has already approved the
 * app gets an access token only, and the connection dies after an hour.
 */
export function googleAuthUrl(platform: PlatformId, input: AuthorizeInput, scopes: string[]): string {
  return buildAuthUrl(GOOGLE_AUTH_URL, {
    client_id: googleClientId(platform),
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state: input.state,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
}

export async function googleExchangeCode(
  platform: PlatformId,
  code: string,
  input: AuthorizeInput,
): Promise<OAuthTokens> {
  return exchangeAuthorizationCode(
    GOOGLE_TOKEN_URL,
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: input.redirectUri,
      client_id: googleClientId(platform),
      client_secret: googleClientSecret(platform),
    },
    { platform },
  );
}

export async function googleRefresh(platform: PlatformId, tokens: OAuthTokens): Promise<OAuthTokens> {
  return refreshWithRefreshToken(
    GOOGLE_TOKEN_URL,
    tokens,
    { client_id: googleClientId(platform), client_secret: googleClientSecret(platform) },
    { platform },
  );
}

interface GoogleErrorBody {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    errors?: Array<{ reason?: string; message?: string; domain?: string }>;
  };
}

/**
 * Google's JSON error envelope is `{ error: { code, message, status, errors:[{reason}] } }`.
 * The `reason` is what distinguishes "you are out of quota" (retryable-ish) from
 * "this project has no quota at all" (a configuration problem the user must fix).
 */
export function mapGoogleError(platform: PlatformId) {
  return (status: number, body: unknown): ConnectorError | undefined => {
    const error = (body as GoogleErrorBody)?.error;
    const reason = error?.errors?.[0]?.reason ?? "";
    const message = error?.message ?? `HTTP ${status}`;

    if (status === 401 || reason === "authError" || reason === "unauthorized") {
      return new ConnectorError(
        `${platform} Google token is invalid or expired: ${message}`,
        platform,
        "auth_expired",
        false,
      );
    }
    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded" || reason === "rateLimitExceeded") {
      return new ConnectorError(
        `${platform} Google API quota exceeded (${reason}): ${message}`,
        platform,
        "rate_limited",
        true,
      );
    }
    if (reason === "accessNotConfigured" || status === 403) {
      return new ConnectorError(
        `${platform} Google project is not authorised for this API (${reason || "forbidden"}): ${message}. ` +
          "A new project starts with zero quota until Google approves the access request.",
        platform,
        "not_configured",
        false,
      );
    }
    if (status === 429) {
      return new ConnectorError(
        `${platform} Google rate limited: ${message}`,
        platform,
        "rate_limited",
        true,
      );
    }
    if (reason === "invalidVideoMetadata" || reason === "mediaBodyRequired" || status === 415) {
      return new ConnectorError(
        `${platform} rejected the media: ${message}`,
        platform,
        "invalid_media",
        false,
      );
    }
    if (status >= 400 && status < 500) {
      return new ConnectorError(`${platform} rejected the request: ${message}`, platform, "rejected", false);
    }
    return undefined;
  };
}

export function googleHttp(platform: PlatformId, context: Record<string, unknown> = {}): HttpOptions {
  return { platform, context, mapError: mapGoogleError(platform) };
}

export function googleAuthHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, accept: "application/json" };
}

export function requireGoogleToken(platform: PlatformId, token: string | null | undefined): string {
  if (!token) {
    throw new ConnectorError(
      `${platform} account has no Google access token; reconnect`,
      platform,
      "auth_expired",
      false,
    );
  }
  return token;
}
