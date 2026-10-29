import type { Household, IncomeSource } from "@/lib/domain/types";
import {
  incomeMonthlyForYear,
  isIncomeActive,
  usesIncomeTable,
} from "@/lib/domain/household";
import {
  LIFE_INSURANCE_PROCEEDS_GROWTH,
  lifeInsurancePayoutRate,
} from "@/lib/config/lifeInsurancePayout";

/**
 * Account withdrawals on the income table (`amountSource: "incomeTable"`).
 *
 * The first year the income pays, its yearly amount is fixed at the source
 * account's January balance (before that year's growth) times the payout
 * table's rate for the owner's age that year: the same table the
 * Survivorship and Long-term care lifetime income uses. It stays that amount
 * for life. From that year the account grows 8% a year instead of its own
 * rate. `projectScenario`, `convertibleTotal` and Empty by RMD all walk it
 * through these helpers.
 */

/** Yearly growth of an account once it pays an income-table income. */
export const INCOME_TABLE_GROWTH = LIFE_INSURANCE_PROCEEDS_GROWTH;

/** Payout rate for the income's owner in `calendarYear`. */
export function incomeTableRate(
  household: Pick<Household, "people">,
  income: Pick<IncomeSource, "ownerId">,
  calendarYear: number,
): number {
  const owner = household.people.find((p) => p.id === income.ownerId);
  return lifeInsurancePayoutRate(calendarYear - (owner?.birthYear ?? NaN));
}

/**
 * Fix the yearly amount of every table income that starts paying this year.
 * Call it before the year's growth, with this January's balances. `fixed` is
 * updated in place and keeps the amounts for later years.
 */
export function fixIncomeTableAmounts(
  household: Household,
  calendarYear: number,
  balances: Record<string, number>,
  fixed: Record<string, number>,
): void {
  for (const income of household.incomes) {
    if (!usesIncomeTable(income)) continue;
    if (fixed[income.id] != null) continue;
    if (!isIncomeActive(income, calendarYear)) continue;
    const accId = income.drawsFromAccountId;
    if (!accId || balances[accId] == null) continue;
    fixed[income.id] =
      Math.max(0, balances[accId]) * incomeTableRate(household, income, calendarYear);
  }
}

/** Accounts paying a table income that has started: they grow 8% a year. */
export function incomeTableAccountIds(
  household: Household,
  fixed: Record<string, number>,
): Set<string> {
  const ids = new Set<string>();
  for (const income of household.incomes) {
    if (fixed[income.id] == null || !income.drawsFromAccountId) continue;
    ids.add(income.drawsFromAccountId);
  }
  return ids;
}

/**
 * The withdrawal's yearly amount: the fixed table amount for a table income,
 * otherwise the entered monthly amount grown, times 12.
 */
export function withdrawalAnnualForYear(
  income: IncomeSource,
  calendarYear: number,
  projectionStart: number,
  todayYear: number | undefined,
  fixed: Record<string, number>,
): number {
  if (!usesIncomeTable(income)) {
    return incomeMonthlyForYear(income, calendarYear, projectionStart, todayYear) * 12;
  }
  if (!isIncomeActive(income, calendarYear)) return 0;
  return fixed[income.id] ?? 0;
}
