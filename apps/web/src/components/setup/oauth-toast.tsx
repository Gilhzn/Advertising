"use client";

import type { PlatformId } from "@adv/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { platformLabel } from "@/components/platform-badge";

/** Fixed codes the callback route is allowed to return (never raw provider/connector messages). */
const ERROR_MESSAGES: Record<string, string> = {
  auth_expired: "the platform rejected the authorization - try again",
  rate_limited: "the platform is rate limiting us - try again in a few minutes",
  not_configured: "this platform's app credentials are not configured",
  network: "could not reach the platform",
  rejected: "the platform rejected the connection",
  connector_unavailable: "this platform's connector isn't available yet",
  not_oauth: "this platform does not use OAuth",
  missing_code: "the platform did not return an authorization code",
  access_denied: "you declined the permission request",
  connection_failed: "please try again",
};

export function OAuthToast() {
  const params = useSearchParams();
  const router = useRouter();
  const connected = params.get("connected");
  const oauthError = params.get("oauthError");

  useEffect(() => {
    if (connected) toast.success(`${platformLabel(connected as PlatformId)} connected`);
    if (oauthError) {
      toast.error(`Connection failed: ${ERROR_MESSAGES[oauthError] ?? oauthError}`);
    }
    if (connected || oauthError) {
      const url = new URL(window.location.href);
      url.searchParams.delete("connected");
      url.searchParams.delete("oauthError");
      router.replace(url.pathname + url.search);
    }
  }, [connected, oauthError, router]);

  return null;
}
