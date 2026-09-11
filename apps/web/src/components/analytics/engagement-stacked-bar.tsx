"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisTickStyle, tooltipContentStyle, tooltipLabelStyle } from "@/components/charts/tooltip-style";
import { platformLabel } from "@/components/platform-badge";
import { CATEGORICAL, CHART_GRID } from "@/lib/chart-palette";
import type { StackedEngagementRow } from "@/lib/data/social-analytics";

const SEGMENTS: Array<{ key: keyof Omit<StackedEngagementRow, "platform">; label: string }> = [
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
  { key: "clicks", label: "Clicks" },
];

/** Engagement composition per platform - one stacked bar per platform, segments colored by metric type. */
export function EngagementStackedBar({ rows }: { rows: StackedEngagementRow[] }) {
  const data = rows.map((r) => ({ ...r, platformLabel: platformLabel(r.platform as never) }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={CHART_GRID} />
        <XAxis type="number" tick={axisTickStyle} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
        <YAxis
          type="category"
          dataKey="platformLabel"
          width={100}
          tick={axisTickStyle}
          tickLine={false}
          axisLine={{ stroke: CHART_GRID }}
        />
        <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {SEGMENTS.map((seg, i) => (
          <Bar
            key={seg.key}
            dataKey={seg.key}
            name={seg.label}
            stackId="engagement"
            fill={CATEGORICAL[i]}
            radius={i === SEGMENTS.length - 1 ? [0, 4, 4, 0] : undefined}
            maxBarSize={22}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
