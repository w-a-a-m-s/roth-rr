import type { ProjectionRow } from "@/lib/engine/types";
import { formatCurrency } from "@/lib/format";

/** Compact axis labels: $1.2M, $450k, $12k. */
export function formatAxisCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    return `${sign}$${m >= 10 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    const k = abs / 1_000;
    return `${sign}$${k >= 100 ? k.toFixed(0) : k.toFixed(0)}k`;
  }
  return `${sign}$${Math.round(abs)}`;
}

/** Compact signed labels: +$1.2M, -$450k, $0. */
export function formatSignedAxisCurrency(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.5) {
    return formatAxisCurrency(0);
  }
  if (value > 0) return `+${formatAxisCurrency(value)}`;
  return formatAxisCurrency(value);
}

/** Recharts Tooltip formatter: currency value + series name. */
export function tooltipCurrencyFormatter(
  value: number | string | ReadonlyArray<number | string> | undefined,
  name: number | string | undefined,
): [string, string] {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = typeof raw === "number" ? raw : Number(raw);
  return [formatCurrency(Number.isFinite(n) ? n : 0), String(name ?? "")];
}

export function totalAssets(row: ProjectionRow): number {
  return (
    row.retirementTotal +
    row.rothTotal +
    row.afterTaxTotal +
    row.realEstateEquity +
    row.businessEquity
  );
}

/** Chart chrome shared across Assets / Cashflow. */
export const CHART_CHROME = {
  grid: "#EFEDE7",
  tick: "#9b968c",
  axis: "#E7E4DD",
  tooltipBorder: "#E7E4DD",
} as const;

/** Index of the final data point, for idle tooltip / active-dot display. */
export function lastChartDataIndex(length: number): number | undefined {
  return length > 0 ? length - 1 : undefined;
}

/** Shared Tooltip props. `idleLastPoint` keeps the last year open when idle. */
export function chartTooltipProps(
  dataLength: number,
  { idleLastPoint = true }: { idleLastPoint?: boolean } = {},
) {
  const defaultIndex = idleLastPoint
    ? lastChartDataIndex(dataLength)
    : undefined;
  return {
    ...(idleLastPoint
      ? { defaultIndex, active: defaultIndex !== undefined }
      : {}),
    isAnimationActive: false as const,
    formatter: tooltipCurrencyFormatter,
    labelFormatter: (year: unknown) => String(year),
    contentStyle: {
      borderRadius: 8,
      borderColor: CHART_CHROME.tooltipBorder,
      fontSize: 12,
      boxShadow: "0 4px 14px rgba(28, 25, 20, 0.08)",
    },
    // Pin top-right (overrides Recharts cursor-follow transform).
    wrapperStyle: {
      top: 12,
      right: 12,
      left: "auto",
      transform: "translate(0, 0)",
    },
  };
}

export const ASSET_SERIES = [
  { key: "retirement", label: "Retirement", color: "#2563EB" },
  { key: "roth", label: "Roth", color: "#2A52BE" },
  { key: "afterTax", label: "After-tax", color: "#0E7C66" },
  { key: "realEstate", label: "Real estate", color: "#B0552B" },
] as const;

export const ASSETS_ALL_COLOR = "#2563EB";

export const CASHFLOW_SERIES = [
  { key: "gross", label: "Gross income", color: "#2A52BE" },
  { key: "net", label: "Net income", color: "#2563EB" },
  { key: "expenses", label: "Expenses", color: "#C0492F" },
  { key: "deposits", label: "Deposits", color: "#B8791F" },
  { key: "surplus", label: "Surplus", color: "#1C8A5B" },
] as const;
