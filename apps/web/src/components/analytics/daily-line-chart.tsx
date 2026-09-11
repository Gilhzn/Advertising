"use client";

import type { PlatformId } from "@adv/shared";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisTickStyle, tooltipContentStyle, tooltipLabelStyle } from "@/components/charts/tooltip-style";
import { platformLabel } from "@/components/platform-badge";
import { CHART_GRID, makeColorMap } from "@/lib/chart-palette";
import type { DailySeriesPoint } from "@/lib/data/social-analytics";
import { formatDate } from "@/lib/utils";

/** One measure (e.g. reach) as daily lines, one per platform. Never combine two measures on one axis. */
export function DailyLineChart({ data, platforms }: { data: DailySeriesPoint[]; platforms: PlatformId[] }) {
  const colorMap = makeColorMap(platforms);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={CHART_GRID} />
        <XAxis
          dataKey="day"
          tickFormatter={(v) => formatDate(v)}
          tick={axisTickStyle}
          tickLine={false}
          axisLine={{ stroke: CHART_GRID }}
        />
        <YAxis tick={axisTickStyle} tickLine={false} axisLine={{ stroke: CHART_GRID }} width={44} />
        <Tooltip
          contentStyle={tooltipContentStyle}
          labelStyle={tooltipLabelStyle}
          labelFormatter={(v) => formatDate(v as string)}
        />
        {platforms.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
        {platforms.map((p) => (
          <Line
            key={p}
            type="monotone"
            dataKey={p}
            name={platformLabel(p)}
            stroke={colorMap[p]}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
