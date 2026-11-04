"use client";

import { useMemo } from "react";
import type { Household, RetirementPayoffSettings } from "@/lib/domain/types";
import { useScenario } from "@/store/useScenario";
import { usePlanAccess } from "@/components/plan/usePlanAccess";
import { Field } from "@/components/ui/Field";
import { PercentInput, Select } from "@/components/ui/inputs";
import { DualScroll } from "@/components/results/DualScroll";
import { nextMonth } from "@/components/results/MortgageAnalysis";
import { propertyMortgageStatements } from "@/lib/domain/propertyLoans";
import {
  RETIREMENT_PAYOFF_TAX_RATES,
  compareRetirementPayoff,
  retirementPayoffAccounts,
  retirementPayoffSettingsFor,
  type RetirementPayoffComparison,
} from "@/lib/engine/retirementPayoff";
import { formatCurrency, formatPercent } from "@/lib/format";

const CELL = "border-b border-border-subtle px-3 py-1.5 text-right tabular-nums";
const HEAD = "bg-[#1B365D] px-3 py-2 text-right text-[12px] font-bold text-white";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PAYOFF_COLOR = "#2563EB";
const KEEP_COLOR = "#1C8A5B";

const RATE_OPTIONS = RETIREMENT_PAYOFF_TAX_RATES.map((r) => ({
  value: String(r),
  label: `${Math.round(r * 100)}% bracket`,
}));

/**
 * Pay off from retirement: cash out of a tax-deferred account to pay the
 * mortgage off today, or keep the mortgage and pay it from that account each
 * month. Tax brackets 12% to 35% for each side. It doesn't change the plan's
 * projection.
 */
export function RetirementPayoffAnalysis({ household }: { household: Household }) {
  const settings = retirementPayoffSettingsFor(household);
  const mortgages = useMemo(
    () => [...(household.mortgages ?? []), ...propertyMortgageStatements(household, nextMonth())],
    [household],
  );
  const accounts = retirementPayoffAccounts(household);
  const mortgage = mortgages.find((m) => m.id === settings.mortgageId) ?? mortgages[0];
  const account = accounts.find((a) => a.id === settings.accountId) ?? accounts[0];

  if (!mortgage || !account) {
    return (
      <div className="rounded-2xl border border-border bg-white p-6 text-center text-sm text-muted">
        <p className="font-medium text-foreground">
          {!mortgage ? "No mortgage in the plan" : "No tax-deferred account in the plan"}
        </p>
        <p className="mt-1">
          {!mortgage
            ? "Add a mortgage in Mortgage analysis, or on a property in the Real estate step, to compare paying it off from your retirement account."
            : "Add a tax-deferred account (401k, 403b, IRA, DROP...) on the Accounts step to pay the mortgage from."}
        </p>
      </div>
    );
  }

  const result = compareRetirementPayoff(mortgage, account.balance, settings);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
        <p className="m-0 max-w-[760px] text-[13px] leading-relaxed text-muted">
          Cash out of a retirement account to pay the mortgage off today, or keep the mortgage and
          pay it from the same account each month. Every withdrawal is taxed as ordinary income, so
          each one is grossed up for its tax. A big lump sum stacks on top of your other income and
          usually lands in a higher bracket than smaller monthly draws, so you can set the two
          rates apart. The account keeps growing either way, and the two are compared when the
          mortgage would be paid off. Escrow is the same either way, there&apos;s no mortgage
          interest deduction, and RMDs, the account&apos;s other draws, state tax and the 10%
          penalty before 59½ are left out. This doesn&apos;t change the plan&apos;s projection.
        </p>
        <PayoffInputs
          settings={settings}
          mortgageId={mortgage.id}
          accountId={account.id}
          mortgageOptions={mortgages.map((m) => ({ value: m.id, label: m.label || "Mortgage" }))}
          accountOptions={accounts.map((a) => ({
            value: a.id,
            label: `${a.label || "Account"} (${formatCurrency(a.balance)})`,
          }))}
        />
      </div>
      {result ? (
        <>
          <Verdict result={result} settings={settings} />
          <SummaryTable result={result} settings={settings} />
          <BracketGrid result={result} settings={settings} />
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
  accountId,
  mortgageOptions,
  accountOptions,
}: {
  settings: RetirementPayoffSettings;
  mortgageId: string;
  accountId: string;
  mortgageOptions: { value: string; label: string }[];
  accountOptions: { value: string; label: string }[];
}) {
  const setRetirementPayoff = useScenario((s) => s.setRetirementPayoff);
  const { readOnly } = usePlanAccess();
  const set = (patch: Partial<RetirementPayoffSettings>) => {
    if (readOnly) return;
    setRetirementPayoff({ ...settings, ...patch });
  };
  const rateValue = (r: number) =>
    String(RETIREMENT_PAYOFF_TAX_RATES.find((b) => Math.abs(b - r) < 1e-9) ?? RETIREMENT_PAYOFF_TAX_RATES[0]);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <Field label="Mortgage">
        <Select value={mortgageId} onChange={(id) => set({ mortgageId: id })} options={mortgageOptions} />
      </Field>
      <Field label="Pay from">
        <Select value={accountId} onChange={(id) => set({ accountId: id })} options={accountOptions} />
      </Field>
      <Field label="Account return" help="What the retirement account earns a year.">
        <PercentInput
          value={settings.accountReturn}
          onChange={(accountReturn) => set({ accountReturn })}
        />
      </Field>
      <Field
        label="Lump-sum tax"
        help="Your top federal bracket for the year you take the payoff out. A large withdrawal often pushes you into a higher one."
      >
        <Select
          value={rateValue(settings.lumpSumTaxRate)}
          onChange={(v) => set({ lumpSumTaxRate: Number(v) })}
          options={RATE_OPTIONS}
        />
      </Field>
      <Field label="Monthly tax" help="Your federal bracket on the monthly withdrawals for the payment.">
        <Select
          value={rateValue(settings.monthlyTaxRate)}
          onChange={(v) => set({ monthlyTaxRate: Number(v) })}
          options={RATE_OPTIONS}
        />
      </Field>
    </div>
  );
}

const when = (r: RetirementPayoffComparison) =>
  r.payoff ? `${MONTHS[r.payoff.month - 1]} ${r.payoff.year}` : "the end";

const pct = (r: number) => `${Math.round(r * 100)}%`;

function Verdict({
  result,
  settings,
}: {
  result: RetirementPayoffComparison;
  settings: RetirementPayoffSettings;
}) {
  const ahead = result.payoffEnd - result.keepEnd;
  const payoffWins = ahead > 0;
  const color = payoffWins ? PAYOFF_COLOR : KEEP_COLOR;
  const breakeven = result.breakevenLumpSumRate;
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-white px-5 py-4">
      <p className="m-0 text-[15px] font-bold" style={{ color }}>
        {Math.abs(ahead) < 1
          ? `Both choices end even by ${when(result)}.`
          : `${payoffWins ? "Paying it off from retirement" : "Keeping the mortgage and paying monthly"} leaves ${formatCurrency(Math.abs(ahead))} more in the account by ${when(result)}.`}
      </p>
      <p className="m-0 text-[13px] text-muted">
        With monthly draws taxed at {pct(settings.monthlyTaxRate)}, paying it off comes out ahead
        when the lump sum is taxed under{" "}
        <strong className="text-foreground">
          {breakeven > 0 ? formatPercent(breakeven) : "0%"}
        </strong>
        {breakeven <= 0 ? " (so at any rate, keeping it wins)" : ""}. With the same rate on both,
        it comes out ahead when the account earns under{" "}
        <strong className="text-foreground">{formatPercent(result.breakevenReturn)}</strong> a year
        (the mortgage rate, compounded monthly). Paying it off today skips{" "}
        {formatCurrency(result.interestSaved)} of interest.
      </p>
      {result.lumpSumShort ? (
        <p className="m-0 rounded-lg bg-[#FDECEC] px-3 py-2 text-[13px] text-danger">
          The account has {formatCurrency(result.startBalance)}, short of the{" "}
          {formatCurrency(result.lumpSumWithdrawal)} it takes to pay off the mortgage and the tax.
          The numbers below run it below zero to show the gap.
        </p>
      ) : null}
      {result.keepRunsOutYear != null ? (
        <p className="m-0 rounded-lg bg-[#FDECEC] px-3 py-2 text-[13px] text-danger">
          Keeping the mortgage, the account runs out in {result.keepRunsOutYear}, before the loan
          is paid off.
        </p>
      ) : null}
    </div>
  );
}

function SummaryTable({
  result,
  settings,
}: {
  result: RetirementPayoffComparison;
  settings: RetirementPayoffSettings;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <h3 className="m-0 text-[14.5px] font-bold text-foreground">Summary by {when(result)}</h3>
      <DualScroll>
        <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={`${HEAD} text-left`}>Choice</th>
              <th className={HEAD}>Tax rate</th>
              <th className={HEAD}>Taken from the account</th>
              <th className={HEAD}>Tax paid</th>
              <th className={HEAD}>Mortgage interest</th>
              <th className={HEAD}>Account at the end</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={`${CELL} text-left font-semibold`} style={{ color: PAYOFF_COLOR }}>
                Pay it off today
              </td>
              <td className={CELL}>{pct(settings.lumpSumTaxRate)}</td>
              <td className={CELL}>{formatCurrency(result.lumpSumWithdrawal)} once</td>
              <td className={CELL}>{formatCurrency(result.lumpSumTax)}</td>
              <td className={CELL}>$0</td>
              <td className={`${CELL} font-semibold`}>{formatCurrency(result.payoffEnd)}</td>
            </tr>
            <tr>
              <td className={`${CELL} text-left font-semibold`} style={{ color: KEEP_COLOR }}>
                Keep it, pay monthly
              </td>
              <td className={CELL}>{pct(settings.monthlyTaxRate)}</td>
              <td className={CELL}>
                {formatCurrency(result.monthlyWithdrawal, true)}/mo,{" "}
                {formatCurrency(result.keepWithdrawals)} in all
              </td>
              <td className={CELL}>{formatCurrency(result.keepTax)}</td>
              <td className={CELL}>{formatCurrency(result.interestSaved)}</td>
              <td className={`${CELL} font-semibold`}>{formatCurrency(result.keepEnd)}</td>
            </tr>
          </tbody>
        </table>
      </DualScroll>
      <p className="m-0 text-[12px] text-muted">
        The account starts at {formatCurrency(result.startBalance)}. The mortgage is{" "}
        {formatCurrency(result.payoffAmount)} with a {formatCurrency(result.monthlyPayment, true)}{" "}
        monthly payment; both choices owe nothing by {when(result)}.
      </p>
    </div>
  );
}

/** Every lump-sum bracket against every monthly bracket. */
function BracketGrid({
  result,
  settings,
}: {
  result: RetirementPayoffComparison;
  settings: RetirementPayoffSettings;
}) {
  const cell = (lump: number, monthly: number) =>
    result.grid.find(
      (c) => Math.abs(c.lumpSumTaxRate - lump) < 1e-9 && Math.abs(c.monthlyTaxRate - monthly) < 1e-9,
    );
  const isCurrent = (lump: number, monthly: number) =>
    Math.abs(settings.lumpSumTaxRate - lump) < 1e-9 && Math.abs(settings.monthlyTaxRate - monthly) < 1e-9;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <h3 className="m-0 text-[14.5px] font-bold text-foreground">By tax bracket</h3>
      <p className="m-0 text-[12.5px] text-muted">
        How much more paying it off leaves in the account by {when(result)}, for each pair of
        brackets. Blue means paying it off wins, green means keeping it wins. The outlined cell is
        your choice above; the diagonal is the same bracket on both.
      </p>
      <DualScroll>
        <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={`${HEAD} text-left`}>Lump sum taxed at</th>
              {RETIREMENT_PAYOFF_TAX_RATES.map((m) => (
                <th key={m} className={HEAD}>
                  Monthly at {pct(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RETIREMENT_PAYOFF_TAX_RATES.map((lump) => (
              <tr key={lump}>
                <td className={`${CELL} text-left font-semibold`}>{pct(lump)}</td>
                {RETIREMENT_PAYOFF_TAX_RATES.map((monthly) => {
                  const ahead = cell(lump, monthly)?.payoffAhead ?? 0;
                  return (
                    <td
                      key={monthly}
                      className={`${CELL} font-semibold ${isCurrent(lump, monthly) ? "outline outline-2 -outline-offset-2 outline-[#1B365D]" : ""} ${lump === monthly ? "bg-card" : ""}`}
                      style={{ color: ahead >= 0 ? PAYOFF_COLOR : KEEP_COLOR }}
                    >
                      {ahead >= 0 ? "+" : "-"}
                      {formatCurrency(Math.abs(ahead))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </DualScroll>
    </div>
  );
}

function YearTable({ result }: { result: RetirementPayoffComparison }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <h3 className="m-0 text-[14.5px] font-bold text-foreground">Year by year</h3>
      <DualScroll>
        <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={`${HEAD} text-left`}>Year</th>
              <th className={HEAD}>Pay it off: account</th>
              <th className={HEAD}>Keep it: account</th>
              <th className={HEAD}>Keep it: mortgage owed</th>
              <th className={HEAD}>Keep it: net</th>
              <th className={HEAD}>Pay it off ahead by</th>
            </tr>
          </thead>
          <tbody>
            {result.years.map((y) => (
              <tr key={y.year}>
                <td className={`${CELL} text-left font-semibold`}>{y.year}</td>
                <td className={CELL}>{formatCurrency(y.payoffBalance)}</td>
                <td className={CELL}>{formatCurrency(y.keepBalance)}</td>
                <td className={CELL}>{formatCurrency(y.keepMortgage)}</td>
                <td className={CELL}>{formatCurrency(y.keepBalance - y.keepMortgage)}</td>
                <td
                  className={`${CELL} font-semibold`}
                  style={{ color: y.payoffAhead >= 0 ? PAYOFF_COLOR : KEEP_COLOR }}
                >
                  {y.payoffAhead >= 0 ? "+" : "-"}
                  {formatCurrency(Math.abs(y.payoffAhead))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DualScroll>
      <p className="m-0 text-[12px] text-muted">
        Every value is at year end, before the tax still owed on what&apos;s in the account.
      </p>
      <dl className="m-0 flex flex-col gap-1.5 text-[12px] text-muted">
        {YEAR_COLUMN_DEFINITIONS.map(([term, meaning]) => (
          <div key={term}>
            <dt className="inline font-semibold text-foreground">{term}: </dt>
            <dd className="inline">{meaning}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** What each Year by year column means (user's request). */
const YEAR_COLUMN_DEFINITIONS: [string, string][] = [
  [
    "Pay it off: account",
    "The retirement account at year end if you pay the mortgage off today. The lump sum (the payoff plus its tax) comes out up front, and what's left keeps growing at the account return with no more withdrawals for the mortgage.",
  ],
  [
    "Keep it: account",
    "The same account at year end if you keep the mortgage. Nothing comes out up front; each month it pays the mortgage payment plus that draw's tax, and the rest keeps growing.",
  ],
  [
    "Keep it: mortgage owed",
    "The loan balance still owed at year end when you keep it. It reaches $0 in the payoff year, when both choices owe nothing.",
  ],
  [
    "Keep it: net",
    "Keep it: account less Keep it: mortgage owed. It's the fair number to set against Pay it off: account, since that choice owes nothing on the house.",
  ],
  [
    "Pay it off ahead by",
    "Pay it off: account less Keep it: net. Positive (blue) means paying it off leaves you better off that year; negative (green) means keeping the mortgage is ahead.",
  ],
];

