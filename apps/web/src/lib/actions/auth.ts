"use server";

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

  try {
    // No `ip` is passed: the provider derives the rate-limiter key from the request headers itself.
    // Sending it as a credential meant the value travelled in the POST body, where a client posting
    // directly to the callback endpoint could forge a new one per attempt.
    await authSignIn("owner-login", { email, password, redirectTo: callbackUrl });
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
