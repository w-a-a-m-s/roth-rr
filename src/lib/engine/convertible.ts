import type { Account, Household } from "@/lib/domain/types";
import {
  accountGrowsInYear,
  incomeMonthlyForYear,
  isIncomeActive,
} from "@/lib/domain/household";
import { personRmdAge } from "@/lib/domain/rmd";
import { DEFAULT_ACCOUNT_GROWTH } from "@/lib/config/defaults";
import {
  projectionStartYear,
  projectionYears,
} from "@/lib/engine/project";
import {
  depositAmountForYear,
  openingBalance,
} from "@/lib/engine/deposits";

function growthRate(account: Account): number {
  return Number.isFinite(account.growthRate)
    ? account.growthRate
    : DEFAULT_ACCOUNT_GROWTH[account.kind] ?? 0;
}

function ownerConvertibleInYear(
  household: Household,
  ownerId: string,
  calendarYear: number,
): boolean {
  const owner = household.people.find((p) => p.id === ownerId);
  const rmdAge = personRmdAge(owner);
  const age = calendarYear - (owner?.birthYear ?? NaN);
  // Missing birth year → still convertible (matches the projection engine).
  if (rmdAge == null || !Number.isFinite(age)) return true;
  return age < rmdAge;
}

/**
 * Number of leading projection years in which at least one person is still
 * below their birth-year RMD age - i.e. the years a conversion can actually
 * take effect. Conversions in later years are ignored by the engine, so this
 * is the window a default "spread evenly" distribution fills.
 */
export function conversionYears(household: Household): number {
  const start = projectionStartYear(household);
  const n = projectionYears(household);
  if (!Number.isFinite(start) || !Number.isFinite(n)) return 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const calendarYear = start + i;
    const anyPreRmd = household.people.some((p) => {
      const rmdAge = personRmdAge(p);
      if (rmdAge == null) return false;
      const age = calendarYear - (p.birthYear ?? NaN);
      return Number.isFinite(age) && age < rmdAge;
    });
    if (!anyPreRmd) break;
    count++;
  }
  return count;
}

/**
 * Total dollars that can be converted over the conversion window: starting
 * tax-deferred balances, grown year by year, minus retirement withdrawals.
 *
 * Mirrors the projection engine's growth and withdrawal steps with no
 * conversions applied, then banks each account in its last pre-RMD year (so
 * growth after that owner reaches RMD is not counted). Equals
 * initial + cumulative growth - cumulative withdrawals for accounts that stay
 * convertible through the window. `asOfDate` is the date the balances were
 * entered (today, in the app), as in `projectScenario`.
 */
export function convertibleTotal(
  household: Household,
  asOfDate?: string,
): number {
  const start = projectionStartYear(household);
  const years = conversionYears(household);
  if (!Number.isFinite(start) || years < 1) return 0;

  const retirementAccounts = household.accounts.filter(
    (acc) => acc.kind === "retirementTaxable",
  );
  const balances: Record<string, number> = {};
  for (const acc of retirementAccounts) {
    balances[acc.id] = Math.max(0, openingBalance(acc, start, asOfDate));
  }

  let banked = 0;

  for (let i = 0; i < years; i++) {
    const calendarYear = start + i;

    // Grow balances. Same order as `projectScenario`, including the
    // retirement delay (first growth in the owner's retirement year).
    for (const acc of retirementAccounts) {
      if (!accountGrowsInYear(acc, household.people, calendarYear, start)) {
        continue;
      }
      balances[acc.id] *= 1 + growthRate(acc);
    }

    // Retirement draws deplete their source accounts (same caps as the engine).
    for (const income of household.incomes) {
      if (income.kind !== "retirementDraw") continue;
      if (!isIncomeActive(income, calendarYear)) continue;
      const accId = income.drawsFromAccountId;
      if (!accId || balances[accId] == null) continue;
      const withdraw = incomeMonthlyForYear(income, calendarYear, start) * 12;
      const take = Math.min(Math.max(0, balances[accId]), Math.max(0, withdraw));
      balances[accId] -= take;
    }

    // Deposits land after growth and withdrawals, same as in `projectScenario`,
    // so money paid in during the window is convertible too.
    for (const acc of retirementAccounts) {
      for (const deposit of acc.deposits ?? []) {
        balances[acc.id] += depositAmountForYear(deposit, calendarYear);
      }
    }

    const isLastYear = i === years - 1;
    for (const acc of retirementAccounts) {
      if (!ownerConvertibleInYear(household, acc.ownerId, calendarYear)) {
        continue;
      }

      const convertibleNext = ownerConvertibleInYear(
        household,
        acc.ownerId,
        calendarYear + 1,
      );
      if (!isLastYear && convertibleNext) continue;

      // Last chance to convert this account: bank the progressive balance.
      banked += Math.max(0, balances[acc.id] ?? 0);
      balances[acc.id] = 0;
    }
  }

  return banked;
}
