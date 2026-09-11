import { and, businesses, eq, getDb, oauthTokens, platformAccounts } from "@adv/db";
import { encryptSecret, PLATFORM_IDS } from "@adv/shared";
import { NextResponse } from "next/server";
import { ensureConnectorsRegistered, getConnector, hasConnector } from "@/lib/connectors";
import { consumeOAuthState } from "@/lib/data/oauth-state";

export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (!(PLATFORM_IDS as readonly string[]).includes(platform)) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 404 });
  }
  const platformId = platform as (typeof PLATFORM_IDS)[number];

  if (!state) {
    return NextResponse.json({ error: "Missing state" }, { status: 400 });
  }
  const stateRow = await consumeOAuthState(state);
  if (!stateRow || stateRow.platform !== platformId) {
    return NextResponse.json({ error: "Invalid or expired OAuth state" }, { status: 400 });
  }

  // Resolve the business's slug (trusted: stateRow was created by an authenticated request) so we
  // can redirect back to the wizard with a toast regardless of the outcome below.
  const db = getDb();
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, stateRow.businessId))
    .limit(1);
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }
  const setupUrl = new URL(`/b/${business.slug}/setup`, url.origin);

  if (oauthError || !code) {
    setupUrl.searchParams.set("oauthError", oauthError ?? "missing_code");
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
    const redirectUri = `${process.env.APP_URL ?? url.origin}/api/oauth/${platformId}/callback`;
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
    setupUrl.searchParams.set("oauthError", err instanceof Error ? err.message : "connection_failed");
    return NextResponse.redirect(setupUrl);
  }
}
