import type { CSSProperties } from "react";

/** Shared Recharts <Tooltip> / axis styling so every chart matches the app theme, light + dark. */
export const tooltipContentStyle: CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  fontSize: 12,
  color: "var(--card-foreground)",
};

export const tooltipLabelStyle: CSSProperties = {
  color: "var(--muted-foreground)",
  marginBottom: 4,
};

export const axisTickStyle = { fontSize: 11, fill: "var(--chart-ink-muted)" };
