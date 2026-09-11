/** Shared shape of the short-lived OAuth `state` double-submit cookie (set in `start`, checked in `callback`). */
export const OAUTH_STATE_COOKIE = "oauth_state";

/** 10 minutes - the same TTL as the `oauth_states` row it mirrors. */
export const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

export function oauthStateCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    // Scoped to the OAuth routes only: no other page ever needs to send it.
    path: "/api/oauth",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  };
}
