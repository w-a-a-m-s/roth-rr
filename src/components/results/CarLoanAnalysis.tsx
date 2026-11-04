"use client";

import { useMemo } from "react";
import type { CarLoan, Household } from "@/lib/domain/types";
import { useScenario } from "@/store/useScenario";
import { usePlanAccess } from "@/components/plan/usePlanAccess";
import { Field } from "@/components/ui/Field";
import { MoneyInput, RateInput, TextInput } from "@/components/ui/inputs";
import {
  Group,
  MonthYear,
  PrepaymentFields,
  ScheduleTable,
  Summary,
  nextMonth,
} from "@/components/results/MortgageAnalysis";
import { amortize } from "@/lib/engine/amortization";
import { carLoanFor } from "@/lib/engine/carLoan";
import { formatCurrency } from "@/lib/format";

/**
 * Car loan analysis: one car loan from its statement, paid down with more
 * every month, a lump sum, or both. Doesn't change the projection.
 */
export function CarLoanAnalysis({ household }: { household: Household }) {
  const { setCarLoan } = useScenario();
  const { readOnly } = usePlanAccess();
  const loan = useMemo(() => carLoanFor(household, nextMonth()), [household]);
  const result = useMemo(() => amortize(loan), [loan]);
  const update = (patch: Partial<CarLoan>) => {
    if (readOnly) return;
    setCarLoan({ ...loan, ...patch });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-white px-5 py-4">
        <p className="m-0 max-w-[680px] text-[13px] leading-relaxed text-muted">
          Enter what&apos;s on your car loan statement to see every payment until it&apos;s paid
          off. Then try paying it down faster: put more toward it every month, pay a lump sum
          once, or both, and see the interest and time each one saves. Until you fill it in, it
          starts from the Car analysis&apos;s finance option. This doesn&apos;t change the
          plan&apos;s projection.
        </p>
      </div>

      <div className="grid gap-4 rounded-2xl border border-border bg-white px-5 py-4 lg:grid-cols-2">
        <Group title="From your statement">
          <Field layout="row" label="Label">
            <TextInput value={loan.label} onChange={(label) => update({ label })} />
          </Field>
          <Field
            layout="row"
            label="Loan balance"
            help="The unpaid principal on the statement, right before the next payment. Not the payoff amount, which adds interest owed."
          >
            <MoneyInput value={loan.principalBalance} onChange={(principalBalance) => update({ principalBalance })} />
          </Field>
          <Field layout="row" label="Interest rate" help="The yearly rate (APR) on the loan.">
            <RateInput value={loan.interestRate} onChange={(interestRate) => update({ interestRate })} />
          </Field>
          <Field
            layout="row"
            label="Monthly payment"
            help="Leave it at 0 to work it out from the balance, rate and last payment date."
            hint={
              result.paymentDerived
                ? `Worked out from the last payment date: ${formatCurrency(result.monthlyPayment, true)}`
                : undefined
            }
          >
            <MoneyInput
              step={25}
              decimals={2}
              value={loan.monthlyPayment}
              onChange={(monthlyPayment) => update({ monthlyPayment })}
            />
          </Field>
          <Field layout="row" label="Next payment due" help="Row 1 of the table.">
            <MonthYear
              month={loan.nextPaymentMonth}
              year={loan.nextPaymentYear}
              onChange={(nextPaymentMonth, nextPaymentYear) =>
                update({ nextPaymentMonth, nextPaymentYear: nextPaymentYear ?? loan.nextPaymentYear })
              }
            />
          </Field>
          <Field
            layout="row"
            label="Last payment"
            help="The last scheduled payment on the loan. Used to check the table and to work out a missing payment."
          >
            <MonthYear
              month={loan.maturityMonth}
              year={loan.maturityYear}
              allowEmpty
              onChange={(maturityMonth, maturityYear) =>
                update(
                  maturityYear == null
                    ? { maturityMonth: undefined, maturityYear: undefined }
                    : { maturityMonth, maturityYear },
                )
              }
            />
          </Field>
        </Group>
        <Group title="Pay it down faster">
          <PrepaymentFields loan={loan} update={update} />
        </Group>
      </div>

      <Summary loan={loan} result={result} />
      <ScheduleTable result={result} />
    </div>
  );
}
