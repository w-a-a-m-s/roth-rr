"use client";

import { useMemo, useState } from "react";
import type { Household } from "@/lib/domain/types";
import type { ReferenceData } from "@/lib/externalData/types";
import type { ProjectionRow } from "@/lib/engine/types";
import { useScenario } from "@/store/useScenario";
import { usePlanAccess } from "@/components/plan/usePlanAccess";
import { Field } from "@/components/ui/Field";
import { MoneyInput, Select } from "@/components/ui/inputs";
import { DualScroll } from "@/components/results/DualScroll";
import { calculateSpendingCapacity } from "@/lib/calculate";
import {
  accountsLeft,
  spendingCapacitySettingsFor,
  type CapacityScenario,
} from "@/lib/engine/spendingCapacity";
import { primaryPersonId } from "@/lib/engine/project";
import { formatCurrency } from "@/lib/format";

const CELL = "border-b border-border-subtle px-3 py-1.5 text-right tabular-nums";
const HEAD = "bg-[#1B365D] px-3 py-2 text-right text-[12px] font-bold text-white";
/** The monthly spending stands out, so it's easy to find. */
const MONTHLY_HEAD = HEAD.replace("bg-[#1B365D]", "bg-[#2563EB]");
const MONTHLY_CELL = "bg-[#E8F0FE] font-bold text-[#1B365D]";

type ScenarioKey = "baseline" | "roth";
const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  baseline: "No conversion",
  roth: "With conversion",
};

/**
 * Spending capacity: the most the plan can spend so the money lasts to the
 * final age, with and without conversions. It doesn't change the plan.
 */
export function SpendingCapacityAnalysis({
  household,
  refs,
}: {
  household: Household;
  refs: ReferenceData;
}) {
  const settings = spendingCapacitySettingsFor(household);
  const result = useMemo(() => calculateSpendingCapacity(household, refs), [household, refs]);
  const [scenario, setScenario] = useState<ScenarioKey>("roth");
  const setSpendingCapacity = useScenario((s) => s.setSpendingCapacity);
  const { readOnly } = usePlanAccess();
  const finalAge = household.assumptions.finalAge;

  if (!(result.baseline.planMonthly > 0)) {
    return (
      <div className="rounded-2xl border border-border bg-white p-6 text-center text-sm text-muted">
        <p className="font-medium text-foreground">No expenses in the plan</p>
        <p className="mt-1">Add your expenses in the Expenses step to see how much you could spend.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
        <p className="m-0 max-w-[720px] text-[13px] leading-relaxed text-muted">
          The most you could spend so the money lasts to age {finalAge}. Every expense in the plan
          goes up or down by the same share and keeps growing as it does in the plan. A year short
          of cash takes more from the accounts: after-tax first, then tax-deferred, then Roth,
          including the tax it adds. Money left over in a year isn&apos;t saved, so this leans
          safe. Property and business aren&apos;t sold. This doesn&apos;t change the plan&apos;s
          projection.
        </p>
        <div className="w-full sm:w-[260px]">
          <Field
            label={`Leave at least this at age ${finalAge}`}
            help="In the investment and retirement accounts, before tax."
          >
            <MoneyInput
              value={settings.endReserve}
              step={10_000}
              onChange={(endReserve) => {
                if (readOnly) return;
                setSpendingCapacity({ ...settings, endReserve: Math.max(0, endReserve) });
              }}
            />
          </Field>
        </div>
      </div>
      <Headline result={result} finalAge={finalAge} />
      <SummaryTable result={result} finalAge={finalAge} />
      <YearTable
        household={household}
        capacity={result[scenario]}
        scenario={scenario}
        onScenario={setScenario}
      />
    </div>
  );
}

/** The answer up top: what the plan could spend a month. */
function Headline({
  result,
  finalAge,
}: {
  result: Record<ScenarioKey, CapacityScenario>;
  finalAge: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {(["baseline", "roth"] as const).map((key) => (
        <div key={key} className="rounded-2xl border-2 border-[#2563EB] bg-[#E8F0FE] px-5 py-4">
          <p className="m-0 text-[12.5px] font-semibold text-muted">
            {SCENARIO_LABELS[key]}: you could spend
          </p>
          <p className="m-0 text-[28px] font-bold tabular-nums text-[#1B365D]">
            {formatCurrency(result[key].capacityMonthly)}
            <span className="text-[15px] font-semibold"> a month</span>
          </p>
          <p className="m-0 text-[12.5px] text-muted">
            In the plan&apos;s first year, growing as the plan&apos;s expenses do, to age{" "}
            {finalAge}.
          </p>
        </div>
      ))}
    </div>
  );
}

function SummaryTable({
  result,
  finalAge,
}: {
  result: Record<ScenarioKey, CapacityScenario>;
  finalAge: number;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <h3 className="m-0 text-[14.5px] font-bold text-foreground">Spending capacity</h3>
      <DualScroll>
        <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={`${HEAD} text-left`}>Scenario</th>
              <th className={HEAD}>Plan spends a month</th>
              <th className={MONTHLY_HEAD}>You could spend a month</th>
              <th className={HEAD}>Difference</th>
              <th className={HEAD}>With the plan&apos;s spending</th>
            </tr>
          </thead>
          <tbody>
            {(["baseline", "roth"] as const).map((key) => {
              const s = result[key];
              const diff = s.capacityMonthly - s.planMonthly;
              return (
                <tr key={key}>
                  <td className={`${CELL} text-left font-semibold`}>{SCENARIO_LABELS[key]}</td>
                  <td className={CELL}>{formatCurrency(s.planMonthly)}</td>
                  <td className={`${CELL} ${MONTHLY_CELL}`}>
                    {formatCurrency(s.capacityMonthly)}
                  </td>
                  <td className={`${CELL} font-semibold ${diff >= 0 ? "text-[#1C8A5B]" : "text-danger"}`}>
                    {diff >= 0 ? "+" : "-"}
                    {formatCurrency(Math.abs(diff))} ({diff >= 0 ? "+" : "-"}
                    {Math.abs(Math.round((s.scale - 1) * 100))}%)
                  </td>
                  <td className={CELL}>
                    {s.runsShort
                      ? `Runs short in ${s.runsShort.year} (age ${s.runsShort.age})`
                      : `Lasts to age ${finalAge}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DualScroll>
      <p className="m-0 text-[12px] text-muted">
        Monthly spending in the plan&apos;s first year. Later years grow the way each expense does
        in the plan.
      </p>
    </div>
  );
}

/** What a year takes from the accounts to cover being short. */
function takenFromAccounts(row: ProjectionRow): number {
  return Object.entries(row.incomeMonthly)
    .filter(([key]) => key.startsWith("topup:"))
    .reduce((sum, [, v]) => sum + v * 12, 0);
}

function YearTable({
  household,
  capacity,
  scenario,
  onScenario,
}: {
  household: Household;
  capacity: CapacityScenario;
  scenario: ScenarioKey;
  onScenario: (key: ScenarioKey) => void;
}) {
  const primaryId = primaryPersonId(household);
  const hasDeposits = capacity.rows.some((row) => row.monthlyDeposits > 0);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-[14.5px] font-bold text-foreground">
          Year by year at {formatCurrency(capacity.capacityMonthly)} a month
        </h3>
        <span className="w-[180px]">
          <Select
            value={scenario}
            onChange={onScenario}
            options={(["baseline", "roth"] as const).map((key) => ({
              value: key,
              label: SCENARIO_LABELS[key],
            }))}
          />
        </span>
      </div>
      <DualScroll>
        <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={`${HEAD} text-left`}>Year</th>
              <th className={HEAD}>Age</th>
              <th className={MONTHLY_HEAD}>Spending a month</th>
              <th className={HEAD}>Spending a year</th>
              <th className={HEAD}>Income</th>
              <th className={HEAD}>Taken from accounts</th>
              <th className={HEAD}>Taxes</th>
              {hasDeposits ? <th className={HEAD}>Saved to accounts</th> : null}
              <th className={HEAD}>Accounts left</th>
            </tr>
          </thead>
          <tbody>
            {capacity.rows.map((row) => {
              const taken = takenFromAccounts(row);
              return (
                <tr key={row.calendarYear}>
                  <td className={`${CELL} text-left font-semibold`}>{row.calendarYear}</td>
                  <td className={CELL}>{row.ages[primaryId] ?? "-"}</td>
                  <td className={`${CELL} ${MONTHLY_CELL}`}>
                    {formatCurrency(row.monthlyExpenses)}
                  </td>
                  <td className={CELL}>{formatCurrency(row.monthlyExpenses * 12)}</td>
                  <td className={CELL}>{formatCurrency(row.totalMonthlyIncome * 12 - taken)}</td>
                  <td className={CELL}>{taken > 0.5 ? formatCurrency(taken) : "-"}</td>
                  <td className={CELL}>{formatCurrency(row.annualTax - row.conversionTaxWithheld)}</td>
                  {hasDeposits ? (
                    <td className={CELL}>
                      {row.monthlyDeposits > 0 ? formatCurrency(row.monthlyDeposits * 12) : "-"}
                    </td>
                  ) : null}
                  <td className={CELL}>{formatCurrency(accountsLeft(row))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DualScroll>
      <p className="m-0 text-[12px] text-muted">
        Spending a month is highlighted; the other columns are yearly. Each year adds up: Income
        plus Taken from accounts, less Taxes{hasDeposits ? " and Saved to accounts" : ""}, is the
        Spending. Income is before tax: pensions, Social Security, RMDs and the plan&apos;s own
        withdrawals. Taxes include the tax on conversions and on what&apos;s taken. Accounts left
        is before tax.
      </p>
    </div>
  );
}
