import type { DeathEvent, Household, IncomeSource } from "@/lib/domain/types";
import {
  incomeMonthlyForYear,
  isIncomeActive,
  isPensionIncome,
  isWithdrawalIncome,
  pensionPayout,
} from "@/lib/domain/household";

/** Default age for the Survivorship analysis when the plan hasn't set one. */
export const DEFAULT_DEATH_AGE = 80;

/** A death resolved to calendar years, with the spouse who survives. */
export interface ResolvedDeath {
  personId: string;
  /** Calendar year of death. The person is treated as alive through it. */
  year: number;
  /** The surviving spouse, or null in a one-person plan. */
  survivorId: string | null;
}

/**
 * The survivorship analysis needs two people. The default is the main person
 * (first listed) passing at 80.
 */
export function defaultDeathEvent(household: Household): DeathEvent | null {
  if (household.people.length < 2) return null;
  const personId = household.mainPersonId ?? household.people[0].id;
  return { personId, deathAge: DEFAULT_DEATH_AGE };
}

/** The plan's survivorship setting if it's still valid, else the default. */
export function survivorshipEvent(household: Household): DeathEvent | null {
  const saved = household.survivorship;
  if (saved && resolveDeath(household, saved)) return saved;
  return defaultDeathEvent(household);
}

export function resolveDeath(
  household: Household,
  death: DeathEvent | undefined | null,
): ResolvedDeath | null {
  if (!death || !Number.isFinite(death.deathAge)) return null;
  const person = household.people.find((p) => p.id === death.personId);
  if (!person || !Number.isFinite(person.birthYear)) return null;
  const survivor = household.people.find((p) => p.id !== death.personId);
  return {
    personId: person.id,
    year: (person.birthYear as number) + Math.round(death.deathAge),
    survivorId: survivor?.id ?? null,
  };
}

/** Whether `personId` has passed by `calendarYear` (death takes effect the year after). */
export function hasPassed(
  death: ResolvedDeath | null,
  personId: string,
  calendarYear: number,
): boolean {
  return death != null && death.personId === personId && calendarYear > death.year;
}

/**
 * Account or income owner once a death applies: what the deceased owned now
 * belongs to the surviving spouse (a spousal rollover, so RMDs and conversions
 * follow the survivor's age).
 */
export function effectiveOwner(
  death: ResolvedDeath | null,
  ownerId: string,
  calendarYear: number,
): string {
  if (!hasPassed(death, ownerId, calendarYear)) return ownerId;
  return death?.survivorId ?? ownerId;
}

function socialSecurityMonthly(
  incomes: IncomeSource[],
  ownerId: string,
  calendarYear: number,
  start: number,
): number {
  let total = 0;
  for (const income of incomes) {
    if (income.kind !== "socialSecurity" || income.ownerId !== ownerId) continue;
    if (!isIncomeActive(income, calendarYear)) continue;
    total += incomeMonthlyForYear(income, calendarYear, start);
  }
  return total;
}

/**
 * Income lines that stop paying in `calendarYear` because of the death:
 * - a life-only pension of the deceased stops; a survivorship pension keeps
 *   paying the same amount to the spouse,
 * - Social Security: the survivor keeps the larger of the two benefits,
 * - the deceased's salary and business income stop.
 * Withdrawals keep running (the accounts pass to the spouse), and so does
 * anything else.
 */
export function incomesStoppedByDeath(
  household: Household,
  death: ResolvedDeath | null,
  calendarYear: number,
  start: number,
): Set<string> {
  const stopped = new Set<string>();
  if (!death || calendarYear <= death.year) return stopped;

  const survivorId = death.survivorId;
  const deceasedSs = socialSecurityMonthly(household.incomes, death.personId, calendarYear, start);
  const survivorSs = survivorId
    ? socialSecurityMonthly(household.incomes, survivorId, calendarYear, start)
    : 0;
  const keepDeceasedSs = survivorId != null && deceasedSs > survivorSs;

  for (const income of household.incomes) {
    if (isWithdrawalIncome(income.kind)) continue;
    const ownedByDeceased = income.ownerId === death.personId;
    if (income.kind === "socialSecurity") {
      if (ownedByDeceased && !keepDeceasedSs) stopped.add(income.id);
      if (!ownedByDeceased && income.ownerId === survivorId && keepDeceasedSs) {
        stopped.add(income.id);
      }
      continue;
    }
    if (!ownedByDeceased) continue;
    if (isPensionIncome(income.kind)) {
      if (survivorId == null || pensionPayout(income) !== "survivor") {
        stopped.add(income.id);
      }
      continue;
    }
    if (income.kind === "salary" || income.kind === "business") {
      stopped.add(income.id);
    }
  }
  return stopped;
}
