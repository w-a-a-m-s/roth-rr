import type { Household, IncomeKind } from "@/lib/domain/types";
import type { ProjectionRow } from "@/lib/engine/types";

/**
 * Where each dollar of income comes from, in the order it's applied to the
 * yearly need: guaranteed income first, then RMDs, then withdrawals.
 */
export type IncomeCategory =
  | "socialSecurity"
  | "pension"
  | "earnings"
  | "other"
  | "rmd"
  | "withdrawals";

export const INCOME_CATEGORIES: {
  key: IncomeCategory;
  label: string;
  color: string;
}[] = [
  { key: "socialSecurity", label: "Social Security", color: "#C9C400" },
  { key: "pension", label: "Pension", color: "#2F6B34" },
  { key: "earnings", label: "Earnings", color: "#9BC79B" },
  { key: "other", label: "Other income", color: "#5F9B66" },
  { key: "rmd", label: "Required distributions", color: "#D2691E" },
  { key: "withdrawals", label: "Withdrawals from assets", color: "#F59E42" },
];

/** Income that isn't drawn from the household's own accounts. */
export const INCOME_SOURCE_CATEGORIES: IncomeCategory[] = [
  "socialSecurity",
  "pension",
  "earnings",
  "other",
];

export const NEED_COLOR = "#C8102E";

const KIND_CATEGORY: Record<IncomeKind, IncomeCategory> = {
  socialSecurity: "socialSecurity",
  pension: "pension",
  militaryPension: "pension",
  salary: "earnings",
  business: "earnings",
  lifeInsurance: "other",
  disabilityInsurance: "other",
  other: "other",
  retirementDraw: "withdrawals",
  rothWithdrawal: "withdrawals",
  afterTaxWithdrawal: "withdrawals",
};

export function incomeCategory(
  household: Household,
  key: string,
): IncomeCategory {
  if (key.startsWith("rmd:")) return "rmd";
  if (key.startsWith("re:")) return "other";
  const income = household.incomes.find((i) => i.id === key);
  return income ? KIND_CATEGORY[income.kind] : "other";
}

type ByCategory = Record<IncomeCategory, number>;

const zero = (): ByCategory => ({
  socialSecurity: 0,
  pension: 0,
  earnings: 0,
  other: 0,
  rmd: 0,
  withdrawals: 0,
});

export interface PresentationYear {
  year: number;
  age: number;
  /**
   * Annual spending, income tax, and deposits into accounts: what the year's
   * income has to cover. Deposits count because the Surplus row nets them.
   */
  need: number;
  /** Annual deposits into accounts, already inside `need`. */
  deposits: number;
  /** Annual income by category, before it's matched to the need. */
  income: ByCategory;
  /** Income actually used toward the need, filled in category order. */
  applied: ByCategory;
  /** Need left after the non-account income sources. */
  neededFromAssets: number;
  /** Need left after every income, RMDs and withdrawals included. */
  shortfall: number;
  /** Income beyond the need. */
  excess: number;
}

export interface PresentationSummary {
  firstYear: number;
  firstAge: number;
  firstYearNeed: number;
  /** Rate used to capitalize (present-value) the yearly amounts. */
  rate: number;
  capitalizedNeed: number;
  capitalizedIncomeSources: number;
  capitalizedNeededFromAssets: number;
  capitalizedAssetDraws: number;
  capitalizedShortfall: number;
  shortfallYears: number;
}

export interface PresentationData {
  years: PresentationYear[];
  summary: PresentationSummary;
}

/**
 * Balance-weighted average growth rate of the plan's accounts: the "account
 * earning" rate the capitalized values assume.
 */
export function capitalizationRate(household: Household): number {
  let total = 0;
  let weighted = 0;
  for (const acc of household.accounts) {
    if (acc.balance <= 0) continue;
    total += acc.balance;
    weighted += acc.balance * acc.growthRate;
  }
  if (total <= 0) return 0.05;
  return weighted / total;
}

/**
 * The four presentation charts' data: the yearly need, the income sources,
 * those sources applied to the need, and the need met once RMDs and
 * withdrawals are added. Everything is read off the projection rows.
 */
export function buildPresentationData(
  rows: ProjectionRow[],
  household: Household,
  primaryId: string,
): PresentationData {
  const rate = capitalizationRate(household);
  const years: PresentationYear[] = rows.map((row) => {
    const deposits = Math.max(0, row.monthlyDeposits * 12);
    const need = Math.max(
      0,
      (row.monthlyExpenses + row.monthlyTax) * 12 -
        row.conversionTaxWithheld +
        deposits,
    );

    const income = zero();
    for (const [key, monthly] of Object.entries(row.incomeMonthly)) {
      income[incomeCategory(household, key)] += monthly * 12;
    }
    // A rental losing money shows as negative income; there's nothing to stack.
    for (const cat of INCOME_CATEGORIES) {
      income[cat.key] = Math.max(0, income[cat.key]);
    }

    const applied = zero();
    let left = need;
    for (const cat of INCOME_CATEGORIES) {
      const use = Math.min(left, income[cat.key]);
      applied[cat.key] = use;
      left -= use;
    }
    const fromSources = INCOME_SOURCE_CATEGORIES.reduce(
      (sum, key) => sum + applied[key],
      0,
    );
    const totalIncome = INCOME_CATEGORIES.reduce(
      (sum, cat) => sum + income[cat.key],
      0,
    );

    return {
      year: row.calendarYear,
      age: row.ages[primaryId] ?? 0,
      need,
      deposits,
      income,
      applied,
      neededFromAssets: need - fromSources,
      shortfall: left,
      excess: Math.max(0, totalIncome - need),
    };
  });

  const pv = (fn: (y: PresentationYear) => number) =>
    years.reduce((sum, y, i) => sum + fn(y) / Math.pow(1 + rate, i), 0);

  const first = years[0];
  return {
    years,
    summary: {
      firstYear: first?.year ?? 0,
      firstAge: first?.age ?? 0,
      firstYearNeed: first?.need ?? 0,
      rate,
      capitalizedNeed: pv((y) => y.need),
      capitalizedIncomeSources: pv((y) => y.need - y.neededFromAssets),
      capitalizedNeededFromAssets: pv((y) => y.neededFromAssets),
      capitalizedAssetDraws: pv((y) => y.applied.rmd + y.applied.withdrawals),
      capitalizedShortfall: pv((y) => y.shortfall),
      shortfallYears: years.filter((y) => y.shortfall > 0.5).length,
    },
  };
}
