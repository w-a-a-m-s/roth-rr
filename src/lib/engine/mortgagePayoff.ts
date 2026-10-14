import type { Household, MortgagePayoffSettings, MortgageStatement } from "@/lib/domain/types";
import { amortize } from "@/lib/engine/amortization";

export const DEFAULT_PAYOFF_RETURN = 0.06;
export const DEFAULT_PAYOFF_TAX_RATE = 0.15;

/** The saved inputs, with defaults for anything missing or not a number. */
export function mortgagePayoffSettingsFor(household: Household): MortgagePayoffSettings {
  const saved = household.mortgagePayoff;
  const num = (x: unknown, fallback: number) =>
    typeof x === "number" && Number.isFinite(x) ? x : fallback;
  return {
    mortgageId: typeof saved?.mortgageId === "string" ? saved.mortgageId : undefined,
    investmentReturn: num(saved?.investmentReturn, DEFAULT_PAYOFF_RETURN),
    taxRate: Math.min(1, Math.max(0, num(saved?.taxRate, DEFAULT_PAYOFF_TAX_RATE))),
  };
}

/** Year-end values for both choices. */
export interface PayoffYear {
  year: number;
  /** Pay off: the payments you no longer make, invested each month. */
  payoffInvested: number;
  /** Keep: the payoff money invested, while you keep paying the mortgage. */
  keepInvested: number;
  keepMortgage: number;
  /** Keep's investments less what's still owed, minus Pay off's investments. */
  keepAhead: number;
}

export interface PayoffComparison {
  /** What paying it off takes today: the statement's principal balance. */
  payoffAmount: number;
  /** Principal and interest (and any extra principal) each month. */
  monthlyPayment: number;
  months: number;
  /** When the mortgage would be paid off if you keep it. */
  payoff: { month: number; year: number } | null;
  /** Interest you skip by paying it off today. */
  interestSaved: number;
  /** The yearly return after the tax on growth. */
  afterTaxReturn: number;
  /**
   * The yearly return (before the tax on growth) at which both choices end
   * even: the mortgage rate compounded monthly, grossed up for the tax.
   */
  breakevenReturn: number;
  payoffEnd: number;
  keepEnd: number;
  years: PayoffYear[];
}

/**
 * Pay off a mortgage today or keep it and invest the money. Both choices
 * spend the same each month: paying it off frees the mortgage payment, which
 * gets invested; keeping it invests the payoff money and pays the mortgage
 * from the same budget. They're compared when the mortgage would have been
 * paid off. Growth is taxed each year at `taxRate`. Escrow (taxes and
 * insurance) is the same either way, so it's left out, and there's no
 * mortgage interest deduction (the plan doesn't itemize).
 */
export function compareMortgagePayoff(
  statement: MortgageStatement,
  settings: MortgagePayoffSettings,
): PayoffComparison | null {
  if (!(statement.principalBalance > 0)) return null;
  const amort = amortize(statement);
  if (amort.rows.length === 0 || amort.negativeAmortization) return null;

  const afterTaxReturn = settings.investmentReturn * (1 - settings.taxRate);
  const monthlyGrowth = Math.pow(1 + afterTaxReturn, 1 / 12) - 1;
  const effectiveLoanRate = Math.pow(1 + statement.interestRate / 12, 12) - 1;
  const breakevenReturn =
    settings.taxRate < 1 ? effectiveLoanRate / (1 - settings.taxRate) : Infinity;

  let payoffInvested = 0;
  let keepInvested = statement.principalBalance;
  const years: PayoffYear[] = [];
  amort.rows.forEach((row, i) => {
    const paid = row.payment + row.extra;
    payoffInvested = payoffInvested * (1 + monthlyGrowth) + paid;
    keepInvested = keepInvested * (1 + monthlyGrowth);
    const next = amort.rows[i + 1];
    if (next && next.year === row.year) return;
    years.push({
      year: row.year,
      payoffInvested,
      keepInvested,
      keepMortgage: row.endBalance,
      keepAhead: keepInvested - row.endBalance - payoffInvested,
    });
  });

  return {
    payoffAmount: statement.principalBalance,
    monthlyPayment: amort.monthlyPayment + (statement.extraPrincipal ?? 0),
    months: amort.rows.length,
    payoff: amort.payoff,
    interestSaved: amort.totalInterest,
    afterTaxReturn,
    breakevenReturn,
    payoffEnd: payoffInvested,
    keepEnd: keepInvested - (amort.rows[amort.rows.length - 1]?.endBalance ?? 0),
    years,
  };
}
