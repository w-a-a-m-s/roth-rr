"use client";

import { useRef, useState } from "react";
import { useHousehold, useScenario } from "@/store/useScenario";
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
  IncomeKind,
  IncomeSource,
  PensionPayout,
  Taxability,
} from "@/lib/domain/types";
import {
  DISABILITY_COVERAGE_LABELS,
  DISABILITY_WAITING_DAYS,
  WITHDRAWAL_SOURCE_KINDS,
  disabilityCoverage,
  disabilityWaitingDays,
  isPensionIncome,
  isWithdrawalIncome,
  pensionPayout,
} from "@/lib/domain/household";
import { SOCIAL_SECURITY_TAXABLE_PCT } from "@/lib/config/federalTax";
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

const TAXABILITY_OPTIONS: { value: Taxability; label: string }[] = [
  { value: "full", label: "Fully taxable" },
  { value: "taxFree", label: "Tax free" },
];

const PAYOUT_OPTIONS: { value: PensionPayout; label: string }[] = [
  { value: "lifeOnly", label: "Life only" },
  { value: "survivor", label: "Survivorship" },
];

const PAYOUT_LABEL: Record<PensionPayout, string> = {
  lifeOnly: "Life only",
  survivor: "Survivorship",
};

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
    return `${Math.round(SOCIAL_SECURITY_TAXABLE_PCT * 100)}% taxable`;
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

function IncomeFields({
  income,
  editing,
  onEdit,
  onDone,
}: {
  income: IncomeSource;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
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
  const waitingDays = disabilityWaitingDays(income);
  const coverage = disabilityCoverage(income);
  const isDisability = income.kind === "disabilityInsurance";

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
    // Only business income links to a business.
    if (kind !== "business" && income.businessId) patch.businessId = undefined;
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
            value={formatCurrency(income.monthlyAmount)}
          />
          <ReadStat label="Taxability" value={taxabilityLabel(income)} />
          <ReadStat
            label="Annual growth"
            value={formatPercent(income.growthRate)}
          />
          <ReadStat
            label={isDisability ? "Benefit period" : "Active years"}
            value={activeYearsLabel(income)}
          />
          {payout ? (
            <ReadStat label="Payout" value={PAYOUT_LABEL[payout]} />
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
        <Field
          label={isDisability ? "Monthly benefit" : "Monthly amount"}
          help={
            isDisability
              ? "The policy's full monthly benefit. Partial disability pays half of it."
              : undefined
          }
        >
          <MoneyInput
            value={income.monthlyAmount}
            onChange={(monthlyAmount) =>
              updateIncome(income.id, { monthlyAmount })
            }
          />
        </Field>
        {income.kind === "socialSecurity" ? (
          <Field
            label="Taxability"
            help="Social Security is always taxed at a fixed 85% of benefits, so it can't be changed here."
          >
            <div className="flex h-9 items-center rounded-md border border-border bg-card px-2.5 text-sm text-muted">
              {Math.round(SOCIAL_SECURITY_TAXABLE_PCT * 100)}% taxable (Social
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
        <Field label="Annual growth">
          <PercentInput
            value={income.growthRate}
            onChange={(growthRate) => updateIncome(income.id, { growthRate })}
          />
        </Field>
        {payout ? (
          <Field
            label="Payout"
            help="Life only stops when the pension's owner passes. Survivorship keeps paying the surviving spouse for the rest of their life."
          >
            <Select
              value={payout}
              onChange={(pensionPayout) =>
                updateIncome(income.id, { pensionPayout })
              }
              options={PAYOUT_OPTIONS}
            />
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
            help="Link this income to a business on the Real estate & business step, so its card shows and edits it."
          >
            <Select
              value={income.businessId ?? ""}
              onChange={(businessId) =>
                updateIncome(income.id, { businessId: businessId || undefined })
              }
              options={[
                { value: "", label: "Not linked" },
                ...(household.businesses ?? []).map((b) => ({
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
    </EntityCard>
  );
}

export function IncomeStep() {
  const household = useHousehold();
  const { addIncome, restoreIncome, discardDeletedIncome } = useScenario();
  const firstOwner = household.people[0]?.id ?? "";
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
        />
      ))}
    </div>
  );
}
