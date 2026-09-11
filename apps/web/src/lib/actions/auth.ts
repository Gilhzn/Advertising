"use server";

import { signIn as authSignIn, signOut as authSignOut } from "@/auth";

export async function signOutAction(): Promise<void> {
  await authSignOut({ redirectTo: "/login" });
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
