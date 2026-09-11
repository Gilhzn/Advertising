import { formatUsd } from "@/lib/utils";

/** Status colors are reserved for state and never doubled as a series color. */
function colorFor(pct: number): string {
  if (pct >= 100) return "var(--chart-status-critical)";
  if (pct >= 80) return "var(--chart-status-warning)";
  return "var(--chart-status-good)";
}

export function BudgetProgressBar({ spend, budget }: { spend: number; budget: number }) {
  const pct = budget > 0 ? (spend / budget) * 100 : 0;
  const clamped = Math.min(100, pct);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{formatUsd(spend)}</span>
        <span className="text-muted-foreground">of {formatUsd(budget)} budget</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${clamped}%`, background: colorFor(pct) }}
        />
      </div>
      {pct >= 100 ? (
        <p className="text-xs font-medium" style={{ color: "var(--chart-status-critical)" }}>
          Over budget this month.
        </p>
      ) : pct >= 80 ? (
        <p className="text-xs font-medium" style={{ color: "var(--chart-status-warning)" }}>
          Approaching the monthly budget.
        </p>
      ) : null}
    </div>
  );
}
