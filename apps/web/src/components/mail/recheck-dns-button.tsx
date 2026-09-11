"use client";

import { RefreshCw } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { recheckMailboxDnsAction } from "@/lib/actions/mail";

export function RecheckDnsButton({
  businessId,
  slug,
  mailboxId,
}: {
  businessId: string;
  slug: string;
  mailboxId: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await recheckMailboxDnsAction(businessId, slug, mailboxId);
          toast.success("DNS re-check queued");
        })
      }
    >
      <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
      Re-check DNS
    </Button>
  );
}
