"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn as authSignIn, signOut as authSignOut } from "@/auth";

export async function signOutAction(): Promise<void> {
  await authSignOut({ redirectTo: "/login" });
}

export async function ownerSignInAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/");

  const headersList = await headers();
  // First hop only: behind a trusted proxy (Vercel) this is the real client IP; it's only used to
  // key an in-memory, best-effort rate limiter, so a spoofed value can't do worse than that IP's
  // own bucket.
  const forwardedFor = headersList.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";

  try {
    await authSignIn("owner-login", { email, password, ip, redirectTo: callbackUrl });
  } catch (err) {
    // `signIn()` runs Auth.js in "raw" mode here, so a failed `authorize` (thrown or returned
    // `null`) surfaces as a thrown `AuthError` instead of the usual redirect response - reproduce
    // that redirect ourselves so the login page can show a message. A *successful* sign-in also
    // throws (Next's internal `NEXT_REDIRECT`), which is not an `AuthError` and must propagate.
    if (err instanceof AuthError) {
      const code = "code" in err && typeof err.code === "string" ? err.code : "credentials";
      redirect(`/login?error=CredentialsSignin&code=${encodeURIComponent(code)}`);
    }
    throw err;
  }
}

export async function devSignInAction(formData: FormData): Promise<void> {
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_DEV_LOGIN !== "1") {
    throw new Error("Dev login is disabled.");
  }
  const email = String(formData.get("email") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/");
  await authSignIn("dev-login", { email, redirectTo: callbackUrl });
}

export async function magicLinkSignInAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/");
  await authSignIn("resend", { email, redirectTo: callbackUrl });
}
