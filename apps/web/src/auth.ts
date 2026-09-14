import { eq, getDb, users } from "@adv/db";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
import { buildAdapter } from "@/lib/auth-adapter";
import {
  checkLoginAttempt,
  isOwnerLoginEnabled,
  recordLoginFailure,
  recordLoginSuccess,
  verifyOwnerCredentials,
} from "@/lib/owner-auth";

/**
 * Best-effort client address for the login rate limiter, taken from headers the runtime sets.
 *
 * `x-forwarded-for` is a client-appendable list, so its LEFTMOST entry is attacker-controlled and
 * useless as a limiter key. The rightmost entry is the one the nearest proxy appended, and
 * `x-real-ip` (which Vercel sets) is better still. Neither is a security boundary on its own -
 * that is what the address-independent global ceiling in `owner-auth` is for.
 */
function clientIpFrom(request: unknown): string {
  const headers = (request as { headers?: Headers } | undefined)?.headers;
  if (!headers || typeof headers.get !== "function") return "unknown";
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = headers.get("x-forwarded-for");
  const hops =
    forwarded
      ?.split(",")
      .map((h) => h.trim())
      .filter(Boolean) ?? [];
  return hops[hops.length - 1] ?? "unknown";
}

const providers = [];

/** Thrown by the `owner-login` provider so the login page can tell the two failure modes apart. */
class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}
class InvalidOwnerCredentialsError extends CredentialsSignin {
  code = "invalid_credentials";
}

/**
 * Owner-password login: the single production sign-in path (the dashboard has no self-serve
 * signup - see CLAUDE.md). Gated on `OWNER_EMAIL` + `OWNER_PASSWORD_HASH`/`OWNER_PASSWORD` being
 * set (`isOwnerLoginEnabled`), so it's simply absent from `providers` otherwise.
 */
if (isOwnerLoginEnabled()) {
  providers.push(
    Credentials({
      id: "owner-login",
      name: "Owner login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        // The rate-limiter key comes from the REQUEST, never from the credentials object. It used
        // to be declared as a credential and read from the POST body, so anyone posting straight to
        // /api/auth/callback/credentials could send a fresh random `ip` on every attempt and the
        // limiter counted each one in its own empty bucket - an unlimited password oracle.
        const ip = clientIpFrom(request);
        if (!checkLoginAttempt(ip).allowed) throw new RateLimitedError();

        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");

        // Never log `password` or the raw credentials object below this line.
        const matches = verifyOwnerCredentials(email, password);
        if (!matches) {
          recordLoginFailure(ip);
          throw new InvalidOwnerCredentialsError();
        }
        recordLoginSuccess(ip);

        const db = getDb();
        const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (existing) return { id: existing.id, email: existing.email, name: existing.name };
        const [created] = await db
          .insert(users)
          .values({ email, name: email.split("@")[0] })
          .returning();
        if (!created) return null;
        return { id: created.id, email: created.email, name: created.name };
      },
    }),
  );
}

/**
 * Dev-only password-less login. Double-gated: never in a production build, and even outside
 * production it has to be switched on explicitly with `ENABLE_DEV_LOGIN=1` (set in `.env.example`
 * and in the Playwright webServer env), so a staging deploy built with NODE_ENV!=production cannot
 * accidentally ship an "any email signs in" provider.
 */
const devLoginEnabled = process.env.NODE_ENV !== "production" && process.env.ENABLE_DEV_LOGIN === "1";

if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: "dev-login",
      name: "Dev login",
      credentials: {
        email: { label: "Email", type: "email" },
        name: { label: "Name", type: "text" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        if (!email.includes("@")) return null;
        const db = getDb();
        const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (existing) return { id: existing.id, email: existing.email, name: existing.name };
        const name = credentials?.name ? String(credentials.name) : email.split("@")[0];
        const [created] = await db.insert(users).values({ email, name }).returning();
        if (!created) return null;
        return { id: created.id, email: created.email, name: created.name };
      },
    }),
  );
}

if (process.env.RESEND_API_KEY) {
  providers.push(
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.AUTH_EMAIL_FROM ?? "login@example.com",
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: buildAdapter(),
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.uid === "string") {
        session.user.id = token.uid;
      }
      return session;
    },
  },
});
