import { and, eq, getDb, users, verificationTokens } from "@adv/db";
import type { Adapter, AdapterUser } from "next-auth/adapters";

/**
 * Minimal Auth.js adapter backed by the `users` and `verification_tokens` tables.
 *
 * The schema has no `accounts` / `sessions` tables, so:
 *  - sessions always use the JWT strategy (no createSession/getSessionAndUser needed),
 *  - there is no OAuth/webauthn sign-in provider (no linkAccount/getUserByAccount needed).
 * Magic-link verification tokens are persisted in `verification_tokens`, so they survive a
 * restart and work across multiple instances (unlike the previous process-local Map).
 */

function toAdapterUser(row: typeof users.$inferSelect): AdapterUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    image: row.image,
    emailVerified: row.emailVerified,
  };
}

export function buildAdapter(): Adapter {
  const db = getDb();
  return {
    async createUser(user) {
      const [row] = await db
        .insert(users)
        .values({ email: user.email, name: user.name ?? null, image: user.image ?? null })
        .onConflictDoUpdate({ target: users.email, set: { name: user.name ?? null } })
        .returning();
      if (!row) throw new Error("failed to create user");
      return toAdapterUser(row);
    },
    async getUser(id) {
      const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return row ? toAdapterUser(row) : null;
    },
    async getUserByEmail(email) {
      const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return row ? toAdapterUser(row) : null;
    },
    async getUserByAccount() {
      return null;
    },
    async updateUser(user) {
      const [row] = await db
        .update(users)
        .set({
          name: user.name ?? undefined,
          image: user.image ?? undefined,
          emailVerified: user.emailVerified ?? undefined,
        })
        .where(eq(users.id, user.id))
        .returning();
      if (!row) throw new Error("user not found");
      return toAdapterUser(row);
    },
    async deleteUser(id) {
      await db.delete(users).where(eq(users.id, id));
    },
    async linkAccount() {
      return undefined;
    },
    async unlinkAccount() {
      return undefined;
    },
    async createSession(session) {
      return session as never;
    },
    async getSessionAndUser() {
      return null;
    },
    async updateSession() {
      return null;
    },
    async deleteSession() {
      return undefined;
    },
    async createVerificationToken(token) {
      await db.insert(verificationTokens).values({
        identifier: token.identifier,
        token: token.token,
        expires: token.expires,
      });
      return token;
    },
    async useVerificationToken(params) {
      const [row] = await db
        .select()
        .from(verificationTokens)
        .where(
          and(
            eq(verificationTokens.identifier, params.identifier),
            eq(verificationTokens.token, params.token),
          ),
        )
        .limit(1);
      if (!row) return null;
      await db
        .delete(verificationTokens)
        .where(
          and(
            eq(verificationTokens.identifier, params.identifier),
            eq(verificationTokens.token, params.token),
          ),
        );
      return row;
    },
  };
}
