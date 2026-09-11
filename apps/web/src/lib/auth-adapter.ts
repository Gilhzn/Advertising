import { eq, getDb, users } from "@adv/db";
import type { Adapter, AdapterUser, VerificationToken } from "next-auth/adapters";

/**
 * Minimal Auth.js adapter backed by the existing `users` table only.
 *
 * The schema has no `accounts` / `sessions` / `verification_tokens` tables
 * (see the report for the requested migration), so:
 *  - sessions always use the JWT strategy (no createSession/getSessionAndUser needed),
 *  - there is no OAuth/webauthn sign-in provider (no linkAccount/getUserByAccount needed),
 *  - magic-link verification tokens are kept in a process-local Map. That is fine for a
 *    single dev server but does NOT survive a restart or work across multiple instances -
 *    a real `verification_tokens` table is the schema change to make before using Resend
 *    login in a multi-instance deployment.
 */
const verificationTokens = new Map<string, VerificationToken>();

function tokenKey(identifier: string, token: string) {
  return `${identifier}:${token}`;
}

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
      verificationTokens.set(tokenKey(token.identifier, token.token), token);
      return token;
    },
    async useVerificationToken(params) {
      const key = tokenKey(params.identifier, params.token);
      const token = verificationTokens.get(key);
      verificationTokens.delete(key);
      return token ?? null;
    },
  };
}
