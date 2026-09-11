import { eq, getDb, oauthStates } from "@adv/db";
import type { PlatformId } from "@adv/shared";
import { randomToken } from "@adv/shared";

export type OAuthState = typeof oauthStates.$inferSelect;

export async function createOAuthState(
  businessId: string,
  platform: PlatformId,
  codeVerifier?: string,
): Promise<OAuthState> {
  const db = getDb();
  const state = randomToken(24);
  const [row] = await db
    .insert(oauthStates)
    .values({
      state,
      businessId,
      platform,
      codeVerifier: codeVerifier ?? null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    })
    .returning();
  if (!row) throw new Error("failed to create oauth state");
  return row;
}

export async function consumeOAuthState(state: string): Promise<OAuthState | null> {
  const db = getDb();
  const [row] = await db.select().from(oauthStates).where(eq(oauthStates.state, state)).limit(1);
  if (!row) return null;
  await db.delete(oauthStates).where(eq(oauthStates.state, state));
  if (row.expiresAt.getTime() < Date.now()) return null;
  return row;
}
