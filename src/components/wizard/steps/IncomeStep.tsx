"use client";

import { useMemo, useRef, useState } from "react";
import { useHousehold, useScenario } from "@/store/useScenario";
import { useExternalData } from "@/store/useExternalData";
import { Field } from "@/components/ui/Field";
import {
  MoneyInput,
  PercentInput,
  Select,
  TextInput,
  YearSelect,
} from "@/components/ui/inputs";
import { AddButton, EntityCard, ReadStat } from "@/components/ui/EntityCard";
import { RestoreDeleted } from "@/components/ui/RestoreDeleted";
import { StepTour } from "@/components/onboarding/StepTour";
import type {
  DisabilityCoverage,
  IncomeAmountSource,
  IncomeKind,
  IncomeSource,
  Taxability,
} from "@/lib/domain/types";
import {
  DISABILITY_COVERAGE_LABELS,
  DISABILITY_WAITING_DAYS,
  WITHDRAWAL_SOURCE_KINDS,
  disabilityCoverage,
  disabilityWaitingDays,
  isPensionIncome,
  incomeGrowthFrom,
  isWithdrawalIncome,
  pensionPayout,
  usesIncomeTable,
} from "@/lib/domain/household";
import type { ProjectionRow } from "@/lib/engine/types";
import { projectionStartYear } from "@/lib/engine/project";
import { runScenario } from "@/lib/engine/runScenario";
import { INCOME_TABLE_GROWTH, incomeTableRate } from "@/lib/engine/incomeTable";
import { GrowthFromToggle } from "@/components/ui/GrowthFromToggle";
import { IncomeTableLink } from "@/components/plan/IncomeTable";
import { SOCIAL_SECURITY_MAX_TAXABLE_SHARE } from "@/lib/config/federalTax";
import { DEFAULT_INCOME_GROWTH } from "@/lib/config/defaults";
import { formatCurrency, formatPercent } from "@/lib/format";
import { uid } from "@/lib/id";
import { INCOME_TOUR_STEPS } from "@/lib/onboarding/incomeTour";

const KIND_OPTIONS: { value: IncomeKind; label: string }[] = [
  { value: "business", label: "Business income" },
  { value: "disabilityInsurance", label: "Disability insurance" },
  { value: "lifeInsurance", label: "Life insurance" },
  { value: "militaryPension", label: "Military pension" },
  { value: "pension", label: "Pension" },
  { value: "salary", label: "Salary" },
  { value: "socialSecurity", label: "Social Security" },
  { value: "afterTaxWithdrawal", label: "Withdraw from after-tax account" },
  { value: "retirementDraw", label: "Withdraw from retirement account" },
  { value: "rothWithdrawal", label: "Withdraw from Roth account" },
  { value: "other", label: "Other" },
];

const AMOUNT_SOURCE_OPTIONS: { value: IncomeAmountSource; label: string }[] = [
  { value: "entered", label: "Enter an amount" },
  { value: "incomeTable", label: "Income table (by age)" },
];

const TAXABILITY_OPTIONS: { value: Taxability; label: string }[] = [
  { value: "full", label: "Fully taxable" },
  { value: "taxFree", label: "Tax free" },
];

const WAITING_OPTIONS = DISABILITY_WAITING_DAYS.map((days) => ({
  value: String(days),
  label: `${days} days`,
}));

const COVERAGE_OPTIONS: { value: DisabilityCoverage; label: string }[] = [
  { value: "full", label: `${DISABILITY_COVERAGE_LABELS.full} (100%)` },
  { value: "partial", label: `${DISABILITY_COVERAGE_LABELS.partial} (50%)` },
];

const KIND_LABEL = Object.fromEntries(
  KIND_OPTIONS.map((o) => [o.value, o.label]),
) as Record<IncomeKind, string>;

/** Fixed, non-editable taxability copy shown for account-withdrawal kinds. */
const WITHDRAWAL_TAX_LABEL: Partial<Record<IncomeKind, string>> = {
  retirementDraw: "Fully taxable",
  rothWithdrawal: "Tax free",
  afterTaxWithdrawal: "Basis tax-free; gains may be taxable",
};

function taxabilityLabel(income: IncomeSource): string {
  if (income.kind === "socialSecurity") {
    return `Up to ${Math.round(SOCIAL_SECURITY_MAX_TAXABLE_SHARE * 100)}% taxable`;
  }
  if (isWithdrawalIncome(income.kind)) {
    return WITHDRAWAL_TAX_LABEL[income.kind] ?? "-";
  }
  return income.taxability === "taxFree" ? "Tax free" : "Fully taxable";
}

function activeYearsLabel(income: IncomeSource): string {
  const start = income.startYear ?? "Start";
  const end = income.endYear ?? "End";
  return `${start} - ${end}`;
}

/**
 * What an income-table withdrawal pays: the payout rate for the owner's age
 * in the income's first year, and the yearly amount the no-conversion
 * projection fixes from the account's balance that January.
 */
function incomeTableTerms(
  household: ReturnType<typeof useHousehold>,
  income: IncomeSource,
  rows: ProjectionRow[] | null,
) {
  const planStart = projectionStartYear(household);
  const year = Math.max(income.startYear ?? planStart, planStart);
  const owner = household.people.find((p) => p.id === income.ownerId);
  const age = owner?.birthYear != null ? year - owner.birthYear : null;
  const row = rows?.find((r) => (r.incomeMonthly[income.id] ?? 0) > 0);
  return {
    year,
    age,
    rate: incomeTableRate(household, income, year),
    monthly: row ? row.incomeMonthly[income.id] : null,
  };
}

function IncomeFields({
  income,
  editing,
  onEdit,
  onDone,
  baselineRows,
}: {
  income: IncomeSource;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  /** No-conversion projection, only when some income uses the table. */
  baselineRows: ProjectionRow[] | null;
}) {
  const household = useHousehold();
  const { updateIncome, removeIncome } = useScenario();
  const currentYear = new Date().getFullYear();
  const sourceKinds = WITHDRAWAL_SOURCE_KINDS[income.kind];
  const sourceAccounts = sourceKinds
    ? household.accounts.filter((a) => sourceKinds.includes(a.kind))
    : [];
  const ownerName =
    household.people.find((p) => p.id === income.ownerId)?.name || "Person";
  const kindLabel = KIND_LABEL[income.kind];
  const payout = pensionPayout(income);
  const hasSpouse = household.people.some((p) => p.id !== income.ownerId);
  const waitingDays = disabilityWaitingDays(income);
  const coverage = disabilityCoverage(income);
  const isDisability = income.kind === "disabilityInsurance";
  const businesses = household.businesses ?? [];
  const linkedBusiness = businesses.find((b) => b.id === income.businessId);
  const onTable = usesIncomeTable(income);
  const table = onTable ? incomeTableTerms(household, income, baselineRows) : null;
  const tableRate = table ? formatPercent(table.rate) : "";
  const tableGrowth = formatPercent(INCOME_TABLE_GROWTH);

  // Changing the type to a withdrawal kind must also pick a source account.
  // Without this the "From account" select would show the first option while
  // `drawsFromAccountId` stayed empty, so the engine would treat the income as
  // phantom money (taxed/spent but never depleting any account).
  function handleKindChange(kind: IncomeKind) {
    const patch: Partial<IncomeSource> = { kind };
    // The payout choice only means something on a pension.
    if (!isPensionIncome(kind) && income.pensionPayout) {
      patch.pensionPayout = undefined;
    }
    // Only business income links to a business. With a single business there
    // is nothing to choose, so link it straight away.
    if (kind !== "business" && income.businessId) patch.businessId = undefined;
    if (kind === "business" && !income.businessId && businesses.length === 1) {
      patch.businessId = businesses[0].id;
    }
    // Disability settings only mean something on disability insurance.
    if (kind !== "disabilityInsurance") {
      if (income.disabilityWaitingDays) patch.disabilityWaitingDays = undefined;
      if (income.disabilityCoverage) patch.disabilityCoverage = undefined;
    }
    // Individually bought disability policies pay tax-free benefits, so start
    // there. Employer-paid plans can switch it back to taxable.
    if (kind === "disabilityInsurance" && income.kind !== kind) {
      patch.taxability = "taxFree";
    }
    const nextKinds = WITHDRAWAL_SOURCE_KINDS[kind];
    if (!nextKinds) {
      if (income.drawsFromAccountId) patch.drawsFromAccountId = undefined;
      // The income table only applies to account withdrawals.
      if (income.amountSource) patch.amountSource = undefined;
      updateIncome(income.id, patch);
      return;
    }
    const eligible = household.accounts.filter((a) => nextKinds.includes(a.kind));
    const stillValid = eligible.some((a) => a.id === income.drawsFromAccountId);
    if (!stillValid) patch.drawsFromAccountId = eligible[0]?.id;
    updateIncome(income.id, patch);
  }

  return (
    <EntityCard
      title={income.label || kindLabel || "Income"}
      badge={
        <span className="rounded-full bg-[#F2F0EA] px-2 py-0.5 text-[10.5px] font-semibold text-muted">
          {kindLabel}
        </span>
      }
      editing={editing}
      onEdit={onEdit}
      onDone={onDone}
      onRemove={() => {
        removeIncome(income.id);
        onDone();
      }}
      summary={
        <>
          <ReadStat label="Owner" value={ownerName} />
          <ReadStat
            label={isDisability ? "Monthly benefit" : "Monthly amount"}
            value={
              table
                ? `Income table, ${tableRate} a year${
                    table.monthly != null ? ` (about ${formatCurrency(table.monthly)})` : ""
                  }`
                : formatCurrency(income.monthlyAmount)
            }
          />
          <ReadStat label="Taxability" value={taxabilityLabel(income)} />
          <ReadStat
            label="Annual growth"
            value={
              table
                ? `Income fixed, account grows ${tableGrowth}`
                : `${formatPercent(income.growthRate)} from ${
                    incomeGrowthFrom(income) === "today" ? "today" : "its start"
                  }`
            }
          />
          <ReadStat
            label={isDisability ? "Benefit period" : "Active years"}
            value={activeYearsLabel(income)}
          />
          {income.kind === "business" ? (
            <ReadStat
              label="From business"
              value={
                linkedBusiness ? linkedBusiness.label || "Business" : "Not linked"
              }
            />
          ) : null}
          {payout ? (
            <ReadStat
              label="Survivorship"
              value={payout === "survivor" ? "On, pays the spouse for life" : "Off"}
            />
          ) : null}
          {waitingDays ? (
            <ReadStat label="Waiting period" value={`${waitingDays} days`} />
          ) : null}
          {coverage ? (
            <ReadStat
              label="Coverage"
              value={DISABILITY_COVERAGE_LABELS[coverage]}
            />
          ) : null}
        </>
      }
    >
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-4 [&>*]:min-w-0">
        <Field label="Label">
          <TextInput
            value={income.label}
            onChange={(label) => updateIncome(income.id, { label })}
          />
        </Field>
        <Field label="Type">
          <Select
            value={income.kind}
            onChange={handleKindChange}
            options={KIND_OPTIONS}
          />
        </Field>
        <Field label="Owner">
          <Select
            value={income.ownerId}
            onChange={(ownerId) => updateIncome(income.id, { ownerId })}
            options={household.people.map((p) => ({
              value: p.id,
              label: p.name || "Person",
            }))}
          />
        </Field>
        {sourceKinds ? (
          <Field
            label="Amount from"
            help="Enter an amount, or take it from the income table: the account's balance when the income starts times the payout rate for the owner's age that year, fixed for life. The account then grows 8% a year. It's the Joint Life immediate payout column of Transamerica's income withdrawal table (5% under 59)."
          >
            <Select
              value={income.amountSource ?? "entered"}
              onChange={(source) =>
                updateIncome(income.id, {
                  amountSource: source === "incomeTable" ? "incomeTable" : undefined,
                })
              }
              options={AMOUNT_SOURCE_OPTIONS}
            />
            <IncomeTableLink
              className="mt-1"
              highlightAges={table?.age != null ? [table.age] : []}
            />
          </Field>
        ) : null}
        <Field
          label={isDisability ? "Monthly benefit" : "Monthly amount"}
          help={
            isDisability
              ? "The policy's full monthly benefit. Partial disability pays half of it."
              : undefined
          }
        >
          {table ? (
            <div className="flex h-9 items-center rounded-md border border-border bg-card px-2.5 text-sm text-muted">
              {table.monthly != null ? `About ${formatCurrency(table.monthly)}` : "From the table"}
            </div>
          ) : (
            <MoneyInput
              value={income.monthlyAmount}
              onChange={(monthlyAmount) =>
                updateIncome(income.id, { monthlyAmount })
              }
            />
          )}
        </Field>
        {income.kind === "socialSecurity" ? (
          <Field
            label="Taxability"
            help="The IRS taxes 0% to 85% of Social Security depending on your other income and filing status: none of it below $25,000 single / $32,000 joint, up to 85% above $34,000 / $44,000 (other income plus half the benefits). We figure it every year, so it can't be changed here."
          >
            <div className="flex h-9 items-center rounded-md border border-border bg-card px-2.5 text-sm text-muted">
              Up to {Math.round(SOCIAL_SECURITY_MAX_TAXABLE_SHARE * 100)}% taxable (Social
              Security)
            </div>
          </Field>
        ) : isWithdrawalIncome(income.kind) ? (
          <Field
            label="Taxability"
            help="Determined by the account type the withdrawal comes from, so it can't be changed here."
          >
            <div className="flex h-9 items-center rounded-md border border-border bg-card px-2.5 text-sm text-muted">
              {WITHDRAWAL_TAX_LABEL[income.kind]}
            </div>
          </Field>
        ) : (
          <Field label="Taxability">
            <Select
              value={income.taxability}
              onChange={(taxability) =>
                updateIncome(income.id, { taxability })
              }
              options={TAXABILITY_OPTIONS}
            />
          </Field>
        )}
        {table ? (
          <Field
            label="Annual growth"
            help="On the income table the income stays the same every year, and the account it draws from grows 8% a year once the income starts."
          >
            <div className="flex h-9 items-center rounded-md border border-border bg-card px-2.5 text-sm text-muted">
              Account grows {tableGrowth}
            </div>
          </Field>
        ) : (
          <Field label="Annual growth">
            <PercentInput
              value={income.growthRate}
              onChange={(growthRate) => updateIncome(income.id, { growthRate })}
            />
          </Field>
        )}
        {table ? null : <Field
          label="Growth starts"
          help="Today: the amount is in today's dollars (like a Social Security statement or today's salary), and the yearly growth compounds from now, so it has grown by the time the income starts. Income start: the amount is what you'll get in its first year, and growth starts after that."
        >
          <GrowthFromToggle
            fromToday={incomeGrowthFrom(income) === "today"}
            startLabel="Income start"
            onChange={(fromToday) =>
              updateIncome(income.id, { growthFrom: fromToday ? "today" : undefined })
            }
          />
        </Field>}
        {payout ? (
          <Field
            label="Survivorship"
            help="On: when the pension's owner passes, it keeps paying the surviving spouse the same amount for the rest of their life. Off (life only): it stops when the owner passes. It needs a spouse on the plan, and shows in the Survivorship analysis."
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={payout === "survivor"}
                aria-label="Survivorship"
                onClick={() =>
                  updateIncome(income.id, {
                    pensionPayout: payout === "survivor" ? "lifeOnly" : "survivor",
                  })
                }
                className={`relative h-[22px] w-[40px] shrink-0 cursor-pointer rounded-full border-0 transition-colors ${
                  payout === "survivor" ? "bg-accent" : "bg-border-2"
                }`}
              >
                <span
                  className={`absolute top-[3px] left-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    payout === "survivor" ? "translate-x-[18px]" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-[13px] text-foreground">
                {payout === "survivor" ? "Pays the spouse for life" : "Life only"}
              </span>
            </div>
            {payout === "survivor" && !hasSpouse ? (
              <p className="mt-1.5 mb-0 text-xs text-muted">
                Add a spouse on the Household step for this to pay anyone.
              </p>
            ) : null}
          </Field>
        ) : null}
        {waitingDays ? (
          <Field
            label="Waiting period"
            help="Days before the first payment, counted from the start of the benefit period. The first year pays only the months left after it (90 days skips 3 months)."
          >
            <Select
              value={String(waitingDays)}
              onChange={(days) =>
                updateIncome(income.id, {
                  disabilityWaitingDays: Number(days) as typeof waitingDays,
                })
              }
              options={WAITING_OPTIONS}
            />
          </Field>
        ) : null}
        {coverage ? (
          <Field
            label="Coverage"
            help="Full disability pays the whole monthly benefit. Partial disability pays half of it."
          >
            <Select
              value={coverage}
              onChange={(disabilityCoverage) =>
                updateIncome(income.id, { disabilityCoverage })
              }
              options={COVERAGE_OPTIONS}
            />
          </Field>
        ) : null}
        {income.kind === "business" ? (
          <Field
            label="From business"
            help="The business that pays this income. Linking shows it on that business's card. It does not reduce the business's value: it is treated as profit the business pays out."
          >
            <Select
              value={income.businessId ?? ""}
              onChange={(businessId) =>
                updateIncome(income.id, { businessId: businessId || undefined })
              }
              options={[
                { value: "", label: "Not linked" },
                ...businesses.map((b) => ({
                  value: b.id,
                  label: b.label || "Business",
                })),
              ]}
            />
          </Field>
        ) : null}
        {sourceKinds ? (
          <Field label="From account">
            <Select
              value={income.drawsFromAccountId ?? ""}
              onChange={(drawsFromAccountId) =>
                updateIncome(income.id, {
                  drawsFromAccountId: drawsFromAccountId || undefined,
                })
              }
              options={[
                { value: "", label: "Select account…" },
                ...sourceAccounts.map((a) => ({
                  value: a.id,
                  label: a.label || "Account",
                })),
              ]}
            />
          </Field>
        ) : null}
        <Field
          label={isDisability ? "Benefit period" : "Active years"}
          hint={
            isDisability
              ? "First and last year the policy pays"
              : "Optional start / end"
          }
        >
          <div className="flex flex-col gap-2 lg:flex-row [&>*]:min-w-0 lg:[&>*]:flex-1">
            <YearSelect
              value={income.startYear}
              from={currentYear - 20}
              to={currentYear + 60}
              allowEmpty
              placeholder="Start"
              onChange={(startYear) => updateIncome(income.id, { startYear })}
            />
            <YearSelect
              value={income.endYear}
              from={currentYear - 20}
              to={currentYear + 60}
              allowEmpty
              placeholder="End"
              onChange={(endYear) => updateIncome(income.id, { endYear })}
            />
          </div>
        </Field>
      </div>
      {table ? (
        <p className="mt-2.5 mb-0 rounded-lg bg-accent-soft px-3 py-2 text-[13px] leading-relaxed text-foreground">
          <strong>Income table:</strong> pays {tableRate} of the account a year
          {table.age != null ? ` (${ownerName} is ${table.age} in ${table.year})` : ` from ${table.year}`}
          {table.monthly != null ? `, about ${formatCurrency(table.monthly)}/mo` : ""}, fixed
          for life. Growth: the account grows {tableGrowth} a year from {table.year}.
        </p>
      ) : null}
    </EntityCard>
  );
}

export function IncomeStep() {
  const household = useHousehold();
  const { addIncome, restoreIncome, discardDeletedIncome } = useScenario();
  const firstOwner = household.people[0]?.id ?? "";
  const refs = useExternalData((s) => s.refs);
  const anyOnTable = household.incomes.some(usesIncomeTable);
  // The table's amount depends on the account's balance when the income
  // starts, so it's read off the no-conversion projection.
  const baselineRows = useMemo(
    () => (anyOnTable ? runScenario(household, [], "No conversion", refs).rows : null),
    [anyOnTable, household, refs],
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const addButtonRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-col gap-3">
      <StepTour
        tourId="income"
        steps={INCOME_TOUR_STEPS}
        targets={{ "add-income": addButtonRef }}
      />
      <div className="flex justify-end gap-2">
        <RestoreDeleted
          items={(household.deletedIncomes ?? []).map((entry) => ({
            id: entry.item.id,
            label: entry.item.label || KIND_LABEL[entry.item.kind] || "Income",
            deletedAt: entry.deletedAt,
          }))}
          onRestore={restoreIncome}
          onDiscard={discardDeletedIncome}
        />
        <div ref={addButtonRef}>
          <AddButton
            label="Add income source"
            onClick={() => {
              const id = uid("inc");
              addIncome({
                id,
                label: "",
                ownerId: firstOwner,
                kind: "pension",
                monthlyAmount: 0,
                growthRate: DEFAULT_INCOME_GROWTH,
                taxability: "full",
              });
              setEditingId(id);
            }}
          />
        </div>
      </div>
      {household.incomes.map((income) => (
        <IncomeFields
          key={income.id}
          income={income}
          editing={editingId === income.id}
          onEdit={() => setEditingId(income.id)}
          onDone={() => setEditingId(null)}
          baselineRows={baselineRows}
        />
      ))}
    </div>
  );
}
