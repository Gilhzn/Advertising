"use client";

import { RefreshCw } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { syncProductAnalyticsAction } from "@/lib/actions/product";

export function SyncNowButton({ businessId, slug }: { businessId: string; slug: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await syncProductAnalyticsAction(businessId, slug);
          toast.success("Sync queued");
        })
      }
    >
      <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
      Sync now
    </Button>
  );
}
