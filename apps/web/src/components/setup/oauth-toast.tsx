"use client";

import type { PlatformId } from "@adv/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { platformLabel } from "@/components/platform-badge";

export function OAuthToast() {
  const params = useSearchParams();
  const router = useRouter();
  const connected = params.get("connected");
  const oauthError = params.get("oauthError");

  useEffect(() => {
    if (connected) toast.success(`${platformLabel(connected as PlatformId)} connected`);
    if (oauthError) toast.error(`Connection failed: ${oauthError}`);
    if (connected || oauthError) {
      const url = new URL(window.location.href);
      url.searchParams.delete("connected");
      url.searchParams.delete("oauthError");
      router.replace(url.pathname + url.search);
    }
  }, [connected, oauthError, router]);

  return null;
}
