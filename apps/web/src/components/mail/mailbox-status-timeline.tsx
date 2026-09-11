import { AlertCircle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "pending_dns", label: "Pending DNS" },
  { key: "provisioning", label: "Provisioning" },
  { key: "active", label: "Active" },
] as const;

export function MailboxStatusTimeline({
  status,
  lastError,
}: {
  status: "pending_dns" | "provisioning" | "active" | "error";
  lastError?: string | null;
}) {
  const currentIndex =
    status === "error"
      ? STEPS.findIndex((s) => s.key === "pending_dns")
      : STEPS.findIndex((s) => s.key === status);

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex items-center gap-2">
        {STEPS.map((step, i) => {
          const done = status !== "error" && i < currentIndex;
          const active = status !== "error" && i === currentIndex;
          const errored = status === "error" && i === 0;
          return (
            <li key={step.key} className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                  done && "border-success bg-success/15 text-success",
                  active && "border-warning bg-warning/15 text-warning",
                  errored && "border-destructive bg-destructive/15 text-destructive",
                  !done && !active && !errored && "border-border text-muted-foreground",
                )}
              >
                {done ? (
                  <Check className="size-3.5" />
                ) : errored ? (
                  <AlertCircle className="size-3.5" />
                ) : active ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  i + 1
                )}
              </div>
              <span className={cn("text-xs", active ? "font-medium" : "text-muted-foreground")}>
                {step.label}
              </span>
              {i < STEPS.length - 1 ? <div className="h-px flex-1 bg-border" /> : null}
            </li>
          );
        })}
      </ol>
      {status === "error" && lastError ? (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" /> {lastError}
        </p>
      ) : null}
    </div>
  );
}
