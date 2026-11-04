import type { LoanStatement } from "@/lib/domain/types";

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
  /** The one-time lump sum, in the month it's paid. */
  lump: number;
  escrow: number;
  endBalance: number;
}

export interface AmortizationYear {
  year: number;
  payments: number;
  interest: number;
  principal: number;
  extra: number;
  lump: number;
  escrow: number;
  endBalance: number;
}

/** Ways to pay the loan down: as scheduled, more every month, a lump sum, or both. */
export type PrepaymentKey = "none" | "extra" | "lump" | "both";

/** One way of paying the loan down, next to paying it as scheduled. */
export interface PrepaymentChoice {
  key: PrepaymentKey;
  /** Payments left until it's paid off. */
  months: number;
  payoff: { month: number; year: number } | null;
  totalInterest: number;
  /** Everything paid from here on: payments, extra and lump sum. */
  totalPaid: number;
  /** Against paying as scheduled (0 for "none"). */
  interestSaved: number;
  monthsSaved: number;
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
  /**
   * Interest the extra principal and lump sum save together, and months
   * they cut, against paying as scheduled.
   */
  extraSavings: { interest: number; months: number } | null;
  /**
   * Paying as scheduled, then each prepayment entered on its own and both
   * together (only the ones that apply). Empty with no prepayment, or when
   * a schedule never pays off.
   */
  choices: PrepaymentChoice[];
  /** Payment number the lump sum lands on, or null without one. */
  lumpPaymentNumber: number | null;
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

function remainingMonths(m: LoanStatement): number | null {
  if (!Number.isFinite(m.maturityMonth) || !Number.isFinite(m.maturityYear)) return null;
  const n = monthsBetween(
    m.nextPaymentMonth,
    m.nextPaymentYear,
    m.maturityMonth as number,
    m.maturityYear as number,
  );
  return n > 0 ? n : null;
}

/** Payment number (1 is the next one) the lump sum goes with. */
function lumpNumber(m: LoanStatement): number {
  if (!Number.isFinite(m.lumpSumMonth) || !Number.isFinite(m.lumpSumYear)) return 1;
  const n = monthsBetween(
    m.nextPaymentMonth,
    m.nextPaymentYear,
    m.lumpSumMonth as number,
    m.lumpSumYear as number,
  );
  return Math.max(1, n);
}

interface Lump {
  amount: number;
  number: number;
}

function schedule(
  m: LoanStatement,
  payment: number,
  extraPerMonth: number,
  lump: Lump | null,
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
    const lumpPaid =
      lump && n === lump.number ? Math.min(cents(balance - principal - extra), lump.amount) : 0;
    const endBalance = cents(balance - principal - extra - lumpPaid);
    rows.push({
      number: n,
      month,
      year,
      startBalance: balance,
      payment: cents(interest + principal),
      interest,
      principal,
      extra,
      lump: lumpPaid,
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
      y = { year: row.year, payments: 0, interest: 0, principal: 0, extra: 0, lump: 0, escrow: 0, endBalance: 0 };
      years.push(y);
    }
    y.payments += row.payment;
    y.interest += row.interest;
    y.principal += row.principal;
    y.extra += row.extra;
    y.lump += row.lump;
    y.escrow += row.escrow;
    y.endBalance = row.endBalance;
  }
  return years.map((y) => ({
    ...y,
    payments: cents(y.payments),
    interest: cents(y.interest),
    principal: cents(y.principal),
    extra: cents(y.extra),
    lump: cents(y.lump),
    escrow: cents(y.escrow),
  }));
}

const sumInterest = (rows: AmortizationRow[]) => cents(rows.reduce((s, r) => s + r.interest, 0));
const sumPaid = (rows: AmortizationRow[]) =>
  cents(rows.reduce((s, r) => s + r.payment + r.extra + r.lump, 0));
const paysOff = (rows: AmortizationRow[]) =>
  rows.length > 0 && rows[rows.length - 1].endBalance <= 0.005;

/** The statement without its lump sum: for analyses that only follow the monthly payments. */
export function withoutLumpSum<T extends LoanStatement>(m: T): T {
  return { ...m, lumpSum: undefined, lumpSumMonth: undefined, lumpSumYear: undefined };
}

/**
 * Month-by-month amortization from a loan statement: each month's interest
 * is the balance times rate / 12 (rounded to the cent), the rest of the
 * payment (plus any extra principal, and the lump sum in its month) pays
 * the balance down. The last payment is trimmed to what's left, and a
 * payment on the maturity date clears the balance (cent rounding leaves a
 * few dollars otherwise).
 */
export function amortize(m: LoanStatement): AmortizationResult {
  const months = remainingMonths(m);
  const entered = Math.max(0, m.monthlyPayment ?? 0);
  const paymentDerived = !(entered > 0) && months != null;
  const payment = paymentDerived
    ? cents(levelPayment(m.principalBalance, m.interestRate, months as number))
    : entered;
  const extra = Math.max(0, m.extraPrincipal ?? 0);
  const lumpAmount = Number.isFinite(m.lumpSum) ? Math.max(0, m.lumpSum as number) : 0;
  const lump = lumpAmount > 0 ? { amount: lumpAmount, number: lumpNumber(m) } : null;
  const rows = schedule(m, payment, extra, lump, months);
  const firstInterest = Math.max(0, m.principalBalance) * (Math.max(0, m.interestRate) / 12);
  const negativeAmortization = m.principalBalance > 0 && payment + extra <= cents(firstInterest);
  const paidOff = paysOff(rows);
  const last = rows[rows.length - 1];

  const prepaying = extra > 0 || lump != null;
  const plain = prepaying ? schedule(m, payment, 0, null, months) : rows;
  const plainPaidOff = paysOff(plain);
  const extraSavings =
    prepaying && paidOff && plainPaidOff
      ? {
          interest: cents(sumInterest(plain) - sumInterest(rows)),
          months: plain.length - rows.length,
        }
      : null;

  const choices: PrepaymentChoice[] = [];
  if (prepaying && plainPaidOff) {
    const variants: [PrepaymentKey, AmortizationRow[]][] = [["none", plain]];
    if (extra > 0 && lump) {
      variants.push(["extra", schedule(m, payment, extra, null, months)]);
      variants.push(["lump", schedule(m, payment, 0, lump, months)]);
      variants.push(["both", rows]);
    } else {
      variants.push([extra > 0 ? "extra" : "lump", rows]);
    }
    for (const [key, r] of variants) {
      if (!paysOff(r)) continue;
      const end = r[r.length - 1];
      choices.push({
        key,
        months: r.length,
        payoff: { month: end.month, year: end.year },
        totalInterest: sumInterest(r),
        totalPaid: sumPaid(r),
        interestSaved: cents(sumInterest(plain) - sumInterest(r)),
        monthsSaved: plain.length - r.length,
      });
    }
  }

  return {
    monthlyPayment: payment,
    paymentDerived,
    rows,
    years: byYear(rows),
    totalInterest: sumInterest(rows),
    payoff: paidOff && last ? { month: last.month, year: last.year } : null,
    maturityGap: months != null && plainPaidOff ? plain.length - months : null,
    extraSavings,
    choices,
    lumpPaymentNumber: lump ? lump.number : null,
    negativeAmortization,
  };
}
