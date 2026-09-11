"use client";

import { GitPullRequest } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openAppPrAction } from "@/lib/actions/insights";

export function OpenPrButton({
  businessId,
  slug,
  recommendationId,
}: {
  businessId: string;
  slug: string;
  recommendationId: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await openAppPrAction(businessId, slug, recommendationId);
            toast.success("Queued: opening a PR");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not queue the PR.");
          }
        })
      }
    >
      <GitPullRequest className="size-4" />
      {pending ? "Queuing…" : "Open PR"}
    </Button>
  );
}
