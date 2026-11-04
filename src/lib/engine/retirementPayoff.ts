import type { Account, Household, MortgageStatement, RetirementPayoffSettings } from "@/lib/domain/types";
import { amortize, withoutLumpSum } from "@/lib/engine/amortization";

/** The federal brackets the analysis compares (user's request). */
export const RETIREMENT_PAYOFF_TAX_RATES = [0.12, 0.22, 0.24, 0.32, 0.35] as const;
export const DEFAULT_RETIREMENT_PAYOFF_RETURN = 0.06;
export const DEFAULT_LUMP_SUM_TAX_RATE = 0.32;
export const DEFAULT_MONTHLY_TAX_RATE = 0.22;

/** Tax-deferred accounts the payoff can come from, largest first. */
export function retirementPayoffAccounts(household: Household): Account[] {
  return household.accounts
    .filter((a) => a.kind === "retirementTaxable")
    .sort((a, b) => b.balance - a.balance);
}

/** The saved inputs, with defaults for anything missing or not a number. */
export function retirementPayoffSettingsFor(household: Household): RetirementPayoffSettings {
  const saved = household.retirementPayoff;
  const num = (x: unknown, fallback: number) =>
    typeof x === "number" && Number.isFinite(x) ? x : fallback;
  const rate = (x: unknown, fallback: number) => Math.min(0.99, Math.max(0, num(x, fallback)));
  return {
    mortgageId: typeof saved?.mortgageId === "string" ? saved.mortgageId : undefined,
    accountId: typeof saved?.accountId === "string" ? saved.accountId : undefined,
    accountReturn: num(saved?.accountReturn, DEFAULT_RETIREMENT_PAYOFF_RETURN),
    lumpSumTaxRate: rate(saved?.lumpSumTaxRate, DEFAULT_LUMP_SUM_TAX_RATE),
    monthlyTaxRate: rate(saved?.monthlyTaxRate, DEFAULT_MONTHLY_TAX_RATE),
  };
}

/** Year-end values for both choices. */
export interface RetirementPayoffYear {
  year: number;
  /** Pay off: the account after the lump-sum withdrawal. */
  payoffBalance: number;
  /** Keep: the account after each month's withdrawal for the payment. */
  keepBalance: number;
  keepMortgage: number;
  /** Pay off's account, minus Keep's account less what's still owed. */
  payoffAhead: number;
}

/** One cell of the bracket grid. */
export interface RetirementPayoffCell {
  lumpSumTaxRate: number;
  monthlyTaxRate: number;
  /** Positive when paying it off from the account ends ahead. */
  payoffAhead: number;
}

export interface RetirementPayoffComparison {
  payoffAmount: number;
  monthlyPayment: number;
  months: number;
  payoff: { month: number; year: number } | null;
  interestSaved: number;
  startBalance: number;
  /** Pay off: what comes out of the account today, and the tax on it. */
  lumpSumWithdrawal: number;
  lumpSumTax: number;
  /** Keep: the monthly withdrawal that nets the payment after tax. */
  monthlyWithdrawal: number;
  keepWithdrawals: number;
  keepTax: number;
  payoffEnd: number;
  keepEnd: number;
  /** The account can't cover the lump sum today. */
  lumpSumShort: boolean;
  /** First year the account runs dry while keeping the mortgage, if it does. */
  keepRunsOutYear: number | null;
  /**
   * The lump-sum tax rate at which both end even, with the monthly rate as
   * set. Paying off ahead below it.
   */
  breakevenLumpSumRate: number;
  /** The account return at which both end even when both rates match. */
  breakevenReturn: number;
  years: RetirementPayoffYear[];
  /** Every lump-sum rate against every monthly rate. */
  grid: RetirementPayoffCell[];
}

/**
 * Pay a mortgage off today with a lump sum from a tax-deferred account, or
 * keep it and pay each month from the same account. Each withdrawal is
 * grossed up for its own tax rate: a lump sum usually lands in a higher
 * bracket than monthly draws. The account grows at `accountReturn`
 * (compounded monthly) either way, and the two are compared when the
 * mortgage would be paid off, so neither owes anything then. Escrow is the
 * same either way, there's no interest deduction, and RMDs, the account's
 * other draws and the 10% early penalty are left out.
 */
export function compareRetirementPayoff(
  statement: MortgageStatement,
  startBalance: number,
  settings: RetirementPayoffSettings,
): RetirementPayoffComparison | null {
  if (!(statement.principalBalance > 0)) return null;
  const amort = amortize(withoutLumpSum(statement));
  if (amort.rows.length === 0 || amort.negativeAmortization) return null;

  const tL = settings.lumpSumTaxRate;
  const tM = settings.monthlyTaxRate;
  const growth = Math.pow(1 + settings.accountReturn, 1 / 12) - 1;
  const lumpSumWithdrawal = statement.principalBalance / (1 - tL);

  let payoffBalance = startBalance - lumpSumWithdrawal;
  let keepBalance = startBalance;
  let keepWithdrawals = 0;
  // Payments, and the payoff amount, carried to the end at the account's return.
  let paymentsAtEnd = 0;
  let payoffAtEnd = statement.principalBalance;
  let keepRunsOutYear: number | null = null;
  const years: RetirementPayoffYear[] = [];
  amort.rows.forEach((row, i) => {
    const paid = row.payment + row.extra;
    const draw = paid / (1 - tM);
    payoffBalance *= 1 + growth;
    keepBalance = keepBalance * (1 + growth) - draw;
    keepWithdrawals += draw;
    paymentsAtEnd = paymentsAtEnd * (1 + growth) + paid;
    payoffAtEnd *= 1 + growth;
    if (keepRunsOutYear == null && keepBalance < 0) keepRunsOutYear = row.year;
    const next = amort.rows[i + 1];
    if (next && next.year === row.year) return;
    years.push({
      year: row.year,
      payoffBalance,
      keepBalance,
      keepMortgage: row.endBalance,
      payoffAhead: payoffBalance - (keepBalance - row.endBalance),
    });
  });

  // Pay off ends ahead by paymentsAtEnd / (1 - tM) - payoffAtEnd / (1 - tL).
  const ahead = (lump: number, monthly: number) =>
    paymentsAtEnd / (1 - monthly) - payoffAtEnd / (1 - lump);
  const grid = RETIREMENT_PAYOFF_TAX_RATES.flatMap((lumpSumTaxRate) =>
    RETIREMENT_PAYOFF_TAX_RATES.map((monthlyTaxRate) => ({
      lumpSumTaxRate,
      monthlyTaxRate,
      payoffAhead: ahead(lumpSumTaxRate, monthlyTaxRate),
    })),
  );
  const monthlyPayment = amort.monthlyPayment + (statement.extraPrincipal ?? 0);

  return {
    payoffAmount: statement.principalBalance,
    monthlyPayment,
    months: amort.rows.length,
    payoff: amort.payoff,
    interestSaved: amort.totalInterest,
    startBalance,
    lumpSumWithdrawal,
    lumpSumTax: lumpSumWithdrawal - statement.principalBalance,
    monthlyWithdrawal: monthlyPayment / (1 - tM),
    keepWithdrawals,
    keepTax: keepWithdrawals * tM,
    payoffEnd: payoffBalance,
    keepEnd: keepBalance,
    lumpSumShort: lumpSumWithdrawal > startBalance,
    keepRunsOutYear,
    breakevenLumpSumRate: 1 - (payoffAtEnd * (1 - tM)) / paymentsAtEnd,
    breakevenReturn: Math.pow(1 + statement.interestRate / 12, 12) - 1,
    years,
    grid,
  };
}
