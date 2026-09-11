import { eq, getDb, users } from "@adv/db";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
import { buildAdapter } from "@/lib/auth-adapter";

const providers = [];

if (process.env.NODE_ENV !== "production") {
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
