"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProjectionRow } from "@/lib/engine/types";
import {
  CASHFLOW_SERIES,
  CHART_CHROME,
  formatAxisCurrency,
} from "@/components/results/chartUtils";
import { useIdleChartTooltip } from "@/components/results/useIdleChartTooltip";

type SeriesKey = (typeof CASHFLOW_SERIES)[number]["key"];

export function CashflowChart({ rows }: { rows: ProjectionRow[] }) {
  const [enabled, setEnabled] = useState<Record<SeriesKey, boolean>>({
    gross: true,
    net: true,
    expenses: true,
    deposits: true,
    surplus: true,
  });

  const data = useMemo(
    () =>
      rows.map((row) => ({
        year: row.calendarYear,
        gross: row.totalMonthlyIncome * 12,
        net: row.netAnnualIncome,
        expenses: row.monthlyExpenses * 12,
        deposits: row.monthlyDeposits * 12,
        surplus: row.surplus * 12,
      })),
    [rows],
  );

  // Most plans have no deposits: skip the flat zero line and its toggle.
  const series = useMemo(() => {
    const hasDeposits = rows.some((row) => row.monthlyDeposits !== 0);
    return CASHFLOW_SERIES.filter((s) => hasDeposits || s.key !== "deposits");
  }, [rows]);

  const { chartKey, onMouseLeave, tooltipProps } = useIdleChartTooltip(
    data.length,
  );

  const toggle = (key: SeriesKey) => {
    setEnabled((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // Keep at least one series visible.
      if (!Object.values(next).some(Boolean)) return prev;
      return next;
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-white px-5 py-[18px]">
      <h3 className="mb-2.5 text-[14.5px] font-bold text-foreground">Cash flow</h3>

      <div className="h-64 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
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
            {series.map((s) =>
              enabled[s.key] ? (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ) : null,
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {series.map((s) => {
          const on = enabled[s.key];
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              aria-pressed={on}
              className={`inline-flex items-center gap-[7px] rounded-lg border px-2.5 py-1.5 ${
                on
                  ? "border-border bg-white"
                  : "border-border-subtle bg-card"
              }`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: on ? s.color : "#cbd5e1" }}
                aria-hidden
              />
              <span
                className={`text-[11.5px] font-semibold ${
                  on ? "text-muted" : "text-muted-3 line-through"
                }`}
              >
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
