import type { Household, PropertyLoan } from "@/lib/domain/types";
import { DEFAULT_REPAYMENT_YEARS, propertyLoans } from "@/lib/domain/propertyLoans";
import { amortize, levelPayment } from "@/lib/engine/amortization";

/** What the projection pays on one loan, month by month. */
export interface LoanTerms {
  kind: PropertyLoan["kind"];
  /** Balance on the date of the first payment below. */
  balance: number;
  rate: number;
  /** Scheduled monthly principal and interest (mortgage only). */
  monthlyPayment: number;
  /** Extra principal paid every month on top (mortgage only). */
  extraPrincipal: number;
  /** First payment the balance is still owed for, or null when unknown. */
  firstPayment: { month: number; year: number } | null;
  drawEndYear?: number;
  repaymentYears: number;
}

/** The month after `asOfDate` (YYYY-MM-DD): the next payment due. */
function monthAfter(asOfDate?: string): { month: number; year: number } | null {
  const match = asOfDate ? /^(\d{4})-(\d{2})/.exec(asOfDate) : null;
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };
}

/**
 * Each property loan's terms. A mortgage with a Mortgage analysis statement
 * uses the statement (balance, rate, payment, next payment date and extra
 * principal); everything else uses the loan as entered on the property,
 * owed from the month after `asOfDate` (today in the app).
 */
export function loanTerms(household: Household, asOfDate?: string): Record<string, LoanTerms> {
  const statements = new Map(
    (household.mortgages ?? [])
      .filter((m) => m.loanId != null)
      .map((m) => [m.loanId as string, m]),
  );
  const today = monthAfter(asOfDate);
  const out: Record<string, LoanTerms> = {};
  for (const re of household.realEstate) {
    for (const loan of propertyLoans(re)) {
      const repaymentYears = Math.max(1, loan.repaymentYears ?? DEFAULT_REPAYMENT_YEARS);
      const statement = loan.kind === "mortgage" ? statements.get(loan.id) : undefined;
      if (statement) {
        out[loan.id] = {
          kind: loan.kind,
          balance: Math.max(0, statement.principalBalance),
          rate: Math.max(0, statement.interestRate),
          // The payment the Mortgage analysis uses (entered, or worked out
          // from the maturity date).
          monthlyPayment: amortize(statement).monthlyPayment,
          extraPrincipal: Math.max(0, statement.extraPrincipal ?? 0),
          firstPayment: { month: statement.nextPaymentMonth, year: statement.nextPaymentYear },
          repaymentYears,
        };
        continue;
      }
      out[loan.id] = {
        kind: loan.kind,
        balance: Math.max(0, loan.balance ?? 0),
        rate: Math.max(0, loan.rate ?? 0),
        monthlyPayment: Math.max(0, loan.monthlyPayment ?? 0),
        extraPrincipal: 0,
        firstPayment: today,
        drawEndYear: loan.drawEndYear,
        repaymentYears,
      };
    }
  }
  return out;
}

/**
 * Pay a loan down month by month from its first payment through December of
 * `startYear - 1`, the years before the projection runs. A mortgage pays its
 * payment plus extra principal; a line of credit pays interest only through
 * its draw period, then the level payment that clears it over the
 * repayment term (fixed the January repayment starts, and returned so the
 * projection keeps paying it). Nothing to do when the first payment is in or
 * after the start year, or isn't known.
 */
export function balanceAtStart(
  terms: LoanTerms,
  startYear: number,
): { balance: number; lineOfCreditPayment: number | null } {
  let balance = terms.balance;
  let locPayment: number | null = null;
  const first = terms.firstPayment;
  if (!first || !(balance > 0) || first.year >= startYear) {
    return { balance, lineOfCreditPayment: null };
  }
  const r = terms.rate / 12;
  let month = first.month;
  let year = first.year;
  while (year < startYear && balance > 0) {
    const interest = balance * r;
    let payment = terms.monthlyPayment + terms.extraPrincipal;
    if (terms.kind === "lineOfCredit") {
      const drawing = terms.drawEndYear == null || year <= terms.drawEndYear;
      if (drawing) {
        payment = interest;
      } else {
        locPayment ??= levelPayment(balance, terms.rate, terms.repaymentYears * 12);
        payment = locPayment;
      }
    }
    const principal = Math.min(balance, Math.max(0, payment - interest));
    balance -= principal;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return { balance: Math.max(0, balance), lineOfCreditPayment: locPayment };
}
