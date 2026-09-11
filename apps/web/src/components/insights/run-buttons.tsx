"use client";

import { BarChart3, RefreshCw, Sparkles } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { replanStrategyAction, runAnalystNowAction, runProductAdvisorAction } from "@/lib/actions/insights";

export function InsightsRunButtons({ businessId, slug }: { businessId: string; slug: string }) {
  const [pending, startTransition] = useTransition();

  const run = (action: (businessId: string, slug: string) => Promise<void>, label: string) =>
    startTransition(async () => {
      await action(businessId, slug);
      toast.success(`${label} queued`);
    });

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run(runAnalystNowAction, "Analyst run")}
      >
        <Sparkles className="size-4" />
        Run analyst now
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run(runProductAdvisorAction, "Product advisor run")}
      >
        <BarChart3 className="size-4" />
        Run product advisor
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run(replanStrategyAction, "Re-plan")}
      >
        <RefreshCw className="size-4" />
        Re-plan strategy
      </Button>
    </div>
  );
}
