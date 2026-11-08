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
import type { CollegePlan, Household } from "@/lib/domain/types";
import { useScenario } from "@/store/useScenario";
import { usePlanAccess } from "@/components/plan/usePlanAccess";
import { Field } from "@/components/ui/Field";
import { MoneyInput, NumberField, PercentInput, Select, TextInput } from "@/components/ui/inputs";
import { DualScroll } from "@/components/results/DualScroll";
import {
  CHART_CHROME,
  chartTooltipProps,
  formatAxisCurrency,
} from "@/components/results/chartUtils";
import {
  COLLEGE_OPTIONS,
  COLLEGE_OPTION_LABELS,
  NON_QUALIFIED_529_PENALTY,
  collegePlanFor,
  compareCollegeOptions,
  type CollegeComparison,
  type CollegeOptionKey,
} from "@/lib/engine/college";
import { formatCurrency, formatPercent } from "@/lib/format";

const OPTION_COLORS: Record<CollegeOptionKey, string> = {
  outOfPocket: "#B0552B",
  plan529: "#1C8A5B",
};

/** Each option keeps its color through the tables: out of pocket rust, 529 green. */
const OPTION_STYLE: Record<
  CollegeOptionKey,
  { head: string; sub: string; tint: string; text: string; rule: string }
> = {
  outOfPocket: {
    head: "bg-[#9A4522]",
    sub: "bg-[#B8623C]",
    tint: "bg-[#FBF0EA]",
    text: "text-[#9A4522]",
    rule: "border-l-[3px] border-l-[#9A4522]",
  },
  plan529: {
    head: "bg-[#17734C]",
    sub: "bg-[#2E8C62]",
    tint: "bg-[#ECF6F0]",
    text: "text-[#17734C]",
    rule: "border-l-[3px] border-l-[#17734C]",
  },
};

/** College: save out of pocket or in a 529 for one student. It doesn't change the plan. */
export function CollegeAnalysis({ household }: { household: Household }) {
  const thisYear = new Date().getFullYear();
  const plan = collegePlanFor(household, thisYear);
  const result = compareCollegeOptions(plan, thisYear);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
        <p className="m-0 max-w-[760px] text-[13px] leading-relaxed text-muted">
          Save the same amount every month for college two ways and pay the bills from it. Out of
          pocket saves in a regular brokerage account: its growth is taxed every year, and what&apos;s
          left after college is yours tax free. A 529 grows tax free, pays tuition, room and board
          tax free, and may save state income tax on what you put in; earnings left over and taken
          out in cash owe income tax plus a {formatPercent(NON_QUALIFIED_529_PENALTY)} penalty.
          Either way, a bill the account can&apos;t cover comes from your pocket that year. This
          doesn&apos;t change the plan&apos;s projection.
        </p>
        <CollegeInputs plan={plan} thisYear={thisYear} />
      </div>
      <Recommendation result={result} />
      <SummaryTable result={result} />
      <BalanceChart result={result} />
      <YearTable result={result} />
    </div>
  );
}

function CollegeInputs({ plan, thisYear }: { plan: CollegePlan; thisYear: number }) {
  const setCollege = useScenario((s) => s.setCollege);
  const { readOnly } = usePlanAccess();
  const set = (patch: Partial<CollegePlan>) => {
    if (readOnly) return;
    setCollege({ ...plan, ...patch });
  };
  const ageNow = thisYear - plan.birthYear;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <InputGroup title="The student">
        <Field label="Name">
          <TextInput
            value={plan.studentName}
            placeholder="Student"
            disabled={readOnly}
            onChange={(studentName) => set({ studentName })}
          />
        </Field>
        <Field label="Birth year" hint={`Age ${Math.max(0, ageNow)} this year.`}>
          <NumberField
            value={plan.birthYear}
            min={thisYear - 30}
            step={1}
            onChange={(birthYear) => set({ birthYear })}
          />
        </Field>
        <Field label="Starts college at age">
          <NumberField value={plan.startAge} min={0} step={1} onChange={(startAge) => set({ startAge })} />
        </Field>
        <Field label="Years of college">
          <NumberField value={plan.years} min={1} step={1} onChange={(years) => set({ years })} />
        </Field>
      </InputGroup>
      <InputGroup title="The cost">
        <Field label="A year of college today" hint="Tuition, fees, room and board.">
          <MoneyInput value={plan.annualCost} onChange={(annualCost) => set({ annualCost })} />
        </Field>
        <Field label="College costs grow" hint="A year. College has run ahead of inflation.">
          <PercentInput value={plan.costGrowth} onChange={(costGrowth) => set({ costGrowth })} />
        </Field>
      </InputGroup>
      <InputGroup title="Saving">
        <Field label="Saved so far">
          <MoneyInput value={plan.currentSavings} onChange={(currentSavings) => set({ currentSavings })} />
        </Field>
        <Field label="Put in every month">
          <MoneyInput
            value={plan.monthlyContribution}
            step={50}
            onChange={(monthlyContribution) => set({ monthlyContribution })}
          />
        </Field>
        <Field label="Keep saving during college">
          <Select
            value={plan.contributeDuringCollege ? "yes" : "no"}
            disabled={readOnly}
            onChange={(v) => set({ contributeDuringCollege: v === "yes" })}
            options={[
              { value: "no", label: "No, stop when college starts" },
              { value: "yes", label: "Yes, through the last year" },
            ]}
          />
        </Field>
        <Field label="Investment return" hint="The same in both accounts.">
          <PercentInput
            value={plan.investmentReturn}
            onChange={(investmentReturn) => set({ investmentReturn })}
          />
        </Field>
        <Field label="Tax on brokerage growth" hint="Dividends and gains taxed each year.">
          <PercentInput value={plan.taxOnGrowth} onChange={(taxOnGrowth) => set({ taxOnGrowth })} />
        </Field>
        <Field label="State tax saved on 529 deposits" hint="Your state's deduction rate. Florida has none.">
          <PercentInput
            value={plan.stateDeductionRate}
            onChange={(stateDeductionRate) => set({ stateDeductionRate })}
          />
        </Field>
        <Field label="Tax on 529 earnings left over" hint="Your income tax rate if you cash out what's left.">
          <PercentInput
            value={plan.leftoverTaxRate}
            onChange={(leftoverTaxRate) => set({ leftoverTaxRate })}
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

const studentName = (result: CollegeComparison) =>
  result.inputs.studentName.trim() || "the student";

function Recommendation({ result }: { result: CollegeComparison }) {
  const best = COLLEGE_OPTION_LABELS[result.best];
  const other = COLLEGE_OPTION_LABELS[result.best === "plan529" ? "outOfPocket" : "plan529"];
  return (
    <p className="m-0 rounded-2xl border border-border bg-accent-soft px-5 py-4 text-[13.5px] text-foreground">
      For {studentName(result)}&apos;s college from {result.firstCollegeYear} to{" "}
      {result.lastCollegeYear}, {result.savings < 1 ? (
        <>both ways cost the same.</>
      ) : (
        <>
          saving in the <strong>{best}</strong> costs {formatCurrency(result.savings)} less than{" "}
          {other.toLowerCase()}.
        </>
      )}
    </p>
  );
}

const CELL_BASE = "border-b border-border-subtle px-3 py-1.5 tabular-nums";
const CELL = `${CELL_BASE} text-right`;
const HEAD_BASE = "px-3 py-2 text-[12px] font-bold text-white";
const HEAD = `bg-[#1B365D] ${HEAD_BASE} text-right`;
const HEAD_LEFT = `bg-[#1B365D] ${HEAD_BASE} text-left`;

const SUMMARY_ROWS: { label: string; value: (o: CollegeComparison["options"][number]) => number; bold?: boolean; minus?: boolean }[] = [
  { label: "You put in before college", value: (o) => o.contributedBeforeCollege },
  { label: "You put in during college", value: (o) => o.contributedDuringCollege },
  { label: "You put in, total", value: (o) => o.contributed, bold: true },
  { label: "Balance when college starts", value: (o) => o.balanceAtStart },
  { label: "Growth earned before college", value: (o) => o.growthBeforeCollege },
  { label: "Growth earned during college", value: (o) => o.growthDuringCollege },
  { label: "Growth earned, total", value: (o) => o.growth, bold: true },
  { label: "Tax on growth", value: (o) => o.taxOnGrowth },
  { label: "College bills", value: (o) => o.totalCost },
  { label: "Paid from the account", value: (o) => o.paidFromAccount },
  { label: "Paid from your pocket", value: (o) => o.shortfall },
  { label: "State tax saved", value: (o) => o.stateTaxSaved, minus: true },
  { label: "Left over after college", value: (o) => o.leftover, minus: true },
  { label: "Tax and penalty to cash out", value: (o) => o.leftoverTax },
  { label: "What college cost you", value: (o) => o.netCost, bold: true },
];

function SummaryTable({ result }: { result: CollegeComparison }) {
  const p = result.inputs;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <h3 className="m-0 text-[14.5px] font-bold text-foreground">Out of pocket or 529</h3>
      <DualScroll>
        <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={HEAD_LEFT} />
              {result.options.map((o) => (
                <th key={o.key} className={`${HEAD_BASE} ${OPTION_STYLE[o.key].head} text-right`}>
                  {COLLEGE_OPTION_LABELS[o.key]}
                  {o.key === result.best && result.savings >= 1 ? (
                    <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-foreground">
                      Lowest
                    </span>
                  ) : null}
                </th>
              ))}
              <th className={HEAD}>Difference</th>
            </tr>
          </thead>
          <tbody>
            {SUMMARY_ROWS.map((row) => {
              const [a, b] = result.options.map(row.value);
              return (
                <tr key={row.label} className={row.bold ? "font-bold" : ""}>
                  <td className={`${CELL_BASE} text-left`}>{row.label}</td>
                  {result.options.map((o) => (
                    <td
                      key={o.key}
                      className={`${CELL} ${OPTION_STYLE[o.key].tint} ${row.bold ? OPTION_STYLE[o.key].text : ""}`}
                    >
                      {formatCurrency(row.value(o))}
                    </td>
                  ))}
                  <td className={CELL}>{Math.abs(b - a) < 1 ? "-" : formatCurrency(b - a)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DualScroll>
      <p className="m-0 text-[12px] text-muted">
        What college cost you is everything you put in, plus the bills paid from your pocket, less
        the state tax saved and what&apos;s left over after cashing it out. Difference is 529 less out
        of pocket. Bills start at {formatCurrency(p.annualCost)} a year in today&apos;s dollars, growing{" "}
        {formatPercent(p.costGrowth)} a year, paid each January. Both accounts earn{" "}
        {formatPercent(p.investmentReturn)} a year; the brokerage account pays{" "}
        {formatPercent(p.taxOnGrowth)} tax on its growth every year. A 529&apos;s leftover can also go
        to another family member, or up to $35,000 roll into the student&apos;s Roth IRA, with no tax.
      </p>
    </div>
  );
}

function BalanceChart({ result }: { result: CollegeComparison }) {
  const data = result.years.map((y) => ({ year: String(y.year), ...y.balance }));
  return (
    <div className="rounded-2xl border border-border bg-white px-5 py-[18px]">
      <h3 className="mb-2.5 text-[14.5px] font-bold text-foreground">Account balance</h3>
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
            {COLLEGE_OPTIONS.map((k) => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                name={COLLEGE_OPTION_LABELS[k]}
                stroke={OPTION_COLORS[k]}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="m-0 mt-2 text-[12px] text-muted">
        Each year end, after that year&apos;s bill, deposits, growth and tax.
      </p>
    </div>
  );
}

function YearTable({ result }: { result: CollegeComparison }) {
  const money = (x: number) => (Math.abs(x) < 0.5 ? "-" : formatCurrency(x));
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <h3 className="m-0 text-[14.5px] font-bold text-foreground">Year by year</h3>
      <DualScroll>
        <table className="w-full min-w-[960px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={HEAD_LEFT} rowSpan={2}>Year</th>
              <th className={HEAD} rowSpan={2}>Age</th>
              <th className={HEAD} rowSpan={2}>Put in</th>
              <th className={HEAD} rowSpan={2}>College bill</th>
              {COLLEGE_OPTIONS.map((k) => (
                <th
                  key={k}
                  className={`${HEAD_BASE} ${OPTION_STYLE[k].head} border-l-2 border-l-white text-center text-[12.5px]`}
                  colSpan={4}
                >
                  {COLLEGE_OPTION_LABELS[k]}
                </th>
              ))}
            </tr>
            <tr>
              {COLLEGE_OPTIONS.map((k) => [
                <th key={`a-${k}`} className={`${HEAD_BASE} ${OPTION_STYLE[k].sub} border-l-2 border-l-white text-right`}>
                  From account
                </th>,
                <th key={`p-${k}`} className={`${HEAD_BASE} ${OPTION_STYLE[k].sub} text-right`}>
                  From pocket
                </th>,
                <th key={`t-${k}`} className={`${HEAD_BASE} ${OPTION_STYLE[k].sub} text-right`}>
                  {k === "plan529" ? "State tax saved" : "Tax on growth"}
                </th>,
                <th key={`b-${k}`} className={`${HEAD_BASE} ${OPTION_STYLE[k].sub} text-right`}>
                  Balance
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {result.years.map((y) => (
              <tr key={y.year} className={y.inCollege ? "font-semibold" : ""}>
                <td className={`${CELL_BASE} text-left`}>
                  {y.year}
                  {y.year === result.firstCollegeYear ? (
                    <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide">
                      College
                    </span>
                  ) : null}
                </td>
                <td className={CELL}>{y.age}</td>
                <td className={CELL}>{money(y.contributed)}</td>
                <td className={CELL}>{money(y.cost)}</td>
                {COLLEGE_OPTIONS.map((k) => [
                  <td key={`a-${k}`} className={`${CELL} ${OPTION_STYLE[k].tint} ${OPTION_STYLE[k].rule}`}>
                    {money(y.paidFromAccount[k])}
                  </td>,
                  <td key={`p-${k}`} className={`${CELL} ${OPTION_STYLE[k].tint}`}>
                    {money(y.shortfall[k])}
                  </td>,
                  <td key={`t-${k}`} className={`${CELL} ${OPTION_STYLE[k].tint}`}>
                    {money(k === "plan529" ? y.stateTaxSaved : y.taxOnGrowth[k])}
                  </td>,
                  <td key={`b-${k}`} className={`${CELL} ${OPTION_STYLE[k].tint} ${OPTION_STYLE[k].text} font-bold`}>
                    {money(y.balance[k])}
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
