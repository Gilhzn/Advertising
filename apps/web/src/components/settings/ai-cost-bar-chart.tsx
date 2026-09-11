"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisTickStyle, tooltipContentStyle, tooltipLabelStyle } from "@/components/charts/tooltip-style";
import { CHART_GRID, SEQUENTIAL } from "@/lib/chart-palette";
import type { JobAgentSpend } from "@/lib/data/agent-runs";
import { formatUsd } from "@/lib/utils";

export function AiCostBarChart({ rows }: { rows: JobAgentSpend[] }) {
  const data = rows.slice(0, 10).map((r) => ({ ...r, label: `${r.jobName} (${r.agent})` }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={CHART_GRID} />
        <XAxis
          type="number"
          tickFormatter={(v) => formatUsd(v)}
          tick={axisTickStyle}
          tickLine={false}
          axisLine={{ stroke: CHART_GRID }}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={160}
          tick={axisTickStyle}
          tickLine={false}
          axisLine={{ stroke: CHART_GRID }}
        />
        <Tooltip
          contentStyle={tooltipContentStyle}
          labelStyle={tooltipLabelStyle}
          formatter={(value, _name, item) => [
            `${formatUsd(value as number)} (${item.payload.runs} runs)`,
            "Cost",
          ]}
        />
        <Bar dataKey="costUsd" name="Cost" fill={SEQUENTIAL} radius={[0, 4, 4, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}
