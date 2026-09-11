const GROUP_LABELS: Record<string, string> = {
  platforms: "Platforms",
  pillars: "Pillars",
  hours: "Hours",
  languages: "Languages",
};

/**
 * Small bar list per weight group (platforms/pillars/hours/languages). Weights are 0-2
 * multipliers, 1 = unchanged, so the bar's zero point is the middle (1.0) and it fills toward
 * the left when de-emphasised, right when boosted. One hue (magnitude, not identity).
 */
export function WeightsBars({ weights }: { weights: Record<string, Record<string, number>> }) {
  const groups = Object.entries(weights).filter(([, values]) => Object.keys(values).length > 0);
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">No learned weights yet.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {groups.map(([group, values]) => (
        <div key={group} className="flex flex-col gap-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {GROUP_LABELS[group] ?? group}
          </p>
          <ul className="flex flex-col gap-1.5">
            {Object.entries(values)
              .sort(([, a], [, b]) => b - a)
              .map(([key, value]) => {
                const pct = Math.min(100, (value / 2) * 100);
                const boosted = value >= 1;
                return (
                  <li key={key} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 truncate text-muted-foreground">{key}</span>
                    <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: boosted ? "var(--chart-series-1)" : "var(--chart-series-8)",
                        }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right font-mono text-muted-foreground">
                      {value.toFixed(1)}
                    </span>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}
