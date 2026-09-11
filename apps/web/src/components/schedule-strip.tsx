import { CalendarDays } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScheduledDayCount } from "@/lib/data/posts";

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short" });

/** Mini calendar strip: scheduled-post counts for the next N days. */
export function ScheduleStrip({ days }: { days: ScheduledDayCount[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-4" />
          Next {days.length} days
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-2">
          {days.map((d) => {
            const date = new Date(`${d.day}T00:00:00Z`);
            const barHeight = d.count === 0 ? 2 : Math.max(6, (d.count / max) * 32);
            return (
              <div
                key={d.day}
                className="flex flex-col items-center gap-1.5 rounded-md border border-border p-2"
              >
                <span className="text-[10px] uppercase text-muted-foreground">{WEEKDAY.format(date)}</span>
                <span className="text-xs font-medium">{date.getUTCDate()}</span>
                <div className="flex h-8 w-full items-end justify-center">
                  <div
                    className="w-2.5 rounded-full"
                    style={{
                      height: `${barHeight}px`,
                      background: d.count > 0 ? "var(--chart-series-1)" : "var(--chart-grid)",
                    }}
                  />
                </div>
                <span className="text-xs font-semibold">{d.count}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
