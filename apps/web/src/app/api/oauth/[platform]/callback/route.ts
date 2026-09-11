import { timingSafeEqual } from "node:crypto";
import { ConnectorError } from "@adv/connectors";
import { and, businesses, eq, getDb, oauthTokens, platformAccounts } from "@adv/db";
import { encryptSecret, logger, PLATFORM_IDS, redactSecrets } from "@adv/shared";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureConnectorsRegistered, getConnector, hasConnector } from "@/lib/connectors";
import { consumeOAuthState } from "@/lib/data/oauth-state";
import { OAUTH_STATE_COOKIE, oauthStateCookieOptions } from "@/lib/oauth-cookie";

/** Must match `start`'s redirect URI byte for byte, so it comes from config, never from the request host. */
function appUrl(): string {
  const value = process.env.APP_URL;
  if (!value) {
    throw new Error("APP_URL is not set - it is required to build OAuth redirect URIs");
  }
  return value.replace(/\/+$/, "");
}

/** Constant-time comparison that does not leak length through an exception. */
function statesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Only fixed, non-sensitive codes ever reach the browser: a connector/platform error message can
 * quote the token request it made. The detail goes to the server log instead.
 */
function errorCode(err: unknown): string {
  return err instanceof ConnectorError ? err.code : "connection_failed";
}

export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const log = logger.child({ route: "oauth-callback", platform });

  if (!(PLATFORM_IDS as readonly string[]).includes(platform)) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 404 });
  }
  const platformId = platform as (typeof PLATFORM_IDS)[number];

  // The callback is a user-initiated navigation: require the same session that started the flow.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", appUrl()));
  }

  const jar = await cookies();
  const cookieState = jar.get(OAUTH_STATE_COOKIE)?.value;
  // Whatever happens below, this one-shot cookie is spent.
  jar.set(OAUTH_STATE_COOKIE, "", { ...oauthStateCookieOptions(), maxAge: 0 });

  if (!state || !cookieState || !statesMatch(cookieState, state)) {
    log.warn("oauth callback: state cookie missing or mismatched");
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
  }

  const stateRow = await consumeOAuthState(state);
  if (!stateRow || stateRow.platform !== platformId || stateRow.userId !== session.user.id) {
    log.warn("oauth callback: state row missing, expired, or owned by another user");
    return NextResponse.json({ error: "Invalid or expired OAuth state" }, { status: 400 });
  }

  // Resolve the business's slug (trusted: stateRow was created by this same authenticated user) so we
  // can redirect back to the wizard with a toast regardless of the outcome below.
  const db = getDb();
  const [business] = await db
    .select()
    .from(businesses)
    .where(and(eq(businesses.id, stateRow.businessId), eq(businesses.userId, session.user.id)))
    .limit(1);
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }
  const setupUrl = new URL(`/b/${business.slug}/setup`, appUrl());

  if (oauthError || !code) {
    // The provider's own `error` param is echoed back only as a short fixed-shape code.
    const providerCode = oauthError ? oauthError.replace(/[^a-z0-9_-]/gi, "").slice(0, 40) : "missing_code";
    setupUrl.searchParams.set("oauthError", providerCode || "connection_failed");
    return NextResponse.redirect(setupUrl);
  }

  ensureConnectorsRegistered();
  if (!hasConnector(platformId)) {
    setupUrl.searchParams.set("oauthError", "connector_unavailable");
    return NextResponse.redirect(setupUrl);
  }
  const connector = getConnector(platformId);
  if (!connector.exchangeCode) {
    setupUrl.searchParams.set("oauthError", "not_oauth");
    return NextResponse.redirect(setupUrl);
  }

  try {
    const redirectUri = `${appUrl()}/api/oauth/${platformId}/callback`;
    const { tokens, account } = await connector.exchangeCode(code, {
      businessId: stateRow.businessId,
      redirectUri,
      state,
      codeVerifier: stateRow.codeVerifier ?? undefined,
    });

    const [existing] = await db
      .select()
      .from(platformAccounts)
      .where(
        and(
          eq(platformAccounts.businessId, stateRow.businessId),
          eq(platformAccounts.platform, platformId),
          eq(platformAccounts.ownership, "owned"),
        ),
      )
      .limit(1);

    const [saved] = existing
      ? await db
          .update(platformAccounts)
          .set({
            status: "connected",
            handle: account.handle ?? existing.handle,
            externalId: account.externalId ?? existing.externalId,
            config: { ...existing.config, ...account.config },
            lastError: null,
            lastSyncedAt: new Date(),
          })
          .where(eq(platformAccounts.id, existing.id))
          .returning()
      : await db
          .insert(platformAccounts)
          .values({
            businessId: stateRow.businessId,
            platform: platformId,
            ownership: "owned",
            status: "connected",
            handle: account.handle ?? null,
            externalId: account.externalId ?? null,
            config: account.config ?? {},
            lastSyncedAt: new Date(),
          })
          .returning();

    if (saved) {
      await db
        .insert(oauthTokens)
        .values({
          accountId: saved.id,
          accessTokenEnc: encryptSecret(tokens.accessToken),
          refreshTokenEnc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
          tokenType: tokens.tokenType ?? null,
          scopes: tokens.scopes ?? [],
          expiresAt: tokens.expiresAt ? new Date(tokens.expiresAt) : null,
        })
        .onConflictDoUpdate({
          target: oauthTokens.accountId,
          set: {
            accessTokenEnc: encryptSecret(tokens.accessToken),
            refreshTokenEnc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
            tokenType: tokens.tokenType ?? null,
            scopes: tokens.scopes ?? [],
            expiresAt: tokens.expiresAt ? new Date(tokens.expiresAt) : null,
          },
        });
    }

    setupUrl.searchParams.set("connected", platformId);
    return NextResponse.redirect(setupUrl);
  } catch (err) {
    log.error(
      { businessId: stateRow.businessId, error: redactSecrets(err instanceof Error ? err.message : err) },
      "oauth callback: token exchange failed",
    );
    setupUrl.searchParams.set("oauthError", errorCode(err));
    return NextResponse.redirect(setupUrl);
  }
}
