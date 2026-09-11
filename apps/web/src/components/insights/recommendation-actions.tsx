"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setRecommendationStatusAction } from "@/lib/actions/insights";

export function RecommendationActions({ id, status }: { id: string; status: string }) {
  const [pending, startTransition] = useTransition();
  if (status !== "open") return null;

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await setRecommendationStatusAction(id, "accepted");
            toast.success("Accepted");
          })
        }
      >
        Accept
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await setRecommendationStatusAction(id, "dismissed");
            toast.success("Dismissed");
          })
        }
      >
        Dismiss
      </Button>
    </div>
  );
}
