"use client";

import type { TopScreenRowSchema } from "@adv/analytics";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { z } from "zod";
import { axisTickStyle, tooltipContentStyle, tooltipLabelStyle } from "@/components/charts/tooltip-style";
import { CHART_GRID, SEQUENTIAL } from "@/lib/chart-palette";

type Row = z.infer<typeof TopScreenRowSchema>;

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "-";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Top screens by unique users, horizontal bars. Tooltip shows total time on screen. */
export function HotScreensChart({ rows }: { rows: Row[] }) {
  const data = [...rows]
    .sort((a, b) => b.uniqueUsers - a.uniqueUsers)
    .slice(0, 10)
    .map((r) => ({ ...r, screenShort: r.screen.length > 28 ? `${r.screen.slice(0, 27)}…` : r.screen }));

  const height = Math.max(160, data.length * 36);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={CHART_GRID} />
        <XAxis type="number" tick={axisTickStyle} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
        <YAxis
          type="category"
          dataKey="screenShort"
          width={140}
          tick={axisTickStyle}
          tickLine={false}
          axisLine={{ stroke: CHART_GRID }}
        />
        <Tooltip
          contentStyle={tooltipContentStyle}
          labelStyle={tooltipLabelStyle}
          formatter={(value, name, item) => {
            if (name === "uniqueUsers") {
              const row = item.payload as Row;
              return [`${value} users · ${formatDuration(row.totalDurationSeconds)} total`, "Users"];
            }
            return [value, name];
          }}
          labelFormatter={(_label, items) => (items[0]?.payload as Row | undefined)?.screen ?? ""}
        />
        <Bar
          dataKey="uniqueUsers"
          name="uniqueUsers"
          fill={SEQUENTIAL}
          radius={[0, 4, 4, 0]}
          maxBarSize={18}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
