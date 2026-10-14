"use client";

import { useMemo } from "react";
import type { Household, MortgagePayoffSettings } from "@/lib/domain/types";
import { useScenario } from "@/store/useScenario";
import { usePlanAccess } from "@/components/plan/usePlanAccess";
import { Field } from "@/components/ui/Field";
import { PercentInput, Select } from "@/components/ui/inputs";
import { DualScroll } from "@/components/results/DualScroll";
import { nextMonth } from "@/components/results/MortgageAnalysis";
import { propertyMortgageStatements } from "@/lib/domain/propertyLoans";
import {
  compareMortgagePayoff,
  mortgagePayoffSettingsFor,
  type PayoffComparison,
} from "@/lib/engine/mortgagePayoff";
import { formatCurrency, formatPercent } from "@/lib/format";

const CELL = "border-b border-border-subtle px-3 py-1.5 text-right tabular-nums";
const HEAD = "bg-[#1B365D] px-3 py-2 text-right text-[12px] font-bold text-white";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PAYOFF_COLOR = "#2563EB";
const KEEP_COLOR = "#1C8A5B";

/**
 * Pay off the mortgage or invest: pay a mortgage off today, or keep it and
 * invest the money, spending the same each month either way. It doesn't
 * change the plan's projection.
 */
export function MortgagePayoffAnalysis({ household }: { household: Household }) {
  const settings = mortgagePayoffSettingsFor(household);
  const mortgages = useMemo(
    () => [...(household.mortgages ?? []), ...propertyMortgageStatements(household, nextMonth())],
    [household],
  );
  const mortgage = mortgages.find((m) => m.id === settings.mortgageId) ?? mortgages[0];
  const result = mortgage ? compareMortgagePayoff(mortgage, settings) : null;

  if (!mortgage) {
    return (
      <div className="rounded-2xl border border-border bg-white p-6 text-center text-sm text-muted">
        <p className="font-medium text-foreground">No mortgage in the plan</p>
        <p className="mt-1">
          Add a mortgage in Mortgage analysis, or on a property in the Real estate step, to compare
          paying it off with investing.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
        <p className="m-0 max-w-[720px] text-[13px] leading-relaxed text-muted">
          Pay the mortgage off today, or keep it and invest the same money. Both spend the same each
          month: paying it off frees the mortgage payment, which gets invested every month; keeping
          it invests the payoff money and pays the mortgage from the same budget. They&apos;re
          compared when the mortgage would be paid off. Growth is taxed each year at the rate below.
          Escrow is the same either way and there&apos;s no mortgage interest deduction. This
          doesn&apos;t change the plan&apos;s projection.
        </p>
        <PayoffInputs
          settings={settings}
          mortgageId={mortgage.id}
          options={mortgages.map((m) => ({ value: m.id, label: m.label || "Mortgage" }))}
        />
      </div>
      {result ? (
        <>
          <Verdict result={result} />
          <SummaryTable result={result} />
          <YearTable result={result} />
        </>
      ) : (
        <p className="m-0 rounded-2xl border border-border bg-white px-5 py-4 text-[13px] text-muted">
          This mortgage needs a balance and a monthly payment (or a maturity date) that pays it
          off. Fill those in on Mortgage analysis.
        </p>
      )}
    </div>
  );
}

function PayoffInputs({
  settings,
  mortgageId,
  options,
}: {
  settings: MortgagePayoffSettings;
  mortgageId: string;
  options: { value: string; label: string }[];
}) {
  const setMortgagePayoff = useScenario((s) => s.setMortgagePayoff);
  const { readOnly } = usePlanAccess();
  const set = (patch: Partial<MortgagePayoffSettings>) => {
    if (readOnly) return;
    setMortgagePayoff({ ...settings, ...patch });
  };
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Field label="Mortgage">
        <Select value={mortgageId} onChange={(id) => set({ mortgageId: id })} options={options} />
      </Field>
      <Field label="Investment return" help="What the money would earn a year if invested.">
        <PercentInput
          value={settings.investmentReturn}
          onChange={(investmentReturn) => set({ investmentReturn })}
        />
      </Field>
      <Field label="Tax on growth" help="Tax on the investment growth each year.">
        <PercentInput value={settings.taxRate} onChange={(taxRate) => set({ taxRate })} />
      </Field>
    </div>
  );
}

const when = (r: PayoffComparison) =>
  r.payoff ? `${MONTHS[r.payoff.month - 1]} ${r.payoff.year}` : "the end";

function Verdict({ result }: { result: PayoffComparison }) {
  const ahead = result.keepEnd - result.payoffEnd;
  const keepWins = ahead > 0;
  const color = keepWins ? KEEP_COLOR : PAYOFF_COLOR;
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-white px-5 py-4">
      <p className="m-0 text-[15px] font-bold" style={{ color }}>
        {Math.abs(ahead) < 1
          ? `Both choices end even by ${when(result)}.`
          : `${keepWins ? "Keeping the mortgage and investing" : "Paying it off"} comes out ${formatCurrency(Math.abs(ahead))} ahead by ${when(result)}.`}
      </p>
      <p className="m-0 text-[13px] text-muted">
        Investing comes out ahead when your investments earn more than{" "}
        <strong className="text-foreground">{formatPercent(result.breakevenReturn)}</strong> a year
        before the tax on growth ({formatPercent(result.afterTaxReturn)} after tax at your
        assumptions). Paying it off today skips {formatCurrency(result.interestSaved)} of interest.
      </p>
    </div>
  );
}

function SummaryTable({ result }: { result: PayoffComparison }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <h3 className="m-0 text-[14.5px] font-bold text-foreground">Summary by {when(result)}</h3>
      <DualScroll>
        <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={`${HEAD} text-left`}>Choice</th>
              <th className={HEAD}>Up front</th>
              <th className={HEAD}>Each month</th>
              <th className={HEAD}>Investments at the end</th>
              <th className={HEAD}>Mortgage owed</th>
              <th className={HEAD}>Net at the end</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={`${CELL} text-left font-semibold`} style={{ color: PAYOFF_COLOR }}>
                Pay it off
              </td>
              <td className={CELL}>{formatCurrency(result.payoffAmount)} to the lender</td>
              <td className={CELL}>{formatCurrency(result.monthlyPayment, true)} invested</td>
              <td className={CELL}>{formatCurrency(result.payoffEnd)}</td>
              <td className={CELL}>$0</td>
              <td className={`${CELL} font-semibold`}>{formatCurrency(result.payoffEnd)}</td>
            </tr>
            <tr>
              <td className={`${CELL} text-left font-semibold`} style={{ color: KEEP_COLOR }}>
                Keep it and invest
              </td>
              <td className={CELL}>{formatCurrency(result.payoffAmount)} invested</td>
              <td className={CELL}>{formatCurrency(result.monthlyPayment, true)} to the lender</td>
              <td className={CELL}>{formatCurrency(result.keepEnd)}</td>
              <td className={CELL}>$0</td>
              <td className={`${CELL} font-semibold`}>{formatCurrency(result.keepEnd)}</td>
            </tr>
          </tbody>
        </table>
      </DualScroll>
    </div>
  );
}

function YearTable({ result }: { result: PayoffComparison }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <h3 className="m-0 text-[14.5px] font-bold text-foreground">Year by year</h3>
      <DualScroll>
        <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={`${HEAD} text-left`}>Year</th>
              <th className={HEAD}>Pay it off: investments</th>
              <th className={HEAD}>Keep it: investments</th>
              <th className={HEAD}>Keep it: mortgage owed</th>
              <th className={HEAD}>Keep it: net</th>
              <th className={HEAD}>Keep it ahead by</th>
            </tr>
          </thead>
          <tbody>
            {result.years.map((y) => (
              <tr key={y.year}>
                <td className={`${CELL} text-left font-semibold`}>{y.year}</td>
                <td className={CELL}>{formatCurrency(y.payoffInvested)}</td>
                <td className={CELL}>{formatCurrency(y.keepInvested)}</td>
                <td className={CELL}>{formatCurrency(y.keepMortgage)}</td>
                <td className={CELL}>{formatCurrency(y.keepInvested - y.keepMortgage)}</td>
                <td
                  className={`${CELL} font-semibold ${y.keepAhead >= 0 ? "text-[#1C8A5B]" : "text-danger"}`}
                >
                  {y.keepAhead >= 0 ? "+" : "-"}
                  {formatCurrency(Math.abs(y.keepAhead))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DualScroll>
      <p className="m-0 text-[12px] text-muted">
        Year-end values. Keep it: net is the investments less what&apos;s still owed on the
        mortgage. A negative Keep it ahead by means paying it off is ahead that year.
      </p>
    </div>
  );
}
