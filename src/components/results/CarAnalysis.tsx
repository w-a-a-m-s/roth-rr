"use client";

import type { ReactNode } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CarDecision, Household } from "@/lib/domain/types";
import { useScenario } from "@/store/useScenario";
import { usePlanAccess } from "@/components/plan/usePlanAccess";
import { Field } from "@/components/ui/Field";
import { MoneyInput, NumberField, PercentInput, RateInput } from "@/components/ui/inputs";
import { DualScroll } from "@/components/results/DualScroll";
import {
  CHART_CHROME,
  chartTooltipProps,
  formatAxisCurrency,
} from "@/components/results/chartUtils";
import {
  CAR_OPTIONS,
  CAR_OPTION_LABELS,
  carDecisionFor,
  compareCarOptions,
  excessMilesPerYear,
  type CarComparison,
  type CarOptionKey,
} from "@/lib/engine/carDecision";
import { formatCurrency, formatPercent } from "@/lib/format";

const formatNumber = (x: number) => Math.round(x).toLocaleString("en-US");

const OPTION_COLORS: Record<CarOptionKey, string> = {
  cash: "#2563EB",
  finance: "#B0552B",
  lease: "#1C8A5B",
};

/**
 * Each option keeps its color through the tables: cash blue, finance rust,
 * lease green. A dark header, a lighter sub-header, a pale body tint, and a
 * rule on the left of its first column.
 */
const OPTION_STYLE: Record<
  CarOptionKey,
  { head: string; sub: string; tint: string; text: string; rule: string }
> = {
  cash: {
    head: "bg-[#1E4FBF]",
    sub: "bg-[#3D6BD6]",
    tint: "bg-[#EEF3FD]",
    text: "text-[#1E4FBF]",
    rule: "border-l-[3px] border-l-[#1E4FBF]",
  },
  finance: {
    head: "bg-[#9A4522]",
    sub: "bg-[#B8623C]",
    tint: "bg-[#FBF0EA]",
    text: "text-[#9A4522]",
    rule: "border-l-[3px] border-l-[#9A4522]",
  },
  lease: {
    head: "bg-[#17734C]",
    sub: "bg-[#2E8C62]",
    tint: "bg-[#ECF6F0]",
    text: "text-[#17734C]",
    rule: "border-l-[3px] border-l-[#17734C]",
  },
};

/** Car analysis: lease, pay cash or finance one car. It doesn't change the plan. */
export function CarAnalysis({ household }: { household: Household }) {
  const decision = carDecisionFor(household);
  const result = compareCarOptions(decision);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
        <p className="m-0 max-w-[720px] text-[13px] leading-relaxed text-muted">
          Compare paying cash, financing and leasing the same car over the same years. Buying
          leaves you a car worth its depreciated value at the end; a lease leaves nothing and
          is renewed on the same terms if the comparison runs longer. The money a choice ties up
          could have stayed invested, so the last column counts that lost growth. Before income
          tax and without a business-use deduction. This doesn&apos;t change the plan&apos;s
          projection.
        </p>
        <CarInputs decision={decision} />
      </div>
      <Recommendation result={result} />
      <SummaryTable result={result} />
      <NetCostChart result={result} />
      <YearTable result={result} />
    </div>
  );
}

function CarInputs({ decision }: { decision: CarDecision }) {
  const setCarDecision = useScenario((s) => s.setCarDecision);
  const { readOnly } = usePlanAccess();
  const set = (patch: Partial<CarDecision>) => {
    if (readOnly) return;
    setCarDecision({ ...decision, ...patch });
  };
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <InputGroup title="The car">
        <Field label="Price">
          <MoneyInput value={decision.price} onChange={(price) => set({ price })} />
        </Field>
        <Field label="Sales tax">
          <PercentInput value={decision.salesTaxRate} onChange={(salesTaxRate) => set({ salesTaxRate })} />
        </Field>
        <Field label="Fees when buying" hint="Title, registration and dealer fees.">
          <MoneyInput value={decision.fees} step={100} onChange={(fees) => set({ fees })} />
        </Field>
        <Field label="Years compared">
          <NumberField value={decision.years} min={1} step={1} onChange={(years) => set({ years })} />
        </Field>
        <Field label="Value lost per year">
          <PercentInput
            value={decision.depreciationRate}
            onChange={(depreciationRate) => set({ depreciationRate })}
          />
        </Field>
        <Field label="Investment return" hint="What the money would earn if it stayed invested.">
          <PercentInput
            value={decision.investmentReturn}
            onChange={(investmentReturn) => set({ investmentReturn })}
          />
        </Field>
      </InputGroup>
      <InputGroup title="Finance">
        <Field label="Down payment">
          <MoneyInput value={decision.downPayment} onChange={(downPayment) => set({ downPayment })} />
        </Field>
        <Field label="Loan rate (APR)">
          <RateInput value={decision.loanRate} onChange={(loanRate) => set({ loanRate })} />
        </Field>
        <Field label="Loan term (months)">
          <NumberField
            value={decision.loanTermMonths}
            min={1}
            step={12}
            onChange={(loanTermMonths) => set({ loanTermMonths })}
          />
        </Field>
      </InputGroup>
      <InputGroup title="Lease">
        <Field label="Monthly payment" hint="With sales tax, as on the lease.">
          <MoneyInput value={decision.leaseMonthly} step={25} onChange={(leaseMonthly) => set({ leaseMonthly })} />
        </Field>
        <Field label="Lease term (months)">
          <NumberField
            value={decision.leaseTermMonths}
            min={1}
            step={12}
            onChange={(leaseTermMonths) => set({ leaseTermMonths })}
          />
        </Field>
        <Field label="Due at signing">
          <MoneyInput
            value={decision.leaseDueAtSigning}
            step={250}
            onChange={(leaseDueAtSigning) => set({ leaseDueAtSigning })}
          />
        </Field>
        <Field label="Turn-in fee" hint="Disposition fee at the end of each lease.">
          <MoneyInput value={decision.leaseEndFee} step={50} onChange={(leaseEndFee) => set({ leaseEndFee })} />
        </Field>
        <Field
          label="Miles allowed per year"
          hint={`${formatNumber((decision.leaseMilesPerYear * decision.leaseTermMonths) / 12)} miles over the ${decision.leaseTermMonths}-month lease.`}
        >
          <NumberField
            value={decision.leaseMilesPerYear}
            min={0}
            step={1000}
            onChange={(leaseMilesPerYear) => set({ leaseMilesPerYear })}
          />
        </Field>
        <Field label="Miles actually driven per year">
          <NumberField
            value={decision.milesDrivenPerYear}
            min={0}
            step={1000}
            onChange={(milesDrivenPerYear) => set({ milesDrivenPerYear })}
          />
        </Field>
        <Field label="Charge per extra mile" hint="Paid at turn-in for miles over the allowance.">
          <MoneyInput
            value={decision.excessMileRate}
            step={0.05}
            decimals={2}
            onChange={(excessMileRate) => set({ excessMileRate })}
          />
        </Field>
      </InputGroup>
    </div>
  );
}

function InputGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card px-4 py-3">
      <h3 className="m-0 text-[13.5px] font-bold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

const OPTION_VERBS: Record<CarOptionKey, string> = {
  cash: "paying cash",
  finance: "financing",
  lease: "leasing",
};

function Recommendation({ result }: { result: CarComparison }) {
  const sorted = [...result.options].sort((a, b) => a.netCostWithGrowth - b.netCostWithGrowth);
  const [best, next] = sorted;
  return (
    <p className="m-0 rounded-2xl border border-border bg-accent-soft px-5 py-4 text-[13.5px] text-foreground">
      Over {result.inputs.years} years, <strong>{OPTION_VERBS[best.key]}</strong> costs the least: {formatCurrency(best.netCostWithGrowth)} counting lost investment growth,{" "}
      {formatCurrency(next.netCostWithGrowth - best.netCostWithGrowth)} less than{" "}
      {OPTION_VERBS[next.key]}.
    </p>
  );
}

const CELL_BASE = "border-b border-border-subtle px-3 py-1.5 tabular-nums";
const CELL = `${CELL_BASE} text-right`;
const HEAD_BASE = "px-3 py-2 text-[12px] font-bold text-white";
const HEAD = `bg-[#1B365D] ${HEAD_BASE} text-right`;
const HEAD_LEFT = `bg-[#1B365D] ${HEAD_BASE} text-left`;

function SummaryTable({ result }: { result: CarComparison }) {
  const money = (x: number) => formatCurrency(x);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <h3 className="m-0 text-[14.5px] font-bold text-foreground">
        Lease, cash or finance over {result.inputs.years} years
      </h3>
      <DualScroll>
        <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={`${HEAD_LEFT}`}>Option</th>
              <th className={HEAD}>Up front</th>
              <th className={HEAD}>Monthly</th>
              <th className={HEAD}>Extra-mile charges</th>
              <th className={HEAD}>Total paid</th>
              <th className={HEAD}>Car worth at end</th>
              <th className={HEAD}>Net cost</th>
              <th className={HEAD}>Net cost with lost growth</th>
            </tr>
          </thead>
          <tbody>
            {result.options.map((o) => (
              <tr
                key={o.key}
                className={`${OPTION_STYLE[o.key].tint} ${o.key === result.best ? "font-semibold" : ""}`}
              >
                <td
                  className={`${CELL_BASE} ${OPTION_STYLE[o.key].rule} ${OPTION_STYLE[o.key].text} text-left font-bold`}
                >
                  {CAR_OPTION_LABELS[o.key]}
                  {o.key === result.best ? (
                    <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide">
                      Lowest
                    </span>
                  ) : null}
                </td>
                <td className={CELL}>{money(o.upFront)}</td>
                <td className={CELL}>{o.monthly > 0 ? money(o.monthly) : "-"}</td>
                <td className={CELL}>{o.key === "lease" ? money(o.excessMileCharges) : "-"}</td>
                <td className={CELL}>{money(o.totalPaid)}</td>
                <td className={CELL}>{o.endEquity > 0 ? money(o.endEquity) : "-"}</td>
                <td className={CELL}>{money(o.netCost)}</td>
                <td className={`${CELL} font-bold`}>{money(o.netCostWithGrowth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DualScroll>
      <p className="m-0 text-[12px] text-muted">
        Net cost is total paid less what the car is worth at the end (less any loan still owed).
        Finance: {formatCurrency(result.loanPayment)}/mo at{" "}
        {formatPercent(result.inputs.loanRate)} for {result.inputs.loanTermMonths} months. The car
        is worth {formatCurrency(result.endCarValue)} after {result.inputs.years} years at{" "}
        {formatPercent(result.inputs.depreciationRate)} a year. Lost growth is at{" "}
        {formatPercent(result.inputs.investmentReturn)} a year. A lease still running at the end
        counts only its months inside the comparison. Extra-mile charges:{" "}
        {formatNumber(excessMilesPerYear(result.inputs))} miles a year over the lease allowance at{" "}
        {formatCurrency(result.inputs.excessMileRate, true)} a mile, paid at each turn-in.
      </p>
    </div>
  );
}

function NetCostChart({ result }: { result: CarComparison }) {
  const data = result.years.map((y) => ({ year: `Year ${y.year}`, ...y.netCost }));
  return (
    <div className="rounded-2xl border border-border bg-white px-5 py-[18px]">
      <h3 className="mb-2.5 text-[14.5px] font-bold text-foreground">Net cost so far</h3>
      <div className="h-64 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
            <Tooltip {...chartTooltipProps(data.length, { idleLastPoint: false })} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="line" />
            {CAR_OPTIONS.map((k) => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                name={CAR_OPTION_LABELS[k]}
                stroke={OPTION_COLORS[k]}
                strokeWidth={2}
                dot
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="m-0 mt-2 text-[12px] text-muted">
        Each year: paid so far less what the car is worth then (less any loan still owed).
      </p>
    </div>
  );
}

function YearTable({ result }: { result: CarComparison }) {
  const money = (x: number) => formatCurrency(x);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <h3 className="m-0 text-[14.5px] font-bold text-foreground">Year by year</h3>
      <DualScroll>
        <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={`${HEAD_LEFT}`} rowSpan={2}>
                Year
              </th>
              {CAR_OPTIONS.map((k) => (
                <th
                  key={k}
                  className={`${HEAD_BASE} ${OPTION_STYLE[k].head} border-l-2 border-l-white text-center text-[12.5px]`}
                  colSpan={3}
                >
                  {CAR_OPTION_LABELS[k]}
                </th>
              ))}
            </tr>
            <tr>
              {CAR_OPTIONS.map((k) => [
                <th
                  key={`p-${k}`}
                  className={`${HEAD_BASE} ${OPTION_STYLE[k].sub} border-l-2 border-l-white text-right`}
                >
                  Paid so far
                </th>,
                <th key={`e-${k}`} className={`${HEAD_BASE} ${OPTION_STYLE[k].sub} text-right`}>
                  Car equity
                </th>,
                <th key={`n-${k}`} className={`${HEAD_BASE} ${OPTION_STYLE[k].sub} text-right`}>
                  Net cost
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {result.years.map((y) => (
              <tr key={y.year}>
                <td className={`${CELL_BASE} text-left`}>{y.year}</td>
                {CAR_OPTIONS.map((k) => [
                  <td key={`p-${k}`} className={`${CELL} ${OPTION_STYLE[k].tint} ${OPTION_STYLE[k].rule}`}>
                    {money(y.paid[k])}
                  </td>,
                  <td key={`e-${k}`} className={`${CELL} ${OPTION_STYLE[k].tint}`}>
                    {k === "lease" ? "-" : money(y.equity[k])}
                  </td>,
                  <td
                    key={`n-${k}`}
                    className={`${CELL} ${OPTION_STYLE[k].tint} ${OPTION_STYLE[k].text} font-bold`}
                  >
                    {money(y.netCost[k])}
                  </td>,
                ])}
              </tr>
            ))}
          </tbody>
        </table>
      </DualScroll>
    </div>
  );
}
