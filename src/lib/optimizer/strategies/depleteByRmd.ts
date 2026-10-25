import type { Household } from "@/lib/domain/types";
import { accountGrowthForYear } from "@/lib/engine/marketHistory";
import {
  contributionAccounts,
  asOfYear,
  firstYearGrowthFraction,
  incomeMonthlyForYear,
  isIncomeActive,
} from "@/lib/domain/household";
import { allowsRmdYearConversions, personRmdAge } from "@/lib/domain/rmd";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";
import {
  conversionYears,
} from "@/lib/engine/convertible";
import {
  depositAmountForYear,
  openingBalance,
} from "@/lib/engine/deposits";
import {
  projectScenario,
  projectionStartYear,
} from "@/lib/engine/project";
import {
  padToProjection,
  roundCents,
  strategyStartIndex,
} from "@/lib/optimizer/util";


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
 * withdrawals, convert, then deposits. With RMD years open, empty them by the
 * window's last year instead (`depleteThroughWindow`).
 */
export function depleteByRmdSchedule(
  household: Household,
  asOfDate?: string,
): number[] {
  const start = projectionStartYear(household);
  const years = conversionYears(household);
  if (!Number.isFinite(start) || years < 1) return padToProjection(household, []);
  if (allowsRmdYearConversions(household)) return depleteThroughWindow(household, years, asOfDate);

  const retirementAccounts = contributionAccounts(household).filter(
    (acc) => acc.kind === "retirementTaxable",
  );
  const balances: Record<string, number> = {};
  for (const acc of retirementAccounts) {
    balances[acc.id] = Math.max(0, openingBalance(acc, start, asOfDate));
  }

  const window: number[] = [];
  // Years before retirement are manual only: balances still grow and pay
  // draws there, but nothing converts.
  const first = strategyStartIndex(household);

  for (let i = 0; i < years; i++) {
    const calendarYear = start + i;

    for (const acc of retirementAccounts) {
      balances[acc.id] *= 1 + accountGrowthForYear(household, acc, i);
    }

    for (const income of household.incomes) {
      if (income.kind !== "retirementDraw") continue;
      if (!isIncomeActive(income, calendarYear)) continue;
      const accId = income.drawsFromAccountId;
      if (!accId || balances[accId] == null) continue;
      const withdraw = incomeMonthlyForYear(income, calendarYear, start, asOfYear(asOfDate)) * 12;
      // Year 0 draws only what's left of the year from today's balance.
      const share = i === 0 ? firstYearGrowthFraction(start, asOfDate) : 1;
      const take = Math.min(Math.max(0, balances[accId]), Math.max(0, withdraw) * share);
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
    let toConvert = i >= first && yearsLeft > 0 ? available / yearsLeft : 0;
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

/**
 * With RMD years open there's no RMD age to empty the accounts by: empty them
 * by the window's last year instead. Each year converts what's left divided
 * by the years remaining, walking the real projection so each year's RMD
 * comes out first (the engine sets it aside before converting).
 */
function depleteThroughWindow(
  household: Household,
  years: number,
  asOfDate?: string,
): number[] {
  const refs = { ...FALLBACK_REFERENCE_DATA, asOfDate };
  const schedule = padToProjection(household, []);
  const first = strategyStartIndex(household);
  for (let i = first; i < years; i++) {
    // What's left in the accounts at the end of year i with nothing
    // converted that year (after its growth, draws, RMD and deposits).
    const left = projectScenario(household, schedule, refs)[i]?.retirementTotal ?? 0;
    schedule[i] = roundCents(Math.max(0, left) / (years - i));
  }
  return schedule;
}
