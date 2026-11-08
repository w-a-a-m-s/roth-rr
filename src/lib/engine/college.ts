import type { CollegePlan, Household } from "@/lib/domain/types";

/**
 * College analysis: save for one student's college in a regular brokerage
 * account and pay the bills from it (out of pocket), or save the same amount
 * in a 529 plan and pay from that. Not a projection: it doesn't change the
 * plan.
 */

export type CollegeOptionKey = "outOfPocket" | "plan529";

export const COLLEGE_OPTIONS: CollegeOptionKey[] = ["outOfPocket", "plan529"];

export const COLLEGE_OPTION_LABELS: Record<CollegeOptionKey, string> = {
  outOfPocket: "Out of pocket",
  plan529: "529 plan",
};

/** The extra 10% federal tax on the earnings of a non-qualified 529 withdrawal. */
export const NON_QUALIFIED_529_PENALTY = 0.1;

/** A student of about 5 headed to a four-year public school with room and board. */
export function defaultCollegePlan(thisYear: number): CollegePlan {
  return {
    studentName: "",
    birthYear: thisYear - 5,
    startAge: 18,
    years: 4,
    annualCost: 30_000,
    costGrowth: 0.05,
    currentSavings: 0,
    monthlyContribution: 500,
    contributeDuringCollege: false,
    investmentReturn: 0.06,
    taxOnGrowth: 0.15,
    stateDeductionRate: 0,
    leftoverTaxRate: 0.24,
  };
}

const NUMBER_KEYS = [
  "birthYear",
  "startAge",
  "years",
  "annualCost",
  "costGrowth",
  "currentSavings",
  "monthlyContribution",
  "investmentReturn",
  "taxOnGrowth",
  "stateDeductionRate",
  "leftoverTaxRate",
] as const satisfies readonly (keyof CollegePlan)[];

/** The saved inputs, with defaults for anything missing or not a number. */
export function collegePlanFor(household: Household, thisYear: number): CollegePlan {
  const out = defaultCollegePlan(thisYear);
  const saved = household.college;
  if (!saved) return out;
  for (const key of NUMBER_KEYS) {
    const v = saved[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = Math.max(0, v);
  }
  if (typeof saved.studentName === "string") out.studentName = saved.studentName;
  if (typeof saved.contributeDuringCollege === "boolean") {
    out.contributeDuringCollege = saved.contributeDuringCollege;
  }
  return out;
}

export interface CollegeYear {
  year: number;
  /** The student's age that year. */
  age: number;
  inCollege: boolean;
  /** This year's college bill (0 outside college). */
  cost: number;
  /** Contributions put in this year (the same for both options). */
  contributed: number;
  /** Paid toward the bill from the account. */
  paidFromAccount: Record<CollegeOptionKey, number>;
  /** The rest of the bill, paid from your pocket when the account runs short. */
  shortfall: Record<CollegeOptionKey, number>;
  /** Growth the account earned this year, before tax. */
  growth: Record<CollegeOptionKey, number>;
  /** Tax on that growth (the brokerage account only; 529 growth is tax free). */
  taxOnGrowth: Record<CollegeOptionKey, number>;
  /** State income tax saved by deducting the 529 contributions. */
  stateTaxSaved: number;
  /** Account balance at year end. */
  balance: Record<CollegeOptionKey, number>;
}

export interface CollegeOptionSummary {
  key: CollegeOptionKey;
  contributed: number;
  /** Account balance on the day college starts, before the first bill. */
  balanceAtStart: number;
  totalCost: number;
  paidFromAccount: number;
  /** College bills the account couldn't cover, paid from your pocket. */
  shortfall: number;
  growth: number;
  taxOnGrowth: number;
  stateTaxSaved: number;
  /** What's left in the account after the last year of college. */
  leftover: number;
  /** Tax (and the 10% penalty for a 529) on taking the leftover out in cash. */
  leftoverTax: number;
  /**
   * What college really cost you: everything you put in, plus the bills paid
   * from your pocket, less the state tax saved and the leftover after tax.
   */
  netCost: number;
}

export interface CollegeComparison {
  inputs: CollegePlan;
  firstCollegeYear: number;
  lastCollegeYear: number;
  options: CollegeOptionSummary[];
  years: CollegeYear[];
  best: CollegeOptionKey;
  /** How much less the best option costs than the other. */
  savings: number;
}

const zero = (): Record<CollegeOptionKey, number> => ({ outOfPocket: 0, plan529: 0 });

/**
 * Year by year from `thisYear` through the last year of college. Each college
 * year's bill (today's cost grown by `costGrowth` a year) is paid on January
 * 1 from the account, and anything it can't cover from your pocket. Then the
 * month's contribution goes in at each month's start and the account grows
 * monthly at `investmentReturn`. The brokerage account pays `taxOnGrowth` on
 * each year's growth at year end (dividends and gains realized along the
 * way), so its basis always equals its balance and the leftover comes out tax
 * free. A 529 grows tax free, pays qualified bills tax free, and saves state
 * tax on each contribution; its leftover, taken out in cash, owes
 * `leftoverTaxRate` plus the 10% penalty on its earnings.
 */
export function compareCollegeOptions(plan: CollegePlan, thisYear: number): CollegeComparison {
  const startAge = Math.max(0, Math.round(plan.startAge));
  const collegeYears = Math.max(1, Math.round(plan.years));
  const firstCollegeYear = Math.max(thisYear, Math.round(plan.birthYear) + startAge);
  const lastCollegeYear = firstCollegeYear + collegeYears - 1;
  const r = Math.pow(1 + plan.investmentReturn, 1 / 12) - 1;

  const balance = { outOfPocket: plan.currentSavings, plan529: plan.currentSavings };
  // 529 basis: what was put in and not yet taken out. Withdrawals take basis
  // and earnings in proportion.
  let basis529 = plan.currentSavings;
  const balanceAtStart = zero();
  const rows: CollegeYear[] = [];

  for (let year = thisYear; year <= lastCollegeYear; year++) {
    const inCollege = year >= firstCollegeYear;
    if (year === firstCollegeYear) {
      balanceAtStart.outOfPocket = balance.outOfPocket;
      balanceAtStart.plan529 = balance.plan529;
    }
    const cost = inCollege ? plan.annualCost * Math.pow(1 + plan.costGrowth, year - thisYear) : 0;
    const paidFromAccount = zero();
    const shortfall = zero();
    for (const k of COLLEGE_OPTIONS) {
      const take = Math.min(cost, Math.max(0, balance[k]));
      if (k === "plan529" && balance[k] > 0) basis529 *= 1 - take / balance[k];
      balance[k] -= take;
      paidFromAccount[k] = take;
      shortfall[k] = cost - take;
    }

    const saving = !inCollege || plan.contributeDuringCollege;
    const monthly = saving ? plan.monthlyContribution : 0;
    const growth = zero();
    for (const k of COLLEGE_OPTIONS) {
      for (let m = 0; m < 12; m++) {
        balance[k] += monthly;
        const g = balance[k] * r;
        balance[k] += g;
        growth[k] += g;
      }
    }
    const contributed = monthly * 12;
    basis529 += contributed;
    const taxOnGrowth = { outOfPocket: Math.max(0, growth.outOfPocket) * plan.taxOnGrowth, plan529: 0 };
    balance.outOfPocket -= taxOnGrowth.outOfPocket;

    rows.push({
      year,
      age: year - Math.round(plan.birthYear),
      inCollege,
      cost,
      contributed,
      paidFromAccount,
      shortfall,
      growth,
      taxOnGrowth,
      stateTaxSaved: contributed * plan.stateDeductionRate,
      balance: { ...balance },
    });
  }

  const sum = (f: (y: CollegeYear) => number) => rows.reduce((a, y) => a + f(y), 0);
  const contributed = plan.currentSavings + sum((y) => y.contributed);
  const totalCost = sum((y) => y.cost);
  const stateTaxSaved = sum((y) => y.stateTaxSaved);
  // Rounded to cents: pro-rata basis picks up float noise.
  const earnings529 = Math.max(0, Math.round((balance.plan529 - basis529) * 100) / 100);
  const leftoverTax = {
    outOfPocket: 0,
    plan529: earnings529 * (plan.leftoverTaxRate + NON_QUALIFIED_529_PENALTY),
  };

  const options = COLLEGE_OPTIONS.map((key): CollegeOptionSummary => {
    const saved = key === "plan529" ? stateTaxSaved : 0;
    const shortfall = sum((y) => y.shortfall[key]);
    const leftover = balance[key];
    return {
      key,
      contributed,
      balanceAtStart: balanceAtStart[key],
      totalCost,
      paidFromAccount: sum((y) => y.paidFromAccount[key]),
      shortfall,
      growth: sum((y) => y.growth[key]),
      taxOnGrowth: sum((y) => y.taxOnGrowth[key]),
      stateTaxSaved: saved,
      leftover,
      leftoverTax: leftoverTax[key],
      netCost: contributed + shortfall - saved - (leftover - leftoverTax[key]),
    };
  });

  const [a, b] = options;
  const best = b.netCost < a.netCost ? b.key : a.key;
  return {
    inputs: plan,
    firstCollegeYear,
    lastCollegeYear,
    options,
    years: rows,
    best,
    savings: Math.abs(a.netCost - b.netCost),
  };
}
