"use client";

import { useRef, useState } from "react";
import { useHousehold, useScenario } from "@/store/useScenario";
import { Field } from "@/components/ui/Field";
import {
  ComboInput,
  MoneyInput,
  PercentInput,
  Select,
  YearSelect,
} from "@/components/ui/inputs";
import { AddButton, EntityCard, ReadStat } from "@/components/ui/EntityCard";
import { RestoreDeleted } from "@/components/ui/RestoreDeleted";
import { StepTour } from "@/components/onboarding/StepTour";
import type { Expense, ExpenseFrequency } from "@/lib/domain/types";
import {
  expenseMonthlyForYear,
  expenseYearsLabel,
} from "@/lib/domain/household";
import { DEFAULT_EXPENSE_GROWTH, EXPENSE_SUGGESTIONS } from "@/lib/config/defaults";
import { projectionStartYear } from "@/lib/engine/project";
import { formatCurrency, formatPercent } from "@/lib/format";
import { uid } from "@/lib/id";
import { EXPENSES_TOUR_STEPS } from "@/lib/onboarding/expensesTour";

const FREQUENCY_OPTIONS: { value: ExpenseFrequency; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

/** First-year monthly equivalent of an expense. */
function monthlyEquivalent(e: Expense): number {
  return e.frequency === "yearly" ? e.amount / 12 : e.amount;
}

function ExpenseFields({
  expense,
  editing,
  onEdit,
  onDone,
}: {
  expense: Expense;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
}) {
  const { updateExpense, removeExpense } = useScenario();
  const currentYear = new Date().getFullYear();
  const freqLabel =
    FREQUENCY_OPTIONS.find((o) => o.value === expense.frequency)?.label ??
    expense.frequency;
  const years = expenseYearsLabel(expense);

  return (
    <EntityCard
      title={expense.label || "Expense"}
      editing={editing}
      onEdit={onEdit}
      onDone={onDone}
      onRemove={() => {
        removeExpense(expense.id);
        onDone();
      }}
      summary={
        <>
          <ReadStat
            label="Amount"
            value={`${formatCurrency(expense.amount)}/${expense.frequency === "yearly" ? "yr" : "mo"}`}
          />
          <ReadStat label="Frequency" value={freqLabel} />
          <ReadStat label="Growth" value={formatPercent(expense.growthRate)} />
          {years ? <ReadStat label="Active years" value={years} /> : null}
        </>
      }
    >
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-6 [&>*]:min-w-0">
        <Field label="Name" hint="Type anything; suggestions are optional">
          <ComboInput
            value={expense.label}
            onChange={(label) => updateExpense(expense.id, { label })}
            options={EXPENSE_SUGGESTIONS}
            placeholder="e.g. Groceries"
          />
        </Field>
        <Field label="Amount">
          <MoneyInput
            value={expense.amount}
            onChange={(amount) => updateExpense(expense.id, { amount })}
          />
        </Field>
        <Field label="Frequency">
          <Select
            value={expense.frequency}
            onChange={(frequency) => updateExpense(expense.id, { frequency })}
            options={FREQUENCY_OPTIONS}
          />
        </Field>
        <Field label="Annual growth">
          <PercentInput
            value={expense.growthRate}
            onChange={(growthRate) =>
              updateExpense(expense.id, { growthRate })
            }
          />
        </Field>
        <Field
          label="Active years"
          hint="Optional start / end"
          className="lg:col-span-2"
        >
          <div className="flex flex-col gap-2 lg:flex-row [&>*]:min-w-0 lg:[&>*]:flex-1">
            <YearSelect
              value={expense.startYear}
              from={currentYear - 20}
              to={currentYear + 60}
              allowEmpty
              placeholder="Start"
              onChange={(startYear) => updateExpense(expense.id, { startYear })}
            />
            <YearSelect
              value={expense.endYear}
              from={currentYear - 20}
              to={currentYear + 60}
              allowEmpty
              placeholder="End"
              onChange={(endYear) => updateExpense(expense.id, { endYear })}
            />
          </div>
        </Field>
      </div>
    </EntityCard>
  );
}

export function ExpensesStep() {
  const household = useHousehold();
  const { addExpense, restoreExpense, discardDeletedExpense } = useScenario();
  const [editingId, setEditingId] = useState<string | null>(null);
  const addButtonRef = useRef<HTMLDivElement>(null);

  const start = projectionStartYear(household);
  const totalMonthly = household.expenses.reduce((sum, e) => {
    if (!Number.isFinite(start)) return sum + monthlyEquivalent(e);
    return sum + expenseMonthlyForYear(e, start, start);
  }, 0);

  return (
    <div className="flex flex-col gap-3">
      <StepTour
        tourId="expenses"
        steps={EXPENSES_TOUR_STEPS}
        targets={{ "add-expense": addButtonRef }}
      />
      <div className="flex justify-end gap-2">
        <RestoreDeleted
          items={(household.deletedExpenses ?? []).map((entry) => ({
            id: entry.item.id,
            label: entry.item.label || "Expense",
            deletedAt: entry.deletedAt,
          }))}
          onRestore={restoreExpense}
          onDiscard={discardDeletedExpense}
        />
        <div ref={addButtonRef}>
          <AddButton
            label="Add expense"
            onClick={() => {
              const id = uid("exp");
              addExpense({
                id,
                label: "",
                amount: 0,
                frequency: "monthly",
                growthRate: DEFAULT_EXPENSE_GROWTH,
              });
              setEditingId(id);
            }}
          />
        </div>
      </div>
      {household.expenses.map((expense) => (
        <ExpenseFields
          key={expense.id}
          expense={expense}
          editing={editingId === expense.id}
          onEdit={() => setEditingId(expense.id)}
          onDone={() => setEditingId(null)}
        />
      ))}
      {household.expenses.length > 0 ? (
        <div className="flex items-baseline justify-between border-t border-border pt-2 text-sm">
          <span className="text-muted-2">Total (year 1)</span>
          <span className="font-semibold text-foreground tabular-nums">
            {formatCurrency(totalMonthly)}/mo &middot;{" "}
            {formatCurrency(totalMonthly * 12)}/yr
          </span>
        </div>
      ) : null}
    </div>
  );
}
