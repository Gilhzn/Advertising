"use client";

import { Sparkles } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateContentBatchAction } from "@/lib/actions/content";

export function GenerateButton({ businessId, slug }: { businessId: string; slug: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await generateContentBatchAction(businessId, slug);
          toast.success("Queued: generating the next 7 days");
        })
      }
    >
      <Sparkles className="size-4" />
      Generate next 7 days
    </Button>
  );
}
