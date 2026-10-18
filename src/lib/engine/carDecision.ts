import type { CarDecision, Household } from "@/lib/domain/types";

export type CarOptionKey = "cash" | "finance" | "lease";

export const CAR_OPTION_LABELS: Record<CarOptionKey, string> = {
  cash: "Pay cash",
  finance: "Finance",
  lease: "Lease",
};

export const CAR_OPTIONS: CarOptionKey[] = ["cash", "finance", "lease"];

const DEFAULT_CAR_PRICE = 50_000;

/** Florida-style defaults; the price comes from a car in the plan when there is one. */
export function defaultCarDecision(household: Household): CarDecision {
  const car = (household.oneTimeDepreciation ?? []).find(
    (d) => /car|vehicle|auto|truck|suv/i.test(d.label) && d.amount > 0,
  );
  return {
    price: car?.amount ?? DEFAULT_CAR_PRICE,
    salesTaxRate: 0.06,
    fees: 0,
    years: 5,
    depreciationRate: 0.15,
    investmentReturn: 0.05,
    downPayment: 10_000,
    loanRate: 0.065,
    loanTermMonths: 60,
    leaseMonthly: 650,
    leaseTermMonths: 36,
    leaseDueAtSigning: 3_000,
    leaseEndFee: 400,
    leaseMilesPerYear: 12_000,
    milesDrivenPerYear: 12_000,
    excessMileRate: 0.25,
  };
}

/** The saved inputs, with defaults for anything missing or not a number. */
export function carDecisionFor(household: Household): CarDecision {
  const fallback = defaultCarDecision(household);
  const saved = household.carDecision;
  if (!saved) return fallback;
  const out = { ...fallback };
  for (const key of Object.keys(fallback) as (keyof CarDecision)[]) {
    const v = saved[key];
    if (Number.isFinite(v)) out[key] = Math.max(0, v);
  }
  return out;
}

/** Level monthly payment on `principal` at `apr` over `months`. */
export function loanPayment(principal: number, apr: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const i = apr / 12;
  if (i === 0) return principal / months;
  return (principal * i) / (1 - Math.pow(1 + i, -months));
}

/** What's still owed after `paid` monthly payments. */
function loanBalance(principal: number, apr: number, months: number, paid: number): number {
  if (principal <= 0 || paid >= months) return 0;
  const i = apr / 12;
  if (i === 0) return principal * (1 - paid / months);
  const pmt = loanPayment(principal, apr, months);
  const grown = Math.pow(1 + i, paid);
  return Math.max(0, principal * grown - (pmt * (grown - 1)) / i);
}

export interface CarYear {
  year: number;
  /** Money paid out through this year, per option. */
  paid: Record<CarOptionKey, number>;
  /** Car value less loan still owed (0 for a lease). */
  equity: Record<CarOptionKey, number>;
  /** Paid less equity: what the car has cost so far. */
  netCost: Record<CarOptionKey, number>;
}

export interface CarOptionSummary {
  key: CarOptionKey;
  upFront: number;
  monthly: number;
  totalPaid: number;
  /** Car value less loan owed at the end (0 for a lease). */
  endEquity: number;
  netCost: number;
  /**
   * Net cost with every payment carried forward at the investment return to
   * the end: what the choice costs counting the growth the money gave up.
   */
  netCostWithGrowth: number;
  /** Lease only: excess-mile charges inside the comparison (in total paid). */
  excessMileCharges: number;
}

export interface CarComparison {
  inputs: CarDecision;
  months: number;
  /** Car value at the end of the comparison. */
  endCarValue: number;
  loanPayment: number;
  options: CarOptionSummary[];
  years: CarYear[];
  /** The option with the lowest net cost counting lost growth. */
  best: CarOptionKey;
}

/** Payments by month (index 0 is signing / purchase day) for one option. */
function cashFlows(key: CarOptionKey, d: CarDecision, months: number): number[] {
  const flows = new Array(months + 1).fill(0);
  const tax = d.price * d.salesTaxRate;
  if (key === "cash") {
    flows[0] = d.price + tax + d.fees;
    return flows;
  }
  if (key === "finance") {
    const principal = Math.max(0, d.price - d.downPayment);
    const pmt = loanPayment(principal, d.loanRate, d.loanTermMonths);
    flows[0] = Math.min(d.downPayment, d.price) + tax + d.fees;
    for (let m = 1; m <= Math.min(months, d.loanTermMonths); m++) flows[m] += pmt;
    return flows;
  }
  // Lease: due at signing at each start, the payment every month, and at
  // each turn-in the fee plus the miles over the allowance. A lease still
  // running at the end owes the excess miles of its months inside.
  const term = Math.max(1, Math.round(d.leaseTermMonths));
  for (let start = 0; start < months; start += term) {
    flows[start] += d.leaseDueAtSigning;
    const inside = Math.min(term, months - start);
    flows[start + inside] += excessMileCharge(d, inside);
    if (inside === term) flows[start + term] += d.leaseEndFee;
  }
  for (let m = 1; m <= months; m++) flows[m] += d.leaseMonthly;
  return flows;
}

/**
 * One option's payments by year of the comparison (index 0 is the first
 * year): the signing / purchase day and months 1 to 12 in the first year,
 * then twelve months a year, with each turn-in in the year it lands.
 */
export function carCashFlows(key: CarOptionKey, d: CarDecision): number[] {
  const years = Math.max(1, Math.round(d.years));
  const flows = cashFlows(key, d, years * 12);
  const byYear = new Array(years).fill(0);
  flows.forEach((amount, month) => {
    byYear[Math.min(years - 1, Math.max(0, Math.ceil(month / 12) - 1))] += amount;
  });
  return byYear;
}

/** Miles a year over the lease allowance. */
export function excessMilesPerYear(d: CarDecision): number {
  return Math.max(0, d.milesDrivenPerYear - d.leaseMilesPerYear);
}

/** What `months` of driving over the allowance cost at turn-in. */
export function excessMileCharge(d: CarDecision, months: number): number {
  return ((excessMilesPerYear(d) * months) / 12) * d.excessMileRate;
}

function monthlyPayment(key: CarOptionKey, d: CarDecision): number {
  if (key === "lease") return d.leaseMonthly;
  if (key === "cash") return 0;
  return loanPayment(Math.max(0, d.price - d.downPayment), d.loanRate, d.loanTermMonths);
}

function equityAt(key: CarOptionKey, d: CarDecision, month: number): number {
  if (key === "lease") return 0;
  const value = d.price * Math.pow(1 - d.depreciationRate, month / 12);
  if (key === "cash") return value;
  const principal = Math.max(0, d.price - d.downPayment);
  return value - loanBalance(principal, d.loanRate, d.loanTermMonths, month);
}

/**
 * Lease vs cash vs finance over `years`: what each pays, what the car is
 * worth at the end, and the net cost with and without the investment growth
 * the money gives up. Before income tax; no business-use deduction.
 */
export function compareCarOptions(d: CarDecision): CarComparison {
  const years = Math.max(1, Math.round(d.years));
  const months = years * 12;
  const r = Math.pow(1 + d.investmentReturn, 1 / 12) - 1;

  const options = CAR_OPTIONS.map((key): CarOptionSummary => {
    const flows = cashFlows(key, d, months);
    const totalPaid = flows.reduce((a, b) => a + b, 0);
    const grown = flows.reduce((a, f, m) => a + f * Math.pow(1 + r, months - m), 0);
    const endEquity = equityAt(key, d, months);
    return {
      key,
      upFront: flows[0],
      monthly: monthlyPayment(key, d),
      totalPaid,
      endEquity,
      netCost: totalPaid - endEquity,
      netCostWithGrowth: grown - endEquity,
      excessMileCharges: key === "lease" ? excessMileCharge(d, months) : 0,
    };
  });

  const flowsByKey = Object.fromEntries(
    CAR_OPTIONS.map((k) => [k, cashFlows(k, d, months)]),
  ) as Record<CarOptionKey, number[]>;
  const yearRows: CarYear[] = [];
  for (let y = 1; y <= years; y++) {
    const m = y * 12;
    const paid = {} as Record<CarOptionKey, number>;
    const equity = {} as Record<CarOptionKey, number>;
    const netCost = {} as Record<CarOptionKey, number>;
    for (const k of CAR_OPTIONS) {
      paid[k] = flowsByKey[k].slice(0, m + 1).reduce((a, b) => a + b, 0);
      equity[k] = equityAt(k, d, m);
      netCost[k] = paid[k] - equity[k];
    }
    yearRows.push({ year: y, paid, equity, netCost });
  }

  const best = options.reduce((a, b) => (b.netCostWithGrowth < a.netCostWithGrowth ? b : a)).key;
  return {
    inputs: d,
    months,
    endCarValue: d.price * Math.pow(1 - d.depreciationRate, years),
    loanPayment: loanPayment(Math.max(0, d.price - d.downPayment), d.loanRate, d.loanTermMonths),
    options,
    years: yearRows,
    best,
  };
}
