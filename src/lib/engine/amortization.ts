import type { MortgageStatement } from "@/lib/domain/types";

/** One monthly payment in an amortization table. */
export interface AmortizationRow {
  /** 1 is the next payment due on the statement. */
  number: number;
  month: number;
  year: number;
  /** Balance before this payment. */
  startBalance: number;
  /** Scheduled principal and interest (the last payment is trimmed). */
  payment: number;
  interest: number;
  principal: number;
  /** Extra principal paid on top. */
  extra: number;
  escrow: number;
  endBalance: number;
}

export interface AmortizationYear {
  year: number;
  payments: number;
  interest: number;
  principal: number;
  extra: number;
  escrow: number;
  endBalance: number;
}

export interface AmortizationResult {
  /** Monthly principal and interest used (entered, or worked out). */
  monthlyPayment: number;
  /** True when the payment was worked out from the maturity date. */
  paymentDerived: boolean;
  rows: AmortizationRow[];
  years: AmortizationYear[];
  totalInterest: number;
  /** Month and year of the final payment, or null when it never pays off. */
  payoff: { month: number; year: number } | null;
  /**
   * Months the payoff lands after (+) or before (-) the statement's maturity
   * date, without extra principal. Null when there's no maturity to check.
   */
  maturityGap: number | null;
  /** Interest the extra principal saves, and months it cuts. */
  extraSavings: { interest: number; months: number } | null;
  /** The payment doesn't cover the first month's interest. */
  negativeAmortization: boolean;
}

/** Stop runaway schedules (a payment that never pays the loan off). */
const MAX_MONTHS = 600;

/** Months from (month, year) to (month2, year2), inclusive of both ends. */
export function monthsBetween(
  month: number,
  year: number,
  month2: number,
  year2: number,
): number {
  return (year2 - year) * 12 + (month2 - month) + 1;
}

/** Standard monthly payment that pays `balance` off in `months` at `annualRate`. */
export function levelPayment(balance: number, annualRate: number, months: number): number {
  if (!(balance > 0) || !(months > 0)) return 0;
  const r = annualRate / 12;
  if (r <= 0) return balance / months;
  return (balance * r) / (1 - Math.pow(1 + r, -months));
}

const cents = (x: number) => Math.round(x * 100) / 100;

function remainingMonths(m: MortgageStatement): number | null {
  if (!Number.isFinite(m.maturityMonth) || !Number.isFinite(m.maturityYear)) return null;
  const n = monthsBetween(
    m.nextPaymentMonth,
    m.nextPaymentYear,
    m.maturityMonth as number,
    m.maturityYear as number,
  );
  return n > 0 ? n : null;
}

function schedule(
  m: MortgageStatement,
  payment: number,
  extraPerMonth: number,
  finalPayment: number | null,
): AmortizationRow[] {
  const rows: AmortizationRow[] = [];
  const r = Math.max(0, m.interestRate) / 12;
  const escrow = Math.max(0, m.monthlyEscrow ?? 0);
  let balance = Math.max(0, m.principalBalance);
  let month = m.nextPaymentMonth;
  let year = m.nextPaymentYear;
  for (let n = 1; balance > 0.005 && n <= MAX_MONTHS; n++) {
    const interest = cents(balance * r);
    // A payment that doesn't cover interest never pays down the loan.
    if (payment + extraPerMonth <= interest) break;
    // The scheduled last payment clears whatever cent rounding left over,
    // the way a lender adjusts the final payment.
    const principal =
      n === finalPayment ? balance : Math.min(balance, cents(payment - interest));
    const extra = Math.min(balance - principal, extraPerMonth);
    const endBalance = cents(balance - principal - extra);
    rows.push({
      number: n,
      month,
      year,
      startBalance: balance,
      payment: cents(interest + principal),
      interest,
      principal,
      extra,
      escrow,
      endBalance,
    });
    balance = endBalance;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return rows;
}

function byYear(rows: AmortizationRow[]): AmortizationYear[] {
  const years: AmortizationYear[] = [];
  for (const row of rows) {
    let y = years[years.length - 1];
    if (!y || y.year !== row.year) {
      y = { year: row.year, payments: 0, interest: 0, principal: 0, extra: 0, escrow: 0, endBalance: 0 };
      years.push(y);
    }
    y.payments += row.payment;
    y.interest += row.interest;
    y.principal += row.principal;
    y.extra += row.extra;
    y.escrow += row.escrow;
    y.endBalance = row.endBalance;
  }
  return years.map((y) => ({
    ...y,
    payments: cents(y.payments),
    interest: cents(y.interest),
    principal: cents(y.principal),
    extra: cents(y.extra),
    escrow: cents(y.escrow),
  }));
}

const sumInterest = (rows: AmortizationRow[]) => cents(rows.reduce((s, r) => s + r.interest, 0));

/**
 * Month-by-month amortization from a mortgage statement: each month's
 * interest is the balance times rate / 12 (rounded to the cent), the rest of
 * the payment (plus any extra principal) pays the balance down. The last
 * payment is trimmed to what's left, and a payment on the maturity date
 * clears the balance (cent rounding leaves a few dollars otherwise).
 */
export function amortize(m: MortgageStatement): AmortizationResult {
  const months = remainingMonths(m);
  const entered = Math.max(0, m.monthlyPayment ?? 0);
  const paymentDerived = !(entered > 0) && months != null;
  const payment = paymentDerived
    ? cents(levelPayment(m.principalBalance, m.interestRate, months as number))
    : entered;
  const extra = Math.max(0, m.extraPrincipal ?? 0);
  const rows = schedule(m, payment, extra, months);
  const firstInterest = Math.max(0, m.principalBalance) * (Math.max(0, m.interestRate) / 12);
  const negativeAmortization = m.principalBalance > 0 && payment + extra <= cents(firstInterest);
  const paidOff = rows.length > 0 && rows[rows.length - 1].endBalance <= 0.005;
  const last = rows[rows.length - 1];

  const plain = extra > 0 ? schedule(m, payment, 0, months) : rows;
  const plainPaidOff = plain.length > 0 && plain[plain.length - 1].endBalance <= 0.005;
  const extraSavings =
    extra > 0 && paidOff && plainPaidOff
      ? {
          interest: cents(sumInterest(plain) - sumInterest(rows)),
          months: plain.length - rows.length,
        }
      : null;

  return {
    monthlyPayment: payment,
    paymentDerived,
    rows,
    years: byYear(rows),
    totalInterest: sumInterest(rows),
    payoff: paidOff && last ? { month: last.month, year: last.year } : null,
    maturityGap: months != null && plainPaidOff ? plain.length - months : null,
    extraSavings,
    negativeAmortization,
  };
}
