import type { Account, Household } from "@/lib/domain/types";
import { incomeMonthlyForYear, isIncomeActive } from "@/lib/domain/household";
import { DEFAULT_ACCOUNT_GROWTH } from "@/lib/config/defaults";
import { personRmdAge } from "@/lib/domain/rmd";
import {
  conversionYears,
} from "@/lib/engine/convertible";
import {
  depositAmountForYear,
  openingBalance,
} from "@/lib/engine/deposits";
import {
  projectionStartYear,
} from "@/lib/engine/project";
import { padToProjection, roundCents } from "@/lib/optimizer/util";

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
  if (rmdAge == null || !Number.isFinite(age)) return true;
  return age < rmdAge;
}

/**
 * Each pre-RMD year, convert `remaining pre-RMD balance / years left` so the
 * tax-deferred accounts empty by RMD. Walk order matches the engine: grow,
 * withdrawals, convert, then deposits.
 */
export function depleteByRmdSchedule(
  household: Household,
  asOfDate?: string,
): number[] {
  const start = projectionStartYear(household);
  const years = conversionYears(household);
  if (!Number.isFinite(start) || years < 1) return padToProjection(household, []);

  const retirementAccounts = household.accounts.filter(
    (acc) => acc.kind === "retirementTaxable",
  );
  const balances: Record<string, number> = {};
  for (const acc of retirementAccounts) {
    balances[acc.id] = Math.max(0, openingBalance(acc, start, asOfDate));
  }

  const window: number[] = [];

  for (let i = 0; i < years; i++) {
    const calendarYear = start + i;

    for (const acc of retirementAccounts) {
      balances[acc.id] *= 1 + growthRate(acc);
    }

    for (const income of household.incomes) {
      if (income.kind !== "retirementDraw") continue;
      if (!isIncomeActive(income, calendarYear)) continue;
      const accId = income.drawsFromAccountId;
      if (!accId || balances[accId] == null) continue;
      const withdraw = incomeMonthlyForYear(income, calendarYear, start) * 12;
      const take = Math.min(Math.max(0, balances[accId]), Math.max(0, withdraw));
      balances[accId] -= take;
    }

    let available = 0;
    for (const acc of retirementAccounts) {
      if (!ownerConvertibleInYear(household, acc.ownerId, calendarYear)) {
        continue;
      }
      available += Math.max(0, balances[acc.id] ?? 0);
    }

    const yearsLeft = years - i;
    let toConvert = yearsLeft > 0 ? available / yearsLeft : 0;
    let converted = 0;
    for (const acc of retirementAccounts) {
      if (toConvert <= 0) break;
      if (!ownerConvertibleInYear(household, acc.ownerId, calendarYear)) {
        continue;
      }
      const take = Math.min(Math.max(0, balances[acc.id]), toConvert);
      balances[acc.id] -= take;
      toConvert -= take;
      converted += take;
    }
    window.push(roundCents(converted));

    for (const acc of retirementAccounts) {
      for (const deposit of acc.deposits ?? []) {
        balances[acc.id] += depositAmountForYear(deposit, calendarYear);
      }
    }
  }

  return padToProjection(household, window);
}
