"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Household } from "@/lib/domain/types";
import type { ReferenceData } from "@/lib/externalData/types";
import { buildConversionSchedule } from "@/lib/optimizer";
import {
  MONTE_CARLO_RUNS,
  marketPaths,
  monteCarloPlan,
  monteCarloRun,
  summarizeMonteCarlo,
  type MonteCarloRun,
  type MonteCarloScenario,
  type MonteCarloSummary,
  type Percentiles,
} from "@/lib/engine/monteCarlo";
import { SP500_FIRST_YEAR, SP500_LAST_YEAR } from "@/lib/config/marketHistory";
import { Select } from "@/components/ui/inputs";
import { DualScroll } from "@/components/results/DualScroll";
import { CHART_CHROME, formatAxisCurrency } from "@/components/results/chartUtils";
import { formatCurrency } from "@/lib/format";

const CELL_BASE = "border-b border-border-subtle px-3 py-1.5 tabular-nums";
const CELL = `${CELL_BASE} text-right`;
const LABEL_CELL = `${CELL_BASE} text-left font-semibold`;
const HEAD_BASE = "bg-[#1B365D] px-3 py-2 text-[12px] font-bold text-white";
const HEAD = `${HEAD_BASE} text-right`;
/** Bad to good markets: a light wash of the typical line's blue. */
const BAND_COLOR = "#86B6EF";
/** Typical market: solid dark blue. */
const TYPICAL_COLOR = "#1C5CAB";
/** The plan on its own steady returns: dashed orange, so it can't pass for the typical line. */
const PLAN_COLOR = "#EB6834";

/** Markets run per slice, so the page keeps responding while it works. */
const CHUNK = 50;

type ScenarioKey = "baseline" | "roth";
const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  baseline: "No conversion",
  roth: "With conversion",
};

function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

interface Progress {
  /** The inputs these runs belong to, so a plan change starts over. */
  input: unknown;
  runs: MonteCarloRun[];
}

/**
 * Monte Carlo: the plan in a thousand random markets drawn from history, with
 * and without conversion. It doesn't change the plan.
 */
export function MonteCarloAnalysis({
  household,
  refs,
}: {
  household: Household;
  refs: ReferenceData;
}) {
  const input = useMemo(() => {
    const schedule = buildConversionSchedule(household, refs);
    const { plan, years } = monteCarloPlan(household, schedule, refs);
    return { schedule, plan, years, paths: marketPaths(MONTE_CARLO_RUNS, years.length) };
  }, [household, refs]);
  const [progress, setProgress] = useState<Progress>({ input: null, runs: [] });
  const [scenario, setScenario] = useState<ScenarioKey>("roth");

  // Run the markets a slice at a time; a newer plan cancels the old work.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const runs: MonteCarloRun[] = [];
    const step = () => {
      if (cancelled) return;
      const end = Math.min(input.paths.length, runs.length + CHUNK);
      for (let r = runs.length; r < end; r++) {
        runs.push(monteCarloRun(household, input.schedule, refs, input.paths[r]));
      }
      setProgress({ input, runs: [...runs] });
      if (runs.length < input.paths.length) timer = setTimeout(step, 0);
    };
    timer = setTimeout(step, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input, household, refs]);

  const current = progress.input === input;
  const finished = current ? progress.runs.length : 0;
  const summary = useMemo(
    () =>
      current && progress.runs.length >= input.paths.length
        ? summarizeMonteCarlo(progress.runs, input.plan, input.years)
        : null,
    [current, progress, input],
  );
  const finalAge = household.assumptions.finalAge;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-white px-5 py-4">
        <p className="m-0 max-w-[760px] text-[13px] leading-relaxed text-muted">
          Your plan run in {MONTE_CARLO_RUNS.toLocaleString()} different markets. Each one picks a
          year at random from the S&amp;P 500&apos;s history ({SP500_FIRST_YEAR} to{" "}
          {SP500_LAST_YEAR}) for every year of the plan, so good and bad years land in a different
          order every time. Both scenarios see the same markets. Retirement, Roth and investment
          accounts on a fixed return keep their own rate on average but rise and fall with the
          market each year; accounts set to S&amp;P 500 or 50/50 history get that year&apos;s
          actual return. Savings, CDs, annuities, real estate and businesses keep their own rates.
          A year short of cash takes more from the accounts (after-tax, then tax-deferred, then
          Roth, with the tax it adds), and a market counts as a success when every year through
          age {finalAge} is paid. Your conversion plan stays the same in every market. This
          doesn&apos;t change the plan&apos;s projection.
        </p>
      </div>
      {summary ? (
        <>
          <Headline summary={summary} finalAge={finalAge} />
          <OutcomesTable summary={summary} finalAge={finalAge} />
          <RangeChart
            scenario={summary[scenario]}
            plan={input.plan[scenario].accountsByYear}
            years={input.years}
            selected={scenario}
            onScenario={setScenario}
          />
        </>
      ) : (
        <div className="rounded-2xl border border-border bg-white p-6 text-center text-sm text-muted">
          Running markets: {finished.toLocaleString()} of {input.paths.length.toLocaleString()}
        </div>
      )}
    </div>
  );
}

/** The answer up top: how often the money lasts, and how often converting wins. */
function Headline({ summary, finalAge }: { summary: MonteCarloSummary; finalAge: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {(["baseline", "roth"] as const).map((key) => (
        <div key={key} className="rounded-2xl border-2 border-[#2563EB] bg-[#E8F0FE] px-5 py-4">
          <p className="m-0 text-[12.5px] font-semibold text-muted">
            {SCENARIO_LABELS[key]}: money lasts to age {finalAge}
          </p>
          <p className="m-0 text-[28px] font-bold tabular-nums text-[#1B365D]">
            {pct(summary[key].successRate)}
            <span className="text-[15px] font-semibold"> of markets</span>
          </p>
          <p className="m-0 text-[12.5px] text-muted">
            {summary[key].medianShortYear != null
              ? `When it runs short, typically in ${summary[key].medianShortYear}.`
              : "It never ran short."}
          </p>
        </div>
      ))}
      <div className="rounded-2xl border border-border bg-white px-5 py-4">
        <p className="m-0 text-[12.5px] font-semibold text-muted">
          Converting leaves the bigger inheritance
        </p>
        <p className="m-0 text-[28px] font-bold tabular-nums text-foreground">
          {pct(summary.rothAheadRate)}
          <span className="text-[15px] font-semibold"> of markets</span>
        </p>
        <p className="m-0 text-[12.5px] text-muted">Each market compares both scenarios side by side.</p>
      </div>
    </div>
  );
}

function OutcomesTable({ summary, finalAge }: { summary: MonteCarloSummary; finalAge: number }) {
  const rows: { label: string; value: (s: MonteCarloScenario) => string; plan: (k: ScenarioKey) => string }[] = [
    {
      label: `Money lasts to age ${finalAge}`,
      value: (s) => pct(s.successRate),
      plan: (k) => (summary.plan[k].lasts ? "Yes" : `Runs short in ${summary.plan[k].shortYear}`),
    },
    ...percentileRows("Inheritance", (s) => s.inheritance, (k) => summary.plan[k].inheritance),
    ...percentileRows("After-tax assets at the RMD age", (s) => s.afterTaxAtRmd, (k) => summary.plan[k].afterTaxAtRmd),
  ];
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <h3 className="m-0 text-[14.5px] font-bold text-foreground">Outcomes across {summary.runs.toLocaleString()} markets</h3>
      <DualScroll>
        <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={`${HEAD_BASE} text-left`}>Outcome</th>
              <th className={HEAD}>No conversion</th>
              <th className={HEAD}>With conversion</th>
              <th className={HEAD}>Your plan&apos;s returns: no conversion</th>
              <th className={HEAD}>Your plan&apos;s returns: with conversion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td className={LABEL_CELL}>{row.label}</td>
                <td className={CELL}>{row.value(summary.baseline)}</td>
                <td className={CELL}>{row.value(summary.roth)}</td>
                <td className={`${CELL} text-muted`}>{row.plan("baseline")}</td>
                <td className={`${CELL} text-muted`}>{row.plan("roth")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DualScroll>
      <p className="m-0 text-[12px] text-muted">
        Bad markets is the 10th percentile: 9 in 10 markets did better. Typical is the median. Good
        markets is the 90th percentile: only 1 in 10 did better. Your plan&apos;s returns is the same
        plan on the steady returns it&apos;s set to, for comparison. Inheritance and after-tax assets
        are after the tax the heirs would owe, the same as on Summary.
      </p>
    </div>
  );
}

function percentileRows(
  label: string,
  pick: (s: MonteCarloScenario) => Percentiles,
  plan: (k: ScenarioKey) => number,
) {
  const levels = [
    ["p10", "bad markets"],
    ["p50", "typical"],
    ["p90", "good markets"],
  ] as const;
  return levels.map(([key, name], i) => ({
    label: `${label}, ${name}`,
    value: (s: MonteCarloScenario) => formatCurrency(pick(s)[key]),
    plan: (k: ScenarioKey) => (i === 1 ? formatCurrency(plan(k)) : ""),
  }));
}

interface ChartPoint {
  year: number;
  band: [number, number];
  p10: number;
  p50: number;
  p90: number;
  plan: number;
}

function RangeTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div
      className="rounded-lg border bg-white px-3 py-2 text-[12px] shadow-sm"
      style={{ borderColor: CHART_CHROME.tooltipBorder }}
    >
      <p className="m-0 mb-1 font-bold text-foreground">{point.year}</p>
      <p className="m-0 text-muted">Good markets: <span className="font-semibold text-foreground">{formatCurrency(point.p90)}</span></p>
      <p className="m-0 text-muted">Typical: <span className="font-semibold text-foreground">{formatCurrency(point.p50)}</span></p>
      <p className="m-0 text-muted">Bad markets: <span className="font-semibold text-foreground">{formatCurrency(point.p10)}</span></p>
      <p className="m-0 text-muted">Your plan&apos;s returns: <span className="font-semibold text-foreground">{formatCurrency(point.plan)}</span></p>
    </div>
  );
}

/** Accounts left each year: the range from bad to good markets, and the typical one. */
function RangeChart({
  scenario,
  plan,
  years,
  selected,
  onScenario,
}: {
  scenario: MonteCarloScenario;
  plan: number[];
  years: number[];
  selected: ScenarioKey;
  onScenario: (key: ScenarioKey) => void;
}) {
  const data: ChartPoint[] = scenario.accountsByYear.map((p, i) => ({
    year: p.year,
    band: [p.p10, p.p90],
    p10: p.p10,
    p50: p.p50,
    p90: p.p90,
    plan: plan[i] ?? 0,
  }));
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-[14.5px] font-bold text-foreground">Accounts left each year</h3>
        <span className="w-[180px]">
          <Select
            value={selected}
            onChange={onScenario}
            options={(["baseline", "roth"] as const).map((key) => ({ value: key, label: SCENARIO_LABELS[key] }))}
          />
        </span>
      </div>
      <div className="h-64 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
            <Tooltip content={<RangeTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={(value: string) => <span className="text-muted-2">{value}</span>}
            />
            <Area
              type="monotone"
              dataKey="band"
              name="Bad to good markets"
              stroke="none"
              fill={BAND_COLOR}
              fillOpacity={0.35}
              legendType="square"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="p50"
              name="Typical"
              stroke={TYPICAL_COLOR}
              strokeWidth={2.5}
              legendType="plainline"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="plan"
              name="Your plan's returns"
              stroke={PLAN_COLOR}
              strokeWidth={2.5}
              strokeDasharray="6 4"
              legendType="plainline"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="m-0 text-[12px] text-muted">
        Retirement, Roth and investment accounts at each year end, before tax, from{" "}
        {years[0]} to {years[years.length - 1]}. The shaded range runs from bad markets (10th
        percentile) to good markets (90th); the solid blue line is the typical market and the
        dashed orange line is the plan on its own steady returns. The typical market usually ends below the
        orange line even though returns average the same: a loss takes more than the same gain
        gives back, and money drawn after a bad year can&apos;t recover.
      </p>
    </div>
  );
}
