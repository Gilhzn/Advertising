"use client";

import { RefreshCw, ThumbsUp } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { approveStrategyAction, rerunStrategyAction } from "@/lib/actions/strategy";

export function StrategyActions({
  businessId,
  slug,
  approved,
  hasChannelPlan,
}: {
  businessId: string;
  slug: string;
  approved: boolean;
  hasChannelPlan: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await rerunStrategyAction(businessId, slug);
            toast.success("Re-run queued");
          })
        }
      >
        <RefreshCw className="size-4" />
        Re-run
      </Button>
      {hasChannelPlan ? (
        <Button
          disabled={pending || approved}
          onClick={() =>
            startTransition(async () => {
              await approveStrategyAction(businessId, slug);
              toast.success("Strategy approved");
            })
          }
        >
          <ThumbsUp className="size-4" />
          {approved ? "Approved" : "Approve"}
        </Button>
      ) : null}
    </div>
  );
}
