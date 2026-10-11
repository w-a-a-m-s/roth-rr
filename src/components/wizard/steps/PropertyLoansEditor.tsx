"use client";

import { Field } from "@/components/ui/Field";
import {
  MoneyInput,
  NumberField,
  PercentInput,
  TextInput,
  YearSelect,
} from "@/components/ui/inputs";
import { AddButton } from "@/components/ui/EntityCard";
import { uid } from "@/lib/id";
import {
  DEFAULT_REPAYMENT_YEARS,
  PROPERTY_LOAN_LABELS,
  loanMonthlyPaymentToday,
  propertyLoans,
} from "@/lib/domain/propertyLoans";
import type {
  PropertyLoan,
  PropertyLoanKind,
  RealEstate,
} from "@/lib/domain/types";
import { formatCurrency } from "@/lib/format";

/**
 * The mortgages and lines of credit on one property. Any number of each;
 * saving writes `loans` and clears an older plan's single-mortgage fields.
 */
export function PropertyLoansEditor({
  re,
  onChange,
}: {
  re: RealEstate;
  onChange: (patch: Partial<RealEstate>) => void;
}) {
  const loans = propertyLoans(re);
  const currentYear = new Date().getFullYear();

  const save = (next: PropertyLoan[]) =>
    onChange({
      loans: next,
      mortgageBalance: undefined,
      mortgageRate: undefined,
      mortgageMonthlyPayment: undefined,
    });
  const update = (id: string, patch: Partial<PropertyLoan>) =>
    save(loans.map((loan) => (loan.id === id ? { ...loan, ...patch } : loan)));
  const remove = (id: string) => save(loans.filter((loan) => loan.id !== id));
  const add = (kind: PropertyLoanKind) => {
    const sameKind = loans.filter((loan) => loan.kind === kind).length;
    const label =
      sameKind === 0
        ? PROPERTY_LOAN_LABELS[kind]
        : `${PROPERTY_LOAN_LABELS[kind]} ${sameKind + 1}`;
    save([
      ...loans,
      kind === "mortgage"
        ? { id: uid("loan"), kind, label, balance: 0, rate: 0, monthlyPayment: 0 }
        : { id: uid("loan"), kind, label, balance: 0, rate: 0 },
    ]);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-foreground">
          Mortgages and lines of credit
        </span>
        <div className="flex flex-wrap gap-2">
          <AddButton label="Add mortgage" onClick={() => add("mortgage")} />
          <AddButton
            label="Add line of credit"
            onClick={() => add("lineOfCredit")}
          />
        </div>
      </div>
      {loans.length === 0 && (
        <p className="m-0 text-xs text-muted">
          No loans: this property is owned free and clear.
        </p>
      )}
      {loans.map((loan) => (
        <div
          key={loan.id}
          className="flex flex-col gap-2.5 rounded-[9px] border border-border p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-muted">
              {PROPERTY_LOAN_LABELS[loan.kind]}
            </span>
            <button
              type="button"
              onClick={() => remove(loan.id)}
              className="text-xs font-semibold text-muted underline-offset-2 hover:underline"
            >
              Remove
            </button>
          </div>
          <Field layout="row" label="Label">
            <TextInput
              value={loan.label}
              onChange={(label) => update(loan.id, { label })}
            />
          </Field>
          {loan.kind === "mortgage" ? (
            <MortgageFields loan={loan} update={update} />
          ) : (
            <LineOfCreditFields
              loan={loan}
              update={update}
              currentYear={currentYear}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function MortgageFields({
  loan,
  update,
}: {
  loan: PropertyLoan;
  update: (id: string, patch: Partial<PropertyLoan>) => void;
}) {
  return (
    <>
      <Field
        layout="row"
        label="Balance"
        help="Outstanding loan principal today. Each year the model splits payments into interest (tax-deductible against rent) and principal (which reduces the balance and builds equity)."
      >
        <MoneyInput
          value={loan.balance}
          onChange={(balance) => update(loan.id, { balance })}
        />
      </Field>
      <Field
        layout="row"
        label="Interest rate"
        help="Annual mortgage interest rate. Interest accrues monthly on the remaining balance."
      >
        <PercentInput
          value={loan.rate}
          onChange={(rate) => update(loan.id, { rate })}
        />
      </Field>
      <Field
        layout="row"
        label="Monthly payment"
        help="Total monthly principal + interest payment. The portion above the month's interest pays down principal; payments stop automatically once the loan is paid off."
      >
        <MoneyInput
          value={loan.monthlyPayment ?? 0}
          onChange={(monthlyPayment) => update(loan.id, { monthlyPayment })}
        />
      </Field>
    </>
  );
}

function LineOfCreditFields({
  loan,
  update,
  currentYear,
}: {
  loan: PropertyLoan;
  update: (id: string, patch: Partial<PropertyLoan>) => void;
  currentYear: number;
}) {
  return (
    <>
      <Field
        layout="row"
        label="Amount drawn"
        help="What you owe on the line of credit today."
      >
        <MoneyInput
          value={loan.balance}
          onChange={(balance) => update(loan.id, { balance })}
        />
      </Field>
      <Field
        layout="row"
        label="Credit limit"
        help="The most you can draw. For reference only: the projection doesn't assume further draws."
      >
        <MoneyInput
          value={loan.creditLimit ?? 0}
          onChange={(creditLimit) => update(loan.id, { creditLimit })}
        />
      </Field>
      <Field
        layout="row"
        label="Interest rate"
        help="Annual interest rate on the amount drawn. Interest accrues monthly and is tax-deductible against rent."
      >
        <PercentInput
          value={loan.rate}
          onChange={(rate) => update(loan.id, { rate })}
        />
      </Field>
      <Field
        layout="row"
        label="Draw period ends"
        help="Last year of the draw period. Until then you pay interest only. Leave empty to pay interest only for the whole plan."
      >
        <YearSelect
          value={loan.drawEndYear}
          from={currentYear - 10}
          to={currentYear + 60}
          allowEmpty
          placeholder="Interest only"
          onChange={(drawEndYear) => update(loan.id, { drawEndYear })}
        />
      </Field>
      {loan.drawEndYear != null && (
        <Field
          layout="row"
          label="Repayment years"
          help="Years to pay off the balance once the draw period ends, with a level monthly payment of principal and interest."
        >
          <NumberField
            value={loan.repaymentYears ?? DEFAULT_REPAYMENT_YEARS}
            min={1}
            step={1}
            onChange={(repaymentYears) =>
              update(loan.id, { repaymentYears: Math.max(1, Math.round(repaymentYears)) })
            }
          />
        </Field>
      )}
      <p className="m-0 text-xs text-muted lg:pl-[calc(13.5rem+0.75rem)]">
        Interest-only payment today:{" "}
        {formatCurrency(loanMonthlyPaymentToday(loan))} / month
      </p>
    </>
  );
}
