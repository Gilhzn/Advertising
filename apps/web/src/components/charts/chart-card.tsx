import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Every chart on the dashboard is wrapped in this: a title (with units baked into it, e.g.
 * "Daily reach (users)"), and an empty state instead of an empty plot area when there is no
 * data yet. See the `dataviz` skill.
 */
export function ChartCard({
  title,
  description,
  isEmpty,
  emptyDescription,
  className,
  children,
}: {
  title: string;
  description?: string;
  isEmpty?: boolean;
  emptyDescription?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <EmptyState
            title="No data yet"
            description={emptyDescription ?? "Nothing to show for this period yet."}
          />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
