"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { disconnectAccountAction } from "@/lib/actions/setup";

export function DisconnectButton({
  businessId,
  slug,
  accountId,
}: {
  businessId: string;
  slug: string;
  accountId: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await disconnectAccountAction(businessId, slug, accountId);
          toast.success("Disconnected");
        })
      }
    >
      Disconnect
    </Button>
  );
}
