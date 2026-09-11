"use client";

import type { RetentionRowSchema } from "@adv/analytics";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { z } from "zod";
import { axisTickStyle, tooltipContentStyle, tooltipLabelStyle } from "@/components/charts/tooltip-style";
import { CHART_GRID, SEQUENTIAL } from "@/lib/chart-palette";
import { formatDate } from "@/lib/utils";

type Row = z.infer<typeof RetentionRowSchema>;

/** Retention rate (%) by cohort start date — one series, so one hue. */
export function RetentionChart({ rows }: { rows: Row[] }) {
  const data = [...rows]
    .sort((a, b) => a.cohortDate.localeCompare(b.cohortDate))
    .map((r) => ({ ...r, retentionPct: Math.round(r.retentionRate * 1000) / 10 }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={CHART_GRID} />
        <XAxis
          dataKey="cohortDate"
          tickFormatter={(v) => formatDate(v)}
          tick={axisTickStyle}
          tickLine={false}
          axisLine={{ stroke: CHART_GRID }}
        />
        <YAxis
          tickFormatter={(v) => `${v}%`}
          tick={axisTickStyle}
          tickLine={false}
          axisLine={{ stroke: CHART_GRID }}
          width={44}
        />
        <Tooltip
          contentStyle={tooltipContentStyle}
          labelStyle={tooltipLabelStyle}
          labelFormatter={(v) => formatDate(v as string)}
          formatter={(value, _name, item) => {
            const row = item.payload as Row & { retentionPct: number };
            return [`${value}% (${row.retainedUsers}/${row.cohortSize} users)`, "Retention"];
          }}
        />
        <Line
          type="monotone"
          dataKey="retentionPct"
          name="retentionPct"
          stroke={SEQUENTIAL}
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
