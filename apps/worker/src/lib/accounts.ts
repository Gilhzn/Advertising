import type { ConnectedAccount, Connector, OAuthTokens } from "@adv/connectors";
import { eq, getDb, oauthTokens, platformAccounts } from "@adv/db";
import { decryptSecret, encryptSecret } from "@adv/shared";

export type AccountStatus = "pending" | "connected" | "error" | "disconnected";

export interface LoadedAccount extends ConnectedAccount {
  status: AccountStatus;
}

/** Loads a platform account with its OAuth tokens decrypted, or null if it does not exist. */
export async function loadAccount(accountId: string): Promise<LoadedAccount | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: platformAccounts.id,
      businessId: platformAccounts.businessId,
      platform: platformAccounts.platform,
      ownership: platformAccounts.ownership,
      externalId: platformAccounts.externalId,
      handle: platformAccounts.handle,
      config: platformAccounts.config,
      status: platformAccounts.status,
      accessTokenEnc: oauthTokens.accessTokenEnc,
      refreshTokenEnc: oauthTokens.refreshTokenEnc,
      tokenType: oauthTokens.tokenType,
      scopes: oauthTokens.scopes,
      expiresAt: oauthTokens.expiresAt,
    })
    .from(platformAccounts)
    .leftJoin(oauthTokens, eq(oauthTokens.accountId, platformAccounts.id))
    .where(eq(platformAccounts.id, accountId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const tokens: OAuthTokens | null = row.accessTokenEnc
    ? {
        accessToken: decryptSecret(row.accessTokenEnc),
        refreshToken: row.refreshTokenEnc ? decryptSecret(row.refreshTokenEnc) : undefined,
        tokenType: row.tokenType ?? undefined,
        scopes: row.scopes ?? [],
        expiresAt: row.expiresAt ? row.expiresAt.toISOString() : undefined,
      }
    : null;

  return {
    id: row.id,
    businessId: row.businessId,
    platform: row.platform,
    ownership: row.ownership,
    externalId: row.externalId,
    handle: row.handle,
    config: (row.config ?? {}) as Record<string, unknown>,
    tokens,
    status: row.status,
  };
}

/** True when `tokens.expiresAt` is unset-soon (within `withinMs`, default 10 minutes). */
export function isExpiringSoon(tokens: OAuthTokens | null | undefined, withinMs = 10 * 60 * 1000): boolean {
  if (!tokens?.expiresAt) return false;
  return new Date(tokens.expiresAt).getTime() - Date.now() < withinMs;
}

/** Re-encrypts and upserts refreshed tokens for an account. */
export async function persistTokens(accountId: string, tokens: OAuthTokens): Promise<void> {
  const db = getDb();
  const accessTokenEnc = encryptSecret(tokens.accessToken);
  const refreshTokenEnc = tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null;
  const expiresAt = tokens.expiresAt ? new Date(tokens.expiresAt) : null;
  const values = {
    accountId,
    accessTokenEnc,
    refreshTokenEnc,
    tokenType: tokens.tokenType ?? null,
    scopes: tokens.scopes ?? [],
    expiresAt,
  };
  await db
    .insert(oauthTokens)
    .values(values)
    .onConflictDoUpdate({
      target: oauthTokens.accountId,
      set: { ...values, updatedAt: new Date() },
    });
}

/** Merges `patch` into the account's `config` jsonb column (shallow merge). */
export async function mergeAccountConfig(accountId: string, patch: Record<string, unknown>): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ config: platformAccounts.config })
    .from(platformAccounts)
    .where(eq(platformAccounts.id, accountId))
    .limit(1);
  const merged = { ...(row?.config ?? {}), ...patch };
  await db.update(platformAccounts).set({ config: merged }).where(eq(platformAccounts.id, accountId));
}

/**
 * Refreshes an account's tokens, preferring `connector.refreshForAccount` (needs account context -
 * Bluesky's PDS host, Meta's page id) over the plain `connector.refresh(tokens)`, and persists the
 * result (re-encrypted tokens, plus any `config` patch). Returns the fresh tokens, or `null` when the
 * connector supports neither refresh method or the account has no tokens to refresh.
 */
export async function refreshAccountTokens(
  connector: Pick<Connector, "refresh" | "refreshForAccount">,
  account: LoadedAccount,
): Promise<OAuthTokens | null> {
  if (connector.refreshForAccount) {
    const { tokens, config } = await connector.refreshForAccount(account);
    await persistTokens(account.id, tokens);
    if (config) await mergeAccountConfig(account.id, config);
    return tokens;
  }
  if (connector.refresh && account.tokens) {
    const tokens = await connector.refresh(account.tokens);
    await persistTokens(account.id, tokens);
    return tokens;
  }
  return null;
}
