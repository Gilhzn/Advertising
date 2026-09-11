import { generateCodeVerifier } from "@adv/connectors";
import { PLATFORM_IDS } from "@adv/shared";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureConnectorsRegistered, getConnector, hasConnector } from "@/lib/connectors";
import { getBusinessById } from "@/lib/data/businesses";
import { createOAuthState } from "@/lib/data/oauth-state";
import { OAUTH_STATE_COOKIE, oauthStateCookieOptions } from "@/lib/oauth-cookie";

/**
 * The redirect URI must be byte-identical between `start` and `callback` and must match what is
 * registered with the platform - deriving it from the incoming request's `Host` would let a
 * forwarded/spoofed host redirect the code elsewhere, so `APP_URL` is required (no origin fallback).
 */
function appUrl(): string {
  const value = process.env.APP_URL;
  if (!value) {
    throw new Error("APP_URL is not set - it is required to build OAuth redirect URIs");
  }
  return value.replace(/\/+$/, "");
}

export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const url = new URL(req.url);
  const businessId = url.searchParams.get("businessId");

  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }
  if (!(PLATFORM_IDS as readonly string[]).includes(platform)) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", appUrl()));
  }
  const business = await getBusinessById(session.user.id, businessId);
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  ensureConnectorsRegistered();
  const platformId = platform as (typeof PLATFORM_IDS)[number];
  if (!hasConnector(platformId)) {
    return NextResponse.json({ error: "Connector not available for this platform yet" }, { status: 501 });
  }
  const connector = getConnector(platformId);
  if (connector.authKind !== "oauth" || !connector.authUrl) {
    return NextResponse.json({ error: "This platform does not use OAuth" }, { status: 400 });
  }

  // PKCE verifier from @adv/connectors (RFC 7636 charset/length), not a generic random token -
  // wave-2 connectors (X, Reddit) hash it into the `code_challenge` they send.
  const codeVerifier = generateCodeVerifier();
  const stateRow = await createOAuthState(businessId, session.user.id, platformId, codeVerifier);

  const redirectUri = `${appUrl()}/api/oauth/${platformId}/callback`;
  const authUrl = connector.authUrl({
    businessId,
    redirectUri,
    state: stateRow.state,
    codeVerifier,
  });

  // Double-submit cookie: the callback only accepts a state it also finds here, so a state value
  // leaked from a redirect/Referer cannot be replayed from another browser.
  const jar = await cookies();
  jar.set(OAUTH_STATE_COOKIE, stateRow.state, oauthStateCookieOptions());

  return NextResponse.redirect(authUrl);
}
