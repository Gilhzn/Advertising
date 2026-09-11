/**
 * Shared Recharts palette. Values are CSS custom properties (defined in
 * `globals.css` for both light and dark) so every chart stays in sync with the
 * app theme automatically - no JS media-query branching needed.
 *
 * Categorical hues are assigned in a fixed order (never cycled/generated) and
 * never repainted when a filter changes the visible series count. Sequential
 * (magnitude) contexts use a single hue - `sequential` below. Status colors are
 * reserved for state (good/warning/serious/critical) and never reused as a
 * series color. See the `dataviz` skill for the full method this implements.
 */

export const CHART_SURFACE = "var(--chart-surface)";
export const CHART_GRID = "var(--chart-grid)";
export const CHART_AXIS = "var(--chart-axis)";
export const CHART_INK_MUTED = "var(--chart-ink-muted)";

/** Fixed-order categorical slots. Use in order; never cycle past 8 - fold extras into "Other". */
export const CATEGORICAL = [
  "var(--chart-series-1)", // blue
  "var(--chart-series-2)", // orange
  "var(--chart-series-3)", // aqua
  "var(--chart-series-4)", // yellow
  "var(--chart-series-5)", // magenta
  "var(--chart-series-6)", // green
  "var(--chart-series-7)", // violet
  "var(--chart-series-8)", // red
] as const;

/** Default single hue for magnitude (sequential) encodings, e.g. one-series bar/line charts. */
export const SEQUENTIAL = "var(--chart-series-1)";

export const STATUS = {
  good: "var(--chart-status-good)",
  warning: "var(--chart-status-warning)",
  serious: "var(--chart-status-serious)",
  critical: "var(--chart-status-critical)",
} as const;

/** Stable color for a set of category keys (e.g. platform ids), assigned in first-seen order. */
export function categoricalColorFor(key: string, allKeysInOrder: readonly string[]): string {
  const idx = allKeysInOrder.indexOf(key);
  if (idx < 0 || idx >= CATEGORICAL.length) return CHART_INK_MUTED;
  return CATEGORICAL[idx] ?? CHART_INK_MUTED;
}

export function makeColorMap(keysInOrder: readonly string[]): Record<string, string> {
  const map: Record<string, string> = {};
  keysInOrder.forEach((key, i) => {
    map[key] = CATEGORICAL[i % CATEGORICAL.length] ?? CHART_INK_MUTED;
  });
  return map;
}
