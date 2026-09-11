import Link from "next/link";
import { cn } from "@/lib/utils";

const PERIODS = [7, 30, 90] as const;

export function PeriodPicker({ slug, days }: { slug: string; days: number }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
      {PERIODS.map((p) => (
        <Link
          key={p}
          href={`/b/${slug}/analytics?days=${p}`}
          className={cn(
            "rounded-md px-3 py-1 text-sm font-medium transition-colors",
            days === p ? "bg-background shadow" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {p}d
        </Link>
      ))}
    </div>
  );
}
