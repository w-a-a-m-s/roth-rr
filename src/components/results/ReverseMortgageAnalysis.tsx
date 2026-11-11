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
import type { Household, ReverseMortgageSettings } from "@/lib/domain/types";
import { useScenario } from "@/store/useScenario";
import { useExternalData } from "@/store/useExternalData";
import { usePlanAccess } from "@/components/plan/usePlanAccess";
import { Field } from "@/components/ui/Field";
import { MoneyInput, PercentInput, RateInput, Select } from "@/components/ui/inputs";
import { ColumnDefinitions } from "@/components/results/ColumnDefinitions";
import { DualScroll } from "@/components/results/DualScroll";
import {
  CHART_CHROME,
  chartTooltipProps,
  formatAxisCurrency,
} from "@/components/results/chartUtils";
import {
  HECM_ANNUAL_MIP,
  HECM_LENDING_LIMIT_YEAR,
  HECM_MIN_AGE,
  HECM_UPFRONT_MIP,
  REVERSE_PAYOUT_LABELS,
  compareReverseMortgage,
  earliestReverseStartYear,
  estimatePrincipalLimitFactor,
  reverseMortgageProperties,
  reverseMortgageSettingsFor,
  youngestBirthYear,
  type ReverseMortgageResult,
} from "@/lib/engine/reverseMortgage";
import { formatCurrency, formatPercent } from "@/lib/format";

const KEEP_COLOR = "#2563EB";
const REVERSE_COLOR = "#1C8A5B";
const LOAN_COLOR = "#B0552B";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const CELL_BASE = "border-b border-border-subtle px-3 py-1.5 tabular-nums";
const CELL = `${CELL_BASE} text-right`;
const HEAD_BASE = "px-3 py-2 text-[12px] font-bold text-white";
const HEAD = `bg-[#1B365D] ${HEAD_BASE} text-right`;
const HEAD_LEFT = `bg-[#1B365D] ${HEAD_BASE} text-left`;
const KEEP_HEAD = `bg-[#1D4FBF] ${HEAD_BASE} text-right`;
const REVERSE_HEAD = `bg-[#17734C] ${HEAD_BASE} text-right`;
const KEEP_TINT = "bg-[#EEF3FD]";
const REVERSE_TINT = "bg-[#ECF6F0]";

const money = (x: number) => (Math.abs(x) < 0.5 ? "-" : formatCurrency(x));

/**
 * Reverse mortgage: take a HECM on the home and invest the cash, or don't.
 * It doesn't change the plan's projection.
 */
export function ReverseMortgageAnalysis({ household }: { household: Household }) {
  // Today, so the home's loans are paid down to the closing year.
  const asOfDate = useExternalData((s) => s.refs.asOfDate) ?? new Date().toISOString().slice(0, 10);
  const thisYear = asOfDate ? Number(asOfDate.slice(0, 4)) : new Date().getFullYear();
  const settings = reverseMortgageSettingsFor(household, thisYear);
  const properties = reverseMortgageProperties(household);
  const result = compareReverseMortgage(household, settings, { thisYear, asOfDate });

  if (!result || properties.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-white p-6 text-center text-sm text-muted">
        <p className="font-medium text-foreground">No home in the plan</p>
        <p className="mt-1">
          Add your home in the Real estate step (with its market value) to see what a reverse
          mortgage could pay you.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
        <p className="m-0 max-w-[780px] text-[13px] leading-relaxed text-muted">
          A reverse mortgage (FHA&apos;s HECM) lets you borrow against your home from age{" "}
          {HECM_MIN_AGE} with no monthly payments: interest and mortgage insurance are added to the
          loan, which is repaid when the home is sold or you both pass. It pays off any mortgage on
          the home first. Here we take the cash, invest it, and also invest the mortgage payments
          you no longer make, so both choices spend the same each month. Then we compare your net
          worth year by year: home equity plus investments. The loan is non-recourse: you or your
          heirs never owe more than the home is worth. Selling costs, property tax and insurance
          are the same either way. This doesn&apos;t change the plan&apos;s projection.
        </p>
        <ReverseInputs
          household={household}
          settings={settings}
          thisYear={thisYear}
          result={result}
          properties={properties.map((p) => ({ value: p.id, label: p.label || "Property" }))}
        />
      </div>
      <Verdict result={result} />
      <ClosingTable result={result} />
      <EndTable result={result} />
      <NetWorthChart result={result} />
      <YearTable result={result} />
    </div>
  );
}

function ReverseInputs({
  household,
  settings,
  thisYear,
  result,
  properties,
}: {
  household: Household;
  settings: ReverseMortgageSettings & { startYear: number };
  thisYear: number;
  result: ReverseMortgageResult;
  properties: { value: string; label: string }[];
}) {
  const setReverseMortgage = useScenario((s) => s.setReverseMortgage);
  const { readOnly } = usePlanAccess();
  const set = (patch: Partial<ReverseMortgageSettings>) => {
    if (readOnly) return;
    setReverseMortgage({ ...settings, ...patch });
  };
  const earliest = earliestReverseStartYear(household, thisYear);
  const youngestBirth = youngestBirthYear(household) ?? thisYear - HECM_MIN_AGE;
  const years = Array.from({ length: 30 }, (_, i) => earliest + i);
  const estimate = estimatePrincipalLimitFactor(result.youngestAge, settings.expectedRate);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <InputGroup title="The home">
        <Field label="Home">
          <Select
            value={result.property.id}
            disabled={readOnly}
            onChange={(propertyId) => set({ propertyId })}
            options={properties}
          />
        </Field>
        <Field
          label="Take it in"
          hint={`The youngest of you is ${result.youngestAge} then. The oldest must be ${HECM_MIN_AGE}; a younger spouse can stay on as a non-borrowing spouse.`}
        >
          <Select
            value={String(settings.startYear)}
            disabled={readOnly}
            onChange={(v) => set({ startYear: Number(v) })}
            options={years.map((y) => ({
              value: String(y),
              label: `${y} · youngest ${y - youngestBirth}`,
            }))}
          />
        </Field>
        <Field
          label="FHA lending limit"
          hint={`${HECM_LENDING_LIMIT_YEAR} limit, grown with the home's value to the closing year.`}
        >
          <MoneyInput value={settings.lendingLimit} onChange={(lendingLimit) => set({ lendingLimit })} />
        </Field>
      </InputGroup>
      <InputGroup title="The loan">
        <Field label="How it pays out">
          <Select
            value={settings.payout}
            disabled={readOnly}
            onChange={(payout) => set({ payout })}
            options={(["lumpSum", "fullDraw"] as const).map((k) => ({
              value: k,
              label: REVERSE_PAYOUT_LABELS[k],
            }))}
          />
        </Field>
        <Field
          label="Interest rate"
          hint={`Plus ${formatPercent(HECM_ANNUAL_MIP)} a year of FHA mortgage insurance.`}
        >
          <RateInput value={settings.noteRate} onChange={(noteRate) => set({ noteRate })} />
        </Field>
        <Field label="Expected rate" hint="What HUD uses to size the loan. Usually close to the rate.">
          <RateInput value={settings.expectedRate} onChange={(expectedRate) => set({ expectedRate })} />
        </Field>
        <Field
          label="Principal limit factor"
          hint={
            result.plfEstimated
              ? `Our estimate for age ${result.youngestAge} at that rate. Enter your lender's quote to use it.`
              : `Your lender's number. Our estimate is ${formatPercent(estimate)}.`
          }
        >
          <PercentInput
            value={result.principalLimitFactor}
            onChange={(principalLimitFactor) => set({ principalLimitFactor })}
          />
        </Field>
        {!result.plfEstimated && !readOnly ? (
          <button
            type="button"
            onClick={() => set({ principalLimitFactor: undefined })}
            className="self-start text-[12px] font-semibold text-accent hover:underline"
          >
            Use our estimate
          </button>
        ) : null}
        <Field label="Other closing costs" hint="Appraisal, title, recording. Origination and upfront MIP are added for you.">
          <MoneyInput
            value={settings.otherClosingCosts}
            step={500}
            onChange={(otherClosingCosts) => set({ otherClosingCosts })}
          />
        </Field>
      </InputGroup>
      <InputGroup title="Investing the cash">
        <Field label="Investment return" hint="What the cash earns a year, before tax.">
          <PercentInput
            value={settings.investmentReturn}
            onChange={(investmentReturn) => set({ investmentReturn })}
          />
        </Field>
        <Field label="Tax on growth" hint="Tax on the investment growth each year.">
          <PercentInput value={settings.taxRate} onChange={(taxRate) => set({ taxRate })} />
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

const closingLabel = (r: ReverseMortgageResult) => `${MONTHS[r.closing.month - 1]} ${r.closing.year}`;
const endLabel = (r: ReverseMortgageResult) => {
  const last = r.years[r.years.length - 1];
  return last ? `${last.year} (youngest ${last.age})` : String(r.endYear);
};

function Verdict({ result }: { result: ReverseMortgageResult }) {
  const ahead = result.reverseEnd - result.keepEnd;
  const reverseWins = ahead > 0;
  const loanCost = Math.pow(1 + (result.inputs.noteRate + HECM_ANNUAL_MIP) / 12, 12) - 1;
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-white px-5 py-4">
      <p className="m-0 text-[15px] font-bold" style={{ color: reverseWins ? REVERSE_COLOR : KEEP_COLOR }}>
        {Math.abs(ahead) < 1
          ? `Both choices end even by ${endLabel(result)}.`
          : reverseWins
            ? `Taking the reverse mortgage and investing comes out ${formatCurrency(ahead)} ahead by ${endLabel(result)}.`
            : `Not taking a reverse mortgage comes out ${formatCurrency(-ahead)} ahead by ${endLabel(result)}.`}
      </p>
      <p className="m-0 text-[13px] text-muted">
        In {closingLabel(result)} the loan would put{" "}
        <strong className="text-foreground">{formatCurrency(result.cashAtClosing)}</strong> in your
        pocket to invest
        {result.laterDraw > 0 ? `, and ${formatCurrency(result.laterDraw)} more a year later` : ""}
        {result.existingLoans > 0
          ? `, after paying off ${formatCurrency(result.existingLoans)} of loans on the home (freeing ${formatCurrency(result.monthlyPaymentFreed)} a month)`
          : ""}
        . The loan costs {formatPercent(loanCost)} a year with mortgage insurance, compounded monthly.{" "}
        {result.breakevenReturn != null ? (
          <>
            Investing comes out ahead when your investments earn more than{" "}
            <strong className="text-foreground">{formatPercent(result.breakevenReturn)}</strong> a
            year before the tax on growth.
          </>
        ) : null}
      </p>
      {result.cashToClose > 0 ? (
        <p className="m-0 rounded-lg bg-[#FBF0EA] px-3 py-2 text-[13px] text-[#9A4522]">
          The loans on the home plus closing costs are more than the loan can pay: you&apos;d bring{" "}
          {formatCurrency(result.cashToClose)} to closing. We count that as money taken out of your
          investments.
        </p>
      ) : null}
      {result.underwaterYear != null ? (
        <p className="m-0 text-[13px] text-muted">
          The loan passes the home&apos;s value in {result.underwaterYear}. From then on the home
          leaves nothing to the heirs, but they never owe the difference (FHA insurance covers it).
        </p>
      ) : null}
    </div>
  );
}

function ClosingTable({ result: r }: { result: ReverseMortgageResult }) {
  const rows: [string, string, boolean?][] = [
    [`Home value in ${r.closing.year}`, formatCurrency(r.homeValue)],
    [`FHA lending limit in ${r.closing.year}`, formatCurrency(r.lendingLimit)],
    ["Max claim (the lesser of the two)", formatCurrency(r.maxClaim)],
    [
      `Principal limit factor (age ${r.youngestAge}${r.plfEstimated ? ", estimate" : ""})`,
      formatPercent(r.principalLimitFactor),
    ],
    ["Principal limit: the most you can borrow", formatCurrency(r.principalLimit), true],
    ["Loans on the home paid off", money(r.existingLoans)],
    ["Origination fee", formatCurrency(r.originationFee)],
    [`Upfront mortgage insurance (${formatPercent(HECM_UPFRONT_MIP)} of max claim)`, formatCurrency(r.upfrontMip)],
    ["Other closing costs", money(r.otherClosingCosts)],
    ["What you can take the first year", formatCurrency(r.firstYearLimit)],
    ["Cash to invest at closing", formatCurrency(r.cashAtClosing), true],
    ...(r.laterDraw > 0
      ? ([["Cash to invest a year later", formatCurrency(r.laterDraw), true]] as [string, string, boolean][])
      : []),
    ...(r.forfeited > 0
      ? ([["Left unused (a fixed-rate lump sum can't draw it)", formatCurrency(r.forfeited)]] as [string, string][])
      : []),
    ...(r.cashToClose > 0
      ? ([["Cash you bring to closing", formatCurrency(r.cashToClose), true]] as [string, string, boolean][])
      : []),
    ["Loan payments you stop making, a month", money(r.monthlyPaymentFreed)],
  ];
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <h3 className="m-0 text-[14.5px] font-bold text-foreground">At closing, {closingLabel(r)}</h3>
      <DualScroll>
        <table className="w-full min-w-[480px] border-collapse text-[12.5px]">
          <tbody>
            {rows.map(([label, value, bold]) => (
              <tr key={label} className={bold ? "font-bold" : ""}>
                <td className={`${CELL_BASE} text-left`}>{label}</td>
                <td className={CELL}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DualScroll>
      <p className="m-0 text-[12px] text-muted">
        At closing you can take 60% of the principal limit, or more when paying off the home&apos;s
        loans and the costs needs it (those plus 10%). A fixed-rate HECM pays one lump sum, so the
        rest goes unused; an adjustable one lets you draw the rest after 12 months, and that unused
        part grows at the loan&apos;s rate until then. The principal limit factor is HUD&apos;s,
        set by the youngest spouse&apos;s age and the expected rate; ours is an estimate, so use
        your lender&apos;s quote when you have one.
      </p>
    </div>
  );
}

function EndTable({ result: r }: { result: ReverseMortgageResult }) {
  const last = r.years[r.years.length - 1];
  if (!last) return null;
  const rows: { label: string; keep: number; reverse: number; bold?: boolean }[] = [
    { label: "Home value", keep: last.homeValue, reverse: last.homeValue },
    { label: "Owed on the home", keep: last.keepLoans, reverse: last.reverseBalance },
    { label: "Home equity", keep: last.homeValue - last.keepLoans, reverse: last.reverseEquity },
    { label: "Investments", keep: 0, reverse: last.invested },
    { label: "Net worth", keep: last.keepNetWorth, reverse: last.reverseNetWorth, bold: true },
  ];
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <h3 className="m-0 text-[14.5px] font-bold text-foreground">In {endLabel(r)}</h3>
      <DualScroll>
        <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={HEAD_LEFT} />
              <th className={KEEP_HEAD}>No reverse mortgage</th>
              <th className={REVERSE_HEAD}>Reverse mortgage, invested</th>
              <th className={HEAD}>Difference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className={row.bold ? "font-bold" : ""}>
                <td className={`${CELL_BASE} text-left`}>{row.label}</td>
                <td className={`${CELL} ${KEEP_TINT}`}>{money(row.keep)}</td>
                <td className={`${CELL} ${REVERSE_TINT}`}>{money(row.reverse)}</td>
                <td className={CELL}>{money(row.reverse - row.keep)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DualScroll>
      <p className="m-0 text-[12px] text-muted">
        Net worth is home equity plus investments: roughly what your heirs get before selling
        costs. Difference is the reverse mortgage less no reverse mortgage. The loan&apos;s interest
        is only deductible when it&apos;s paid back, so there&apos;s no deduction here.
      </p>
    </div>
  );
}

function NetWorthChart({ result }: { result: ReverseMortgageResult }) {
  const data = result.years.map((y) => ({
    year: String(y.year),
    keep: y.keepNetWorth,
    reverse: y.reverseNetWorth,
    loan: y.reverseBalance,
  }));
  return (
    <div className="rounded-2xl border border-border bg-white px-5 py-[18px]">
      <h3 className="mb-2.5 text-[14.5px] font-bold text-foreground">Net worth</h3>
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
            <Line type="monotone" dataKey="keep" name="No reverse mortgage" stroke={KEEP_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="reverse" name="Reverse mortgage, invested" stroke={REVERSE_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="loan" name="Reverse mortgage balance" stroke={LOAN_COLOR} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="m-0 mt-2 text-[12px] text-muted">
        Each year end. Net worth is home equity plus investments.
      </p>
    </div>
  );
}

const YEAR_COLUMN_DEFINITIONS: [string, string][] = [
  ["Age", "The youngest spouse's age that year."],
  ["Home value", "Today's market value grown at the property's appreciation rate."],
  ["Loan payments", "What the home's existing loans take that year without a reverse mortgage. With one, they're paid off at closing and the same money is invested instead."],
  ["Owed (no reverse mortgage)", "What's left on the home's existing loans at year end."],
  ["Net worth (no reverse mortgage)", "Home value less what's owed. Nothing extra is invested."],
  ["Cash drawn", "Reverse mortgage cash put into investments that year."],
  ["Interest and MIP", "Interest plus the yearly mortgage insurance added to the loan. You don't pay it; it grows the balance."],
  ["Loan balance", "What the reverse mortgage owes at year end."],
  ["Investments", "The cash drawn plus the freed loan payments, grown at the investment return after the tax on growth."],
  ["Net worth (reverse mortgage)", "Home value less the loan (never below 0) plus investments."],
  ["Ahead", "Reverse mortgage net worth less no reverse mortgage net worth."],
];

function YearTable({ result }: { result: ReverseMortgageResult }) {
  const anyLoans = result.years.some((y) => y.keepPayments > 0);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <h3 className="m-0 text-[14.5px] font-bold text-foreground">Year by year</h3>
      <DualScroll>
        <table className="w-full min-w-[1100px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={HEAD_LEFT} rowSpan={2}>Year</th>
              <th className={HEAD} rowSpan={2}>Age</th>
              <th className={HEAD} rowSpan={2}>Home value</th>
              <th className={`${KEEP_HEAD} border-l-2 border-l-white text-center`} colSpan={anyLoans ? 3 : 1}>
                No reverse mortgage
              </th>
              <th className={`${REVERSE_HEAD} border-l-2 border-l-white text-center`} colSpan={5}>
                Reverse mortgage, invested
              </th>
              <th className={HEAD} rowSpan={2}>Ahead</th>
            </tr>
            <tr>
              {anyLoans ? (
                <>
                  <th className={`${KEEP_HEAD} border-l-2 border-l-white`}>Loan payments</th>
                  <th className={KEEP_HEAD}>Owed</th>
                </>
              ) : null}
              <th className={`${KEEP_HEAD} ${anyLoans ? "" : "border-l-2 border-l-white"}`}>Net worth</th>
              <th className={`${REVERSE_HEAD} border-l-2 border-l-white`}>Cash drawn</th>
              <th className={REVERSE_HEAD}>Interest and MIP</th>
              <th className={REVERSE_HEAD}>Loan balance</th>
              <th className={REVERSE_HEAD}>Investments</th>
              <th className={REVERSE_HEAD}>Net worth</th>
            </tr>
          </thead>
          <tbody>
            {result.years.map((y) => (
              <tr key={y.year}>
                <td className={`${CELL_BASE} text-left`}>
                  {y.year}
                  {y.year === result.underwaterYear ? (
                    <span className="ml-2 rounded-full bg-[#FBF0EA] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[#9A4522]">
                      Loan passes home
                    </span>
                  ) : null}
                </td>
                <td className={CELL}>{y.age}</td>
                <td className={CELL}>{money(y.homeValue)}</td>
                {anyLoans ? (
                  <>
                    <td className={`${CELL} ${KEEP_TINT} border-l-[3px] border-l-[#1D4FBF]`}>{money(y.keepPayments)}</td>
                    <td className={`${CELL} ${KEEP_TINT}`}>{money(y.keepLoans)}</td>
                  </>
                ) : null}
                <td className={`${CELL} ${KEEP_TINT} font-bold text-[#1D4FBF] ${anyLoans ? "" : "border-l-[3px] border-l-[#1D4FBF]"}`}>
                  {money(y.keepNetWorth)}
                </td>
                <td className={`${CELL} ${REVERSE_TINT} border-l-[3px] border-l-[#17734C]`}>{money(y.drawn)}</td>
                <td className={`${CELL} ${REVERSE_TINT}`}>{money(y.reverseInterest)}</td>
                <td className={`${CELL} ${REVERSE_TINT}`}>{money(y.reverseBalance)}</td>
                <td className={`${CELL} ${REVERSE_TINT}`}>{money(y.invested)}</td>
                <td className={`${CELL} ${REVERSE_TINT} font-bold text-[#17734C]`}>{money(y.reverseNetWorth)}</td>
                <td className={`${CELL} font-semibold`} style={{ color: y.reverseAhead >= 0 ? REVERSE_COLOR : KEEP_COLOR }}>
                  {formatCurrency(y.reverseAhead)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DualScroll>
      <ColumnDefinitions items={YEAR_COLUMN_DEFINITIONS} />
    </div>
  );
}
