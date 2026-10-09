"use client";

import { Fragment, type ReactNode } from "react";
import { STEP_INDEX } from "@/components/plan/steps";
import { usePlanAccess } from "@/components/plan/usePlanAccess";
import { FILING_STATUS_LABELS } from "@/lib/config/defaults";
import { US_STATE_LABELS } from "@/lib/config/stateTax";
import {
  DEFAULT_RETIREMENT_ACCOUNT_TYPE,
  RETIREMENT_ACCOUNT_TYPE_LABELS,
  accountsInDisplayOrder,
  expenseYearsLabel,
} from "@/lib/domain/household";
import { primaryRmdAge } from "@/lib/domain/rmd";
import type { AccountKind, Household, IncomeKind } from "@/lib/domain/types";
import {
  depositAmountLabel,
  depositYearsLabel,
} from "@/lib/depositSummary";
import { primaryPersonId, projectionStartYear } from "@/lib/engine/project";
import { formatCurrency } from "@/lib/format";
import { buildConversionSchedule } from "@/lib/optimizer";
import {
  fillBracketLabel,
  resolveBracketRate,
  STRATEGY_LABELS,
} from "@/lib/optimizer/labels";
import { conversionYears } from "@/lib/optimizer/util";
import { buildTimeline } from "@/lib/timeline";
import { useHousehold } from "@/store/useScenario";
import { useExternalData } from "@/store/useExternalData";
import { useUI } from "@/store/useUI";

const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  retirementTaxable: "Taxable retirement",
  rothTaxFree: "Roth",
  investment: "Investment",
  annuity: "Annuity",
  cd: "CD",
  savings: "Savings",
};

const INCOME_KIND_LABELS: Record<IncomeKind, string> = {
  pension: "Pension",
  salary: "Salary",
  business: "Business",
  socialSecurity: "Social Security",
  militaryPension: "Military pension",
  lifeInsurance: "Life insurance",
  disabilityInsurance: "Disability insurance",
  retirementDraw: "Retirement withdrawal",
  rothWithdrawal: "Roth withdrawal",
  afterTaxWithdrawal: "After-tax withdrawal",
  other: "Other",
};

function Section({
  title,
  stepId,
  readOnly,
  children,
}: {
  title: string;
  stepId: string;
  readOnly: boolean;
  children: ReactNode;
}) {
  const openEditPlan = useUI((s) => s.openEditPlan);
  return (
    <section className="border-b border-border-subtle py-[13px]">
      <div className="mb-[7px] flex items-center justify-between">
        <h3 className="m-0 text-[13.5px] font-bold text-foreground">{title}</h3>
        {readOnly ? null : (
          <button
            type="button"
            onClick={() => openEditPlan(STEP_INDEX[stepId])}
            className="border-0 bg-transparent p-0 text-xs font-bold text-accent"
          >
            Edit
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[12.5px] text-muted-3">{children}</p>;
}

function Row({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="truncate text-[12.5px] text-muted">{label}</span>
      <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

function ManualSchedule({
  schedule,
  startYear,
}: {
  schedule: number[];
  startYear: number;
}) {
  const entries = schedule
    .map((amount, i) => ({
      year: Number.isFinite(startYear) ? startYear + i : i + 1,
      amount,
    }))
    .filter((e) => e.amount > 0);

  if (entries.length === 0) {
    return <Row label="Schedule" value="-" />;
  }

  const total = entries.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="flex flex-col gap-1">
      {entries.map((e) => (
        <div
          key={e.year}
          className="flex justify-between gap-2 text-[12.5px] text-muted"
        >
          <span>{e.year}</span>
          <span className="font-semibold tabular-nums text-foreground">
            {formatCurrency(e.amount)}
          </span>
        </div>
      ))}
      <div className="mt-0.5 flex justify-between gap-2 border-t border-border-subtle pt-1 text-[12.5px] font-semibold text-foreground">
        <span>Total converted</span>
        <span className="tabular-nums">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}

function PlanTimeline({ household }: { household: Household }) {
  const events = buildTimeline(household);
  if (events.length === 0) return null;

  return (
    <div>
      <h3 className="mb-3 text-[13.5px] font-bold text-foreground">Timeline</h3>
      <div className="relative pl-[18px]">
        <div
          aria-hidden
          className="absolute bottom-5 left-[3px] top-1 w-0.5 bg-border"
        />
        {events.map((event, index) => (
          <div
            key={`${event.year}-${index}`}
            className="relative pb-5 last:pb-0"
          >
            <span
              aria-hidden
              className="absolute -left-[18px] top-0.5 h-2 w-2 rounded-full border-2 border-white bg-accent shadow-[0_0_0_1px_#E7E4DD]"
            />
            <div className="text-[11px] font-bold leading-none text-muted-3">
              {event.year}
            </div>
            <div className="mt-px text-[12.5px] font-semibold leading-snug text-foreground">
              {event.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Timeline + household / accounts / income / RE / expenses / conversion rows. */
export function PlanDetails() {
  const household = useHousehold();
  const { readOnly } = usePlanAccess();
  const a = household.assumptions;
  const opt = household.optimizer;
  const refs = useExternalData((s) => s.refs);
  const mainPersonId = primaryPersonId(household);
  const peopleOrdered = [
    ...household.people.filter((p) => p.id === mainPersonId),
    ...household.people.filter((p) => p.id !== mainPersonId),
  ];

  return (
    <>
      <PlanTimeline household={household} />

      <div className="my-[22px] h-px bg-border" />

      <Section title="Household" stepId="household" readOnly={readOnly}>
        <Row
          label="Filing status"
          value={FILING_STATUS_LABELS[household.filingStatus]}
        />
        <Row
          label="State of residence"
          value={
            household.residenceState
              ? `${US_STATE_LABELS[household.residenceState]} (${household.residenceState})`
              : "-"
          }
        />
        {peopleOrdered.map((p) => (
          <Row
            key={p.id}
            label={
              <span className="flex items-center gap-1.5">
                {p.name || "Person"}
                {p.id === mainPersonId ? (
                  <span className="rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,#fff)] px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide text-[color-mix(in_srgb,var(--accent)_50%,#000)]">
                    MAIN
                  </span>
                ) : null}
              </span>
            }
            value={
              <span className="text-[11px] font-medium text-muted">
                {p.birthYear ?? "-"} · ret. {p.retirementYear ?? "-"}
              </span>
            }
          />
        ))}
        <Row label="RMD age" value={primaryRmdAge(household) ?? "-"} />
        <Row label="Project to age" value={a.finalAge} />
      </Section>

      <Section title="Accounts" stepId="accounts" readOnly={readOnly}>
        {household.accounts.length === 0 ? (
          <Empty>No accounts added</Empty>
        ) : (
          accountsInDisplayOrder(household.accounts).map((acc) => (
            <Fragment key={acc.id}>
              <Row
                label={
                  <>
                    {acc.label || ACCOUNT_KIND_LABELS[acc.kind]}{" "}
                    <span className="text-[11px] text-muted-3">
                      (
                      {acc.kind === "retirementTaxable"
                        ? RETIREMENT_ACCOUNT_TYPE_LABELS[
                            acc.retirementType ?? DEFAULT_RETIREMENT_ACCOUNT_TYPE
                          ]
                        : ACCOUNT_KIND_LABELS[acc.kind]}
                      )
                    </span>
                  </>
                }
                value={formatCurrency(acc.balance)}
              />
              {(acc.deposits ?? []).map((deposit) => (
                <Row
                  key={deposit.id}
                  label={
                    <span className="pl-3 text-[11.5px] text-muted-3">
                      {deposit.label || "Deposit"} ·{" "}
                      {depositYearsLabel(deposit)}
                    </span>
                  }
                  value={
                    <span className="text-[11.5px] font-medium text-muted">
                      {depositAmountLabel(deposit)}
                    </span>
                  }
                />
              ))}
            </Fragment>
          ))
        )}
      </Section>

      <Section title="Income" stepId="income" readOnly={readOnly}>
        {household.incomes.length === 0 ? (
          <Empty>No income sources added</Empty>
        ) : (
          household.incomes.map((inc) => (
            <Row
              key={inc.id}
              label={
                <>
                  {inc.label || INCOME_KIND_LABELS[inc.kind]}{" "}
                  <span className="text-[11px] text-muted-3">
                    ({INCOME_KIND_LABELS[inc.kind]})
                  </span>
                </>
              }
              value={`${formatCurrency(inc.monthlyAmount)}/mo`}
            />
          ))
        )}
      </Section>

      <Section title="Real estate" stepId="realEstate" readOnly={readOnly}>
        {household.realEstate.length === 0 ? (
          <Empty>No properties added</Empty>
        ) : (
          household.realEstate.map((re) => (
            <div key={re.id} className="flex flex-col">
              <Row
                label={re.label || "Property"}
                value={formatCurrency(re.marketValue)}
              />
              {(re.monthlyRent ?? 0) > 0 || (re.mortgageBalance ?? 0) > 0 ? (
                <p className="text-[11px] text-muted-3">
                  {(re.monthlyRent ?? 0) > 0
                    ? `${formatCurrency(re.monthlyRent ?? 0)}/mo rent`
                    : null}
                  {(re.monthlyRent ?? 0) > 0 && (re.mortgageBalance ?? 0) > 0
                    ? " · "
                    : null}
                  {(re.mortgageBalance ?? 0) > 0
                    ? `${formatCurrency(re.mortgageBalance ?? 0)} mortgage`
                    : null}
                </p>
              ) : null}
            </div>
          ))
        )}
      </Section>

      <Section title="Expenses" stepId="expenses" readOnly={readOnly}>
        {household.expenses.length === 0 ? (
          <Empty>No expenses added</Empty>
        ) : (
          household.expenses.map((e) => {
            const years = expenseYearsLabel(e);
            const amount = `${formatCurrency(e.amount)}/${
              e.frequency === "yearly" ? "yr" : "mo"
            }`;
            return (
              <Row
                key={e.id}
                label={e.label || "Expense"}
                value={years ? `${amount} · ${years}` : amount}
              />
            );
          })
        )}
      </Section>

      <Section title="Conversion" stepId="conversion" readOnly={readOnly}>
        <Row
          label="Strategy"
          value={
            opt.strategy === "fillBracket"
              ? fillBracketLabel(resolveBracketRate(opt.targetBracketRate))
              : STRATEGY_LABELS[opt.strategy]
          }
        />
        <ManualSchedule
          schedule={buildConversionSchedule(household, refs).slice(
            0,
            conversionYears(household),
          )}
          startYear={projectionStartYear(household)}
        />
      </Section>
    </>
  );
}
