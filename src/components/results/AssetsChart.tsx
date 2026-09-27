"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProjectionRow } from "@/lib/engine/types";
import {
  ASSET_SERIES,
  ASSETS_ALL_COLOR,
  CHART_CHROME,
  formatAxisCurrency,
  totalAssets,
} from "@/components/results/chartUtils";
import { useIdleChartTooltip } from "@/components/results/useIdleChartTooltip";

type Mode = "all" | "breakdown";

type SeriesKey = (typeof ASSET_SERIES)[number]["key"];

export function AssetsChart({ rows }: { rows: ProjectionRow[] }) {
  const [mode, setMode] = useState<Mode>("all");

  const { data, visibleSeries } = useMemo(() => {
    const hasAfterTax = rows.some((r) => r.afterTaxTotal !== 0);
    const hasRealEstate = rows.some((r) => r.realEstateEquity !== 0);
    const visible = ASSET_SERIES.filter((s) => {
      if (s.key === "afterTax") return hasAfterTax;
      if (s.key === "realEstate") return hasRealEstate;
      return true;
    });

    const points = rows.map((row) => {
      const point: Record<string, number> = {
        year: row.calendarYear,
        all: totalAssets(row),
        retirement: row.retirementTotal,
        roth: row.rothTotal,
        afterTax: row.afterTaxTotal,
        realEstate: row.realEstateEquity,
      };
      return point;
    });

    return { data: points, visibleSeries: visible };
  }, [rows]);

  const { chartKey, onMouseLeave, tooltipProps } = useIdleChartTooltip(
    data.length,
  );

  return (
    <div className="rounded-2xl border border-border bg-white px-5 py-[18px]">
      <h3 className="mb-2.5 text-[14.5px] font-bold text-foreground">Assets</h3>

      <div className="h-64 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          {mode === "all" ? (
            <AreaChart
              key={chartKey}
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              onMouseLeave={onMouseLeave}
            >
              <defs>
                <linearGradient id="assetsAllFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ASSETS_ALL_COLOR} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={ASSETS_ALL_COLOR} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.grid} />
              <XAxis
                dataKey="year"
                tick={{ fill: CHART_CHROME.tick, fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: CHART_CHROME.axis }}
              />
              <YAxis
                tickFormatter={formatAxisCurrency}
                tick={{ fill: CHART_CHROME.tick, fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <Tooltip {...tooltipProps} />
              <Area
                type="monotone"
                dataKey="all"
                name="All assets"
                stroke={ASSETS_ALL_COLOR}
                strokeWidth={2}
                fill="url(#assetsAllFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          ) : (
            <LineChart
              key={chartKey}
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              onMouseLeave={onMouseLeave}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.grid} />
              <XAxis
                dataKey="year"
                tick={{ fill: CHART_CHROME.tick, fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: CHART_CHROME.axis }}
              />
              <YAxis
                tickFormatter={formatAxisCurrency}
                tick={{ fill: CHART_CHROME.tick, fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <Tooltip {...tooltipProps} />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                iconType="line"
              />
              {visibleSeries.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key as SeriesKey}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      <div className="flex justify-center pt-3">
        <div className="inline-flex rounded-[9px] bg-segment p-[3px]">
          <button
            type="button"
            onClick={() => setMode("all")}
            className={`h-7 rounded-[7px] px-3 text-xs font-bold transition ${
              mode === "all"
                ? "bg-white text-foreground shadow-sm"
                : "bg-transparent text-muted-2"
            }`}
          >
            All assets
          </button>
          <button
            type="button"
            onClick={() => setMode("breakdown")}
            className={`h-7 rounded-[7px] px-3 text-xs font-bold transition ${
              mode === "breakdown"
                ? "bg-white text-foreground shadow-sm"
                : "bg-transparent text-muted-2"
            }`}
          >
            Breakdown
          </button>
        </div>
      </div>
    </div>
  );
}
