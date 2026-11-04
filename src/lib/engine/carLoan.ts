import type { CarLoan, Household } from "@/lib/domain/types";
import { carDecisionFor } from "@/lib/engine/carDecision";

/** The month after (month, year), `count` times. */
function addMonths(month: number, year: number, count: number): { month: number; year: number } {
  const index = year * 12 + (month - 1) + count;
  return { month: (index % 12) + 1, year: Math.floor(index / 12) };
}

/**
 * A starting car loan: the Car analysis's finance option (price less the
 * down payment, its rate and term), first payment `next`. The payment is
 * left at 0 so it's worked out from the maturity date.
 */
export function defaultCarLoan(
  household: Household,
  next: { month: number; year: number },
): CarLoan {
  const d = carDecisionFor(household);
  const term = Math.max(1, Math.round(d.loanTermMonths));
  const maturity = addMonths(next.month, next.year, term - 1);
  return {
    label: "Car loan",
    principalBalance: Math.max(0, d.price - d.downPayment),
    interestRate: d.loanRate,
    monthlyPayment: 0,
    nextPaymentMonth: next.month,
    nextPaymentYear: next.year,
    maturityMonth: maturity.month,
    maturityYear: maturity.year,
  };
}

/** The saved car loan, or the default when the plan doesn't have one yet. */
export function carLoanFor(household: Household, next: { month: number; year: number }): CarLoan {
  return household.carLoan ?? defaultCarLoan(household, next);
}
