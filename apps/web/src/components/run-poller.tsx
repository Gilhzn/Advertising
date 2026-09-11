"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** While `running`, calls router.refresh() every `intervalMs` so the page picks up the agent_run's final state. */
export function RunPoller({ running, intervalMs = 5000 }: { running: boolean; intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [running, intervalMs, router]);

  if (!running) return null;
  return (
    <div className="mb-4 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
      <Loader2 className="size-4 animate-spin" />
      Running - this page refreshes automatically.
    </div>
  );
}
