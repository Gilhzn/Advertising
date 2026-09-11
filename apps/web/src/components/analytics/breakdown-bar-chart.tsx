"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisTickStyle, tooltipContentStyle, tooltipLabelStyle } from "@/components/charts/tooltip-style";
import { CHART_GRID, SEQUENTIAL } from "@/lib/chart-palette";
import type { BreakdownRow } from "@/lib/data/social-analytics";

/** Generic single-measure breakdown (engagement by pillar / hour-of-day / language) - one hue. */
export function BreakdownBarChart({
  rows,
  keyFormatter,
  valueLabel,
}: {
  rows: BreakdownRow[];
  keyFormatter?: (key: string) => string;
  valueLabel: string;
}) {
  const data = rows.map((r) => ({ ...r, label: keyFormatter ? keyFormatter(r.key) : r.key }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={CHART_GRID} />
        <XAxis type="number" tick={axisTickStyle} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
        <YAxis
          type="category"
          dataKey="label"
          width={90}
          tick={axisTickStyle}
          tickLine={false}
          axisLine={{ stroke: CHART_GRID }}
        />
        <Tooltip
          contentStyle={tooltipContentStyle}
          labelStyle={tooltipLabelStyle}
          formatter={(value) => [value, valueLabel]}
        />
        <Bar dataKey="value" name={valueLabel} fill={SEQUENTIAL} radius={[0, 4, 4, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}
