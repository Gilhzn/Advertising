import { eq, getDb, lt, oauthStates } from "@adv/db";
import type { PlatformId } from "@adv/shared";
import { randomToken } from "@adv/shared";

export type OAuthState = typeof oauthStates.$inferSelect;

/**
 * Creates a one-shot OAuth `state` row bound to the business *and* the signed-in user, so the
 * callback can refuse a state that was minted for somebody else's session.
 * Expired rows are swept first (they are never read again, and the table has no TTL job).
 */
export async function createOAuthState(
  businessId: string,
  userId: string,
  platform: PlatformId,
  codeVerifier?: string,
): Promise<OAuthState> {
  const db = getDb();
  await db.delete(oauthStates).where(lt(oauthStates.expiresAt, new Date()));
  const state = randomToken(24);
  const [row] = await db
    .insert(oauthStates)
    .values({
      state,
      businessId,
      userId,
      platform,
      codeVerifier: codeVerifier ?? null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    })
    .returning();
  if (!row) throw new Error("failed to create oauth state");
  return row;
}

/**
 * Deletes and returns the state row in a single statement, so two concurrent callbacks can never
 * both consume the same state (replay). Returns null when the row is missing or already expired.
 */
export async function consumeOAuthState(state: string): Promise<OAuthState | null> {
  const db = getDb();
  const [row] = await db.delete(oauthStates).where(eq(oauthStates.state, state)).returning();
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return row;
}
