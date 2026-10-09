"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Household } from "@/lib/domain/types";
import type { Comparison } from "@/lib/engine/types";
import {
  CHART_CHROME,
  chartTooltipProps,
  formatAxisCurrency,
} from "@/components/results/chartUtils";
import {
  INCOME_CATEGORIES,
  INCOME_SOURCE_CATEGORIES,
  NEED_COLOR,
  buildPresentationData,
  type PresentationYear,
} from "@/components/results/presentationCharts";
import { formatCurrency, formatPercent } from "@/lib/format";

const TITLE = "#1F3A93";

interface Series {
  key: string;
  label: string;
  color: string;
  value: (y: PresentationYear) => number;
}

const category = (key: (typeof INCOME_CATEGORIES)[number]["key"]) =>
  INCOME_CATEGORIES.find((c) => c.key === key)!;

/**
 * A four-page retirement story told in charts, in the style of a classic
 * planning report: what you need each year, what income you have, how much
 * of the need that income covers, and whether RMDs and withdrawals close the
 * gap. It reads the same projection as the snapshot tables above it.
 */
export function PresentationCharts({
  comparison,
  household,
  primaryId,
}: {
  comparison: Comparison;
  household: Household;
  primaryId: string;
}) {
  const [tab, setTab] = useState<"baseline" | "roth">("baseline");
  const scenario = tab === "baseline" ? comparison.baseline : comparison.roth;
  const data = useMemo(
    () => buildPresentationData(scenario.rows, household, primaryId),
    [scenario.rows, household, primaryId],
  );
  const { years, summary } = data;
  if (years.length === 0) return null;

  const name =
    household.people.find((p) => p.id === primaryId)?.name?.trim() || "";
  const ageLabel = name ? `${name}'s age` : "Age";
  const lastAge = years[years.length - 1].age;
  const ratePct = formatPercent(summary.rate);
  const has = (fn: (y: PresentationYear) => number) =>
    years.some((y) => fn(y) > 0.5);

  const hasDeposits = has((y) => y.deposits);
  const needLabel = hasDeposits ? "Spending, taxes + deposits" : "Spending + taxes";
  const needSeries: Series = {
    key: "need",
    label: needLabel,
    color: NEED_COLOR,
    value: (y) => y.need,
  };

  const sourceSeries: Series[] = INCOME_SOURCE_CATEGORIES.map((key) => ({
    key,
    label: category(key).label,
    color: category(key).color,
    value: (y: PresentationYear) => y.income[key],
  })).filter((s) => has(s.value));

  const appliedSeries: Series[] = [
    ...INCOME_SOURCE_CATEGORIES.map((key) => ({
      key,
      label: category(key).label,
      color: category(key).color,
      value: (y: PresentationYear) => y.applied[key],
    })).filter((s) => has(s.value)),
    {
      key: "fromAssets",
      label: "Still needed",
      color: NEED_COLOR,
      value: (y: PresentationYear) => y.neededFromAssets,
    },
  ];

  const additional = (y: PresentationYear) =>
    y.applied.pension + y.applied.earnings + y.applied.other;
  const resultSeries: Series[] = (
    [
    {
      key: "socialSecurity",
      label: "Social Security",
      color: category("socialSecurity").color,
      value: (y) => y.applied.socialSecurity,
    },
    {
      key: "additional",
      label: "Additional income",
      color: category("other").color,
      value: additional,
    },
    {
      key: "rmd",
      label: category("rmd").label,
      color: category("rmd").color,
      value: (y) => y.applied.rmd,
    },
    {
      key: "withdrawals",
      label: category("withdrawals").label,
      color: category("withdrawals").color,
      value: (y) => y.applied.withdrawals,
    },
    {
      key: "shortfall",
      label: "Shortfall",
      color: NEED_COLOR,
      value: (y) => y.shortfall,
    },
    ] as Series[]
  ).filter((s) => has(s.value));

  const covered = summary.capitalizedNeed - summary.capitalizedShortfall;
  const share = (v: number) =>
    summary.capitalizedNeed > 0 ? formatPercent(v / summary.capitalizedNeed) : "0%";
  const fullyMet = summary.shortfallYears === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-[14.5px] font-bold text-foreground">
          Retirement analysis
        </h3>
        <div className="inline-flex rounded-[9px] bg-segment p-[3px]">
          {(
            [
              ["baseline", "No conversion"],
              ["roth", "With conversion"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`h-[30px] rounded-[7px] px-3.5 text-[12.5px] font-bold transition ${
                tab === key
                  ? "bg-white text-foreground shadow-sm"
                  : "bg-transparent text-muted-2"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
        <ChartPage
          title="Retirement Objective"
          subtitle="How much do you need?"
          series={[needSeries]}
          years={years}
          ageLabel={ageLabel}
          lastAge={lastAge}
        >
          <p>
            {hasDeposits
              ? "Each bar is a year's spending, income tax, and deposits into your accounts: what your income has to cover."
              : "Each bar is a year's spending plus income tax: what your income has to cover."}
          </p>
          <SummaryTable
            rows={[
              {
                label: `${needLabel} in ${summary.firstYear}`,
                amount: summary.firstYearNeed,
              },
            ]}
            total={{ label: "Capitalized need", amount: summary.capitalizedNeed }}
          />
          <Footnote rate={ratePct} />
        </ChartPage>

        <ChartPage
          title="Retirement Income Sources"
          subtitle="What income will be available?"
          series={sourceSeries}
          years={years}
          ageLabel={ageLabel}
          lastAge={lastAge}
        >
          <p>
            Your income before any money comes out of your own accounts.
            Social Security and pensions are the most dependable, so ideally
            they cover your most important needs.
          </p>
        </ChartPage>

        <ChartPage
          title="Income Applied to Objective"
          subtitle="Can your retirement assets provide the rest?"
          series={appliedSeries}
          years={years}
          ageLabel={ageLabel}
          lastAge={lastAge}
        >
          <p>
            Those income sources applied against the yearly need. Red is what
            is left for your accounts to cover through RMDs and withdrawals.
            Income beyond the need isn&apos;t shown.
          </p>
          <SummaryTable
            share={share}
            rows={[
              { label: "Capitalized need", amount: summary.capitalizedNeed },
              {
                label: "Capitalized income sources applied",
                amount: summary.capitalizedIncomeSources,
              },
            ]}
            total={{
              label: "Capitalized amount needed from assets",
              amount: summary.capitalizedNeededFromAssets,
            }}
          />
          <Footnote rate={ratePct} />
        </ChartPage>

        <ChartPage
          title="Retirement Analysis Results"
          subtitle="Has the objective been met?"
          series={resultSeries}
          years={years}
          ageLabel={ageLabel}
          lastAge={lastAge}
        >
          <p>
            {fullyMet ? (
              <>
                Your need is <strong>completely</strong> covered every year.
              </>
            ) : (
              <>
                Income, RMDs and withdrawals cover {share(covered)} of the
                need. {summary.shortfallYears}{" "}
                {summary.shortfallYears === 1 ? "year falls" : "years fall"}{" "}
                short.
              </>
            )}
          </p>
          <SummaryTable
            share={share}
            rows={[
              {
                label: "Capitalized income sources applied",
                amount: summary.capitalizedIncomeSources,
              },
              {
                label: "Capitalized RMDs and withdrawals",
                amount: summary.capitalizedAssetDraws,
              },
              ...(fullyMet
                ? []
                : [{ label: "Capitalized shortfall", amount: summary.capitalizedShortfall }]),
            ]}
            total={{ label: "Total capitalized need covered", amount: covered }}
          />
          <p className="text-[11.5px] text-muted-2">
            These results are hypothetical and are not a promise of future
            performance.
          </p>
        </ChartPage>
      </div>
    </div>
  );
}

function ChartPage({
  title,
  subtitle,
  series,
  years,
  ageLabel,
  lastAge,
  children,
}: {
  title: string;
  subtitle: string;
  series: Series[];
  years: PresentationYear[];
  ageLabel: string;
  lastAge: number;
  children: ReactNode;
}) {
  const data = years.map((y) => {
    const point: Record<string, number> = { age: y.age, year: y.year };
    for (const s of series) point[s.key] = s.value(y);
    return point;
  });
  const tooltip = chartTooltipProps(data.length, { idleLastPoint: false });

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-white px-5 py-6">
      <p
        className="m-0 text-center font-serif text-[26px] leading-tight"
        style={{ color: TITLE }}
      >
        {title}
      </p>
      <p
        className="m-0 text-center font-serif text-[19px] italic"
        style={{ color: TITLE }}
      >
        {subtitle}
      </p>

      <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
            <span className="h-2.5 w-2.5 shrink-0" style={{ backgroundColor: s.color }} aria-hidden />
            {s.label}
          </span>
        ))}
      </div>

      <div className="mt-2 h-64 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 16 }} barCategoryGap={1}>
            <CartesianGrid vertical={false} stroke={CHART_CHROME.grid} />
            <XAxis
              dataKey="age"
              tick={{ fill: CHART_CHROME.tick, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: CHART_CHROME.axis }}
              label={{ value: ageLabel, position: "insideBottom", offset: -10, fill: CHART_CHROME.tick, fontSize: 12 }}
            />
            <YAxis
              tickFormatter={formatAxisCurrency}
              tick={{ fill: CHART_CHROME.tick, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip
              {...tooltip}
              labelFormatter={(age: unknown, payload) => {
                const year = payload?.[0]?.payload?.year;
                return year ? `Age ${age} (${year})` : `Age ${age}`;
              }}
            />
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="a"
                fill={s.color}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="m-0 mt-1 text-center text-[11.5px] text-muted-2">
        Projection runs to age {lastAge}
      </p>

      <div className="mt-4 flex flex-col gap-3 text-[13px] leading-relaxed text-foreground">
        {children}
      </div>
    </div>
  );
}

function SummaryTable({
  rows,
  total,
  share,
}: {
  rows: { label: string; amount: number }[];
  total: { label: string; amount: number };
  share?: (v: number) => string;
}) {
  return (
    <table className="w-full border-collapse text-[12.5px] tabular-nums">
      {share ? (
        <thead>
          <tr className="border-y border-[#1F3A93] italic" style={{ color: TITLE }}>
            <th className="py-1 text-left font-bold">Capitalized value</th>
            <th className="bg-[#ECECF2] px-2 py-1 text-right font-bold">Amount</th>
            <th className="bg-[#ECECF2] px-2 py-1 text-right font-bold">% of need</th>
          </tr>
        </thead>
      ) : null}
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td className="py-0.5 text-left">{r.label}</td>
            <td className="bg-[#F3F3F7] px-2 py-0.5 text-right">{formatCurrency(r.amount)}</td>
            {share ? <td className="bg-[#F3F3F7] px-2 py-0.5 text-right">{share(r.amount)}</td> : null}
          </tr>
        ))}
        <tr className="font-bold">
          <td className="border-y border-[#1F3A93] py-1 text-left" style={{ color: TITLE }}>
            {total.label}
          </td>
          <td className="bg-[#1F3A93] px-2 py-1 text-right text-white">{formatCurrency(total.amount)}</td>
          {share ? (
            <td className="bg-[#1F3A93] px-2 py-1 text-right text-white">{share(total.amount)}</td>
          ) : null}
        </tr>
      </tbody>
    </table>
  );
}

function Footnote({ rate }: { rate: string }) {
  return (
    <p className="m-0 text-[11.5px] text-muted-2">
      Capitalized means the yearly amounts turned into one lump sum today, in
      an account earning {rate} (the average growth rate of your accounts).
    </p>
  );
}
