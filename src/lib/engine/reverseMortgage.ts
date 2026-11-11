import type {
  Household,
  RealEstate,
  ReverseMortgagePayout,
  ReverseMortgageSettings,
} from "@/lib/domain/types";
import { propertyLoans } from "@/lib/domain/propertyLoans";
import { levelPayment } from "@/lib/engine/amortization";
import { balanceAtStart, loanTerms, type LoanTerms } from "@/lib/engine/loanPaydown";

/**
 * Reverse mortgage analysis: take a HECM (FHA's Home Equity Conversion
 * Mortgage) on the home and invest the cash, or don't. Not a projection: it
 * doesn't change the plan.
 */

/** Youngest borrower age for a HECM. */
export const HECM_MIN_AGE = 62;
/** FHA's 2026 HECM lending limit (the most a home's value counts for). */
export const HECM_LENDING_LIMIT = 1_249_125;
export const HECM_LENDING_LIMIT_YEAR = 2026;
/** FHA mortgage insurance: 2% of the max claim at closing, 0.5% a year on the balance. */
export const HECM_UPFRONT_MIP = 0.02;
export const HECM_ANNUAL_MIP = 0.005;
/** HUD's floor on the expected rate. */
export const HECM_EXPECTED_RATE_FLOOR = 0.03;
/** At closing you can draw 60% of the principal limit, or more to pay off what's required. */
export const HECM_FIRST_YEAR_SHARE = 0.6;
export const HECM_FIRST_YEAR_EXTRA = 0.1;

export const DEFAULT_REVERSE_RATE = 0.065;
export const DEFAULT_REVERSE_CLOSING_COSTS = 3_000;
export const DEFAULT_REVERSE_RETURN = 0.06;
export const DEFAULT_REVERSE_TAX_RATE = 0.15;

export const REVERSE_PAYOUT_LABELS: Record<ReverseMortgagePayout, string> = {
  lumpSum: "Lump sum at closing (fixed rate)",
  fullDraw: "Lump sum, then the rest a year later (adjustable rate)",
};

/** HUD's origination fee cap: 2% of the first $200k of the max claim, 1% above, $2,500 to $6,000. */
export function hecmOriginationFee(maxClaim: number): number {
  const fee = 0.02 * Math.min(maxClaim, 200_000) + 0.01 * Math.max(0, maxClaim - 200_000);
  return Math.min(6_000, Math.max(2_500, fee));
}

/** Rough period life expectancy (men and women together) by age. */
const LIFE_EXPECTANCY: [number, number][] = [
  [40, 39.6], [45, 35.1], [50, 30.8], [55, 26.7], [60, 22.8], [62, 21.3], [65, 19.1],
  [70, 15.4], [75, 11.9], [80, 8.9], [85, 6.3], [90, 4.3], [95, 2.9], [100, 2.1],
];

function lifeExpectancy(age: number): number {
  const first = LIFE_EXPECTANCY[0];
  if (age <= first[0]) return first[1] + (first[0] - age);
  for (let i = 1; i < LIFE_EXPECTANCY.length; i++) {
    const [a1, e1] = LIFE_EXPECTANCY[i];
    if (age > a1) continue;
    const [a0, e0] = LIFE_EXPECTANCY[i - 1];
    return e0 + ((age - a0) / (a1 - a0)) * (e1 - e0);
  }
  return LIFE_EXPECTANCY[LIFE_EXPECTANCY.length - 1][1];
}

/**
 * An estimate of HUD's principal limit factor for the youngest borrower's
 * (or eligible spouse's) age and the expected rate. HUD sizes the loan so
 * the balance, growing at the expected rate plus MIP, stays inside a home
 * growing about 4% a year over the borrower's life expectancy. This tracks
 * HUD's table within a few points; a lender's quote is exact.
 */
export function estimatePrincipalLimitFactor(age: number, expectedRate: number): number {
  const rate = Math.max(HECM_EXPECTED_RATE_FLOOR, expectedRate);
  const years = lifeExpectancy(age);
  const factor = 0.7 * Math.pow(1.04 / (1 + rate + HECM_ANNUAL_MIP), years);
  return Math.min(0.75, Math.max(0, factor));
}

/** The home to borrow against: a homestead first, then any property. */
export function reverseMortgageProperties(household: Household): RealEstate[] {
  const props = household.realEstate.filter((re) => re.marketValue > 0);
  return [
    ...props.filter((re) => re.use === "homestead"),
    ...props.filter((re) => re.use !== "homestead"),
  ];
}

function birthYears(household: Household): number[] {
  return household.people
    .map((p) => p.birthYear)
    .filter((y): y is number => typeof y === "number" && Number.isFinite(y));
}

/** The youngest person's birth year, or null with none entered. */
export function youngestBirthYear(household: Household): number | null {
  const births = birthYears(household);
  return births.length > 0 ? Math.max(...births) : null;
}

/** The year the youngest person turns 62 (never before `thisYear`). */
export function defaultReverseStartYear(household: Household, thisYear: number): number {
  const births = birthYears(household);
  if (births.length === 0) return thisYear;
  return Math.max(thisYear, Math.max(...births) + HECM_MIN_AGE);
}

/** The first year a HECM can close: the oldest is 62 (a younger spouse can be non-borrowing). */
export function earliestReverseStartYear(household: Household, thisYear: number): number {
  const births = birthYears(household);
  if (births.length === 0) return thisYear;
  return Math.max(thisYear, Math.min(...births) + HECM_MIN_AGE);
}

/** The saved inputs, with defaults for anything missing or not a number. */
export function reverseMortgageSettingsFor(
  household: Household,
  thisYear: number,
): ReverseMortgageSettings & { startYear: number } {
  const saved = household.reverseMortgage;
  const num = (x: unknown, fallback: number) =>
    typeof x === "number" && Number.isFinite(x) ? x : fallback;
  const earliest = earliestReverseStartYear(household, thisYear);
  const startYear = Math.max(
    earliest,
    Math.round(num(saved?.startYear, defaultReverseStartYear(household, thisYear))),
  );
  const plf = saved?.principalLimitFactor;
  return {
    propertyId: typeof saved?.propertyId === "string" ? saved.propertyId : undefined,
    startYear,
    payout: saved?.payout === "fullDraw" ? "fullDraw" : "lumpSum",
    noteRate: Math.max(0, num(saved?.noteRate, DEFAULT_REVERSE_RATE)),
    expectedRate: Math.max(0, num(saved?.expectedRate, DEFAULT_REVERSE_RATE)),
    principalLimitFactor:
      typeof plf === "number" && Number.isFinite(plf) ? Math.min(1, Math.max(0, plf)) : undefined,
    lendingLimit: Math.max(0, num(saved?.lendingLimit, HECM_LENDING_LIMIT)),
    otherClosingCosts: Math.max(0, num(saved?.otherClosingCosts, DEFAULT_REVERSE_CLOSING_COSTS)),
    investmentReturn: num(saved?.investmentReturn, DEFAULT_REVERSE_RETURN),
    taxRate: Math.min(1, Math.max(0, num(saved?.taxRate, DEFAULT_REVERSE_TAX_RATE))),
  };
}

/** One year, at year end. */
export interface ReverseMortgageYear {
  year: number;
  /** The youngest person's age that year. */
  age: number;
  homeValue: number;
  /** No reverse mortgage: what's still owed on the home's loans. */
  keepLoans: number;
  /** No reverse mortgage: the loan payments made this year. */
  keepPayments: number;
  /** No reverse mortgage: home value less the loans. */
  keepNetWorth: number;
  /** Reverse mortgage: the loan balance (interest and MIP added, never paid). */
  reverseBalance: number;
  /** Reverse mortgage: interest and MIP added this year. */
  reverseInterest: number;
  /** Reverse mortgage: cash drawn and invested this year. */
  drawn: number;
  /** Reverse mortgage: the old loan payments, now invested, this year. */
  paymentsInvested: number;
  /** Reverse mortgage: the investments at year end. */
  invested: number;
  /** Reverse mortgage: home value less the loan, never below 0 (non-recourse). */
  reverseEquity: number;
  reverseNetWorth: number;
  /** Reverse mortgage less no reverse mortgage. */
  reverseAhead: number;
}

export interface ReverseMortgageResult {
  inputs: ReverseMortgageSettings & { startYear: number };
  property: { id: string; label: string };
  /** Closing: January of the start year, or next month when that's this year. */
  closing: { month: number; year: number };
  endYear: number;
  /** The youngest person's age at closing (sets the principal limit factor). */
  youngestAge: number;
  homeValue: number;
  lendingLimit: number;
  /** The lesser of the home value and the lending limit. */
  maxClaim: number;
  principalLimitFactor: number;
  plfEstimated: boolean;
  principalLimit: number;
  originationFee: number;
  upfrontMip: number;
  otherClosingCosts: number;
  closingCosts: number;
  /** The home's loans, paid off from the reverse mortgage at closing. */
  existingLoans: number;
  /** Payoff plus closing costs: what has to come out of the loan first. */
  mandatory: number;
  /** What the loan can pay out at closing. */
  firstYearLimit: number;
  /** Cash to invest at closing. */
  cashAtClosing: number;
  /** Cash drawn a year later (adjustable payout), with the unused limit's growth. */
  laterDraw: number;
  /** The principal limit a fixed-rate lump sum leaves unused. */
  forfeited: number;
  /** Payoff and costs are more than the loan: cash you'd have to bring to close. */
  cashToClose: number;
  /** The home's loan payments the first month, which the reverse mortgage frees. */
  monthlyPaymentFreed: number;
  /** First year the reverse mortgage balance reaches the home's value, or null. */
  underwaterYear: number | null;
  keepEnd: number;
  reverseEnd: number;
  /** Investment return (before tax) at which both end even, or null when none in range. */
  breakevenReturn: number | null;
  years: ReverseMortgageYear[];
}

interface LoanState {
  terms: LoanTerms;
  balance: number;
  locPayment: number | null;
}

/** One month on an existing loan: returns what was paid. */
function payLoanMonth(loan: LoanState, year: number): number {
  if (!(loan.balance > 0.005)) return 0;
  const interest = loan.balance * (loan.terms.rate / 12);
  let payment = loan.terms.monthlyPayment + loan.terms.extraPrincipal;
  if (loan.terms.kind === "lineOfCredit") {
    const drawing = loan.terms.drawEndYear == null || year <= loan.terms.drawEndYear;
    if (drawing) {
      payment = interest;
    } else {
      loan.locPayment ??= levelPayment(loan.balance, loan.terms.rate, loan.terms.repaymentYears * 12);
      payment = loan.locPayment;
    }
  }
  payment = Math.min(payment, loan.balance + interest);
  loan.balance = Math.max(0, loan.balance + interest - payment);
  return payment;
}

/**
 * Compare taking a reverse mortgage on a home and investing the cash with
 * not taking one. The reverse mortgage pays off the home's loans at closing,
 * so the payments they'd have taken get invested every month too: both
 * choices spend the same. The loan's balance grows at the note rate plus
 * annual MIP and is never paid until the end; it's non-recourse, so the
 * equity never goes below 0. Investments grow monthly at the return after
 * the tax on growth. Compared each year end through the youngest person's
 * final age. Selling costs, property tax and insurance are the same either
 * way and left out.
 */
export function compareReverseMortgage(
  household: Household,
  settings: ReverseMortgageSettings & { startYear: number },
  opts: { thisYear: number; asOfDate?: string },
): ReverseMortgageResult | null {
  const props = reverseMortgageProperties(household);
  const property = props.find((p) => p.id === settings.propertyId) ?? props[0];
  if (!property) return null;
  const run = (investmentReturn: number) =>
    simulate(household, property, { ...settings, investmentReturn }, opts);
  const result = run(settings.investmentReturn);
  result.breakevenReturn = breakeven(run);
  return result;
}

function breakeven(run: (r: number) => ReverseMortgageResult): number | null {
  const ahead = (r: number) => {
    const res = run(r);
    return res.reverseEnd - res.keepEnd;
  };
  let lo = -0.2;
  let hi = 0.4;
  if (ahead(lo) > 0 || ahead(hi) < 0) return null;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (ahead(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function simulate(
  household: Household,
  property: RealEstate,
  s: ReverseMortgageSettings & { startYear: number },
  opts: { thisYear: number; asOfDate?: string },
): ReverseMortgageResult {
  const { thisYear } = opts;
  const asOfMonth = opts.asOfDate ? Number(opts.asOfDate.slice(5, 7)) : new Date().getMonth() + 1;
  const closing =
    s.startYear > thisYear
      ? { month: 1, year: s.startYear }
      : asOfMonth >= 12
        ? { month: 1, year: thisYear + 1 }
        : { month: asOfMonth + 1, year: thisYear };

  const births = birthYears(household);
  const youngestBirth = births.length > 0 ? Math.max(...births) : thisYear - HECM_MIN_AGE;
  const youngestAge = closing.year - youngestBirth;
  const finalAge = household.assumptions.finalAge || 90;
  const endYear = Math.max(closing.year, youngestBirth + finalAge);

  const appreciation = property.appreciationRate || 0;
  const yearsToClose = Math.max(0, closing.year - thisYear);
  const homeValue = property.marketValue * Math.pow(1 + appreciation, yearsToClose);
  const lendingLimit =
    s.lendingLimit * Math.pow(1 + appreciation, Math.max(0, closing.year - HECM_LENDING_LIMIT_YEAR));
  const maxClaim = Math.min(homeValue, lendingLimit);
  const plfEstimated = s.principalLimitFactor == null;
  const principalLimitFactor =
    s.principalLimitFactor ?? estimatePrincipalLimitFactor(youngestAge, s.expectedRate);
  const principalLimit = maxClaim * principalLimitFactor;

  const originationFee = hecmOriginationFee(maxClaim);
  const upfrontMip = HECM_UPFRONT_MIP * maxClaim;
  const closingCosts = originationFee + upfrontMip + s.otherClosingCosts;

  // The home's loans as of closing.
  const terms = loanTerms(household, opts.asOfDate);
  const loans: LoanState[] = [];
  for (const loan of propertyLoans(property)) {
    const t = terms[loan.id];
    if (!t) continue;
    const at = balanceAtStart(t, closing.year);
    if (!(at.balance > 0)) continue;
    loans.push({ terms: t, balance: at.balance, locPayment: at.lineOfCreditPayment });
  }
  const existingLoans = loans.reduce((sum, l) => sum + l.balance, 0);
  const mandatory = existingLoans + closingCosts;
  const cashToClose = Math.max(0, mandatory - principalLimit);
  const firstYearLimit = Math.min(
    principalLimit,
    Math.max(HECM_FIRST_YEAR_SHARE * principalLimit, mandatory + HECM_FIRST_YEAR_EXTRA * principalLimit),
  );
  const cashAtClosing = Math.max(0, firstYearLimit - mandatory);
  // At closing the loan is what came out of it (payoff and costs it covered, plus cash).
  const openingBalance = Math.min(firstYearLimit, mandatory) + cashAtClosing;

  const loanRate = s.noteRate + HECM_ANNUAL_MIP;
  const loanMonthly = loanRate / 12;
  const unused = s.payout === "fullDraw" ? Math.max(0, principalLimit - firstYearLimit) : 0;
  // The unused limit grows at the loan's rate until it's drawn 12 months later.
  const laterDraw = unused * Math.pow(1 + loanMonthly, 12);
  const forfeited = s.payout === "lumpSum" ? Math.max(0, principalLimit - firstYearLimit) : 0;

  const investGrowth = Math.pow(1 + s.investmentReturn * (1 - s.taxRate), 1 / 12) - 1;
  const homeGrowth = Math.pow(1 + appreciation, 1 / 12) - 1;

  let home = homeValue;
  let reverse = openingBalance;
  // Cash brought to close is money not invested: it starts the investments below 0.
  let invested = cashAtClosing - cashToClose;
  let monthlyPaymentFreed = 0;
  let underwaterYear: number | null = null;
  const years: ReverseMortgageYear[] = [];
  let yr = blankYear();

  let month = closing.month;
  let year = closing.year;
  let n = 0;
  while (year <= endYear) {
    // Each month: the old loans' payments (kept, or invested), growth, interest.
    let paid = 0;
    for (const loan of loans) paid += payLoanMonth(loan, year);
    if (n === 0) monthlyPaymentFreed = paid;
    invested = invested * (1 + investGrowth) + paid;
    const interest = reverse * loanMonthly;
    reverse += interest;
    home *= 1 + homeGrowth;
    yr.keepPayments += paid;
    yr.paymentsInvested += paid;
    yr.reverseInterest += interest;
    if (n === 0) yr.drawn += cashAtClosing;
    if (n === 11 && laterDraw > 0) {
      reverse += laterDraw;
      invested += laterDraw;
      yr.drawn += laterDraw;
    }
    n += 1;
    month += 1;
    if (month <= 12) continue;
    // Year end.
    const keepLoans = loans.reduce((sum, l) => sum + l.balance, 0);
    const keepNetWorth = home - keepLoans;
    const reverseEquity = Math.max(0, home - reverse);
    const reverseNetWorth = reverseEquity + invested;
    if (underwaterYear == null && reverse >= home) underwaterYear = year;
    years.push({
      ...yr,
      year,
      age: year - youngestBirth,
      homeValue: home,
      keepLoans,
      keepNetWorth,
      reverseBalance: reverse,
      invested,
      reverseEquity,
      reverseNetWorth,
      reverseAhead: reverseNetWorth - keepNetWorth,
    });
    yr = blankYear();
    month = 1;
    year += 1;
  }

  const last = years[years.length - 1];
  return {
    inputs: s,
    property: { id: property.id, label: property.label || "Home" },
    closing,
    endYear,
    youngestAge,
    homeValue,
    lendingLimit,
    maxClaim,
    principalLimitFactor,
    plfEstimated,
    principalLimit,
    originationFee,
    upfrontMip,
    otherClosingCosts: s.otherClosingCosts,
    closingCosts,
    existingLoans,
    mandatory,
    firstYearLimit,
    cashAtClosing,
    laterDraw,
    forfeited,
    cashToClose,
    monthlyPaymentFreed,
    underwaterYear,
    keepEnd: last?.keepNetWorth ?? 0,
    reverseEnd: last?.reverseNetWorth ?? 0,
    breakevenReturn: null,
    years,
  };
}

function blankYear() {
  return { keepPayments: 0, paymentsInvested: 0, reverseInterest: 0, drawn: 0 };
}
