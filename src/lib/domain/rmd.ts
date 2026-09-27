import type { Household, Person } from "@/lib/domain/types";

/**
 * IRS RMD starting age from birth year (SECURE Act / SECURE 2.0).
 *
 * - Born 1950 or earlier: 72
 * - Born 1951-1959: 73
 * - Born 1960 or later: 75
 */
export function rmdStartingAge(birthYear: number): number {
  if (birthYear >= 1960) return 75;
  if (birthYear >= 1951) return 73;
  return 72;
}

/** RMD starting age for a person, or undefined when birth year is unknown. */
export function personRmdAge(
  person: Pick<Person, "birthYear"> | undefined,
): number | undefined {
  const birthYear = person?.birthYear;
  if (birthYear == null || !Number.isFinite(birthYear)) return undefined;
  return rmdStartingAge(birthYear);
}

/**
 * RMD starting age for the household's main person (projection snapshot /
 * summary metrics). Resolves `mainPersonId` the same way as the engine's
 * primary-person fallback when unset.
 */
export function primaryRmdAge(household: Household): number | undefined {
  let primary: Person | undefined;
  if (household.mainPersonId) {
    primary = household.people.find((p) => p.id === household.mainPersonId);
  }
  if (!primary) {
    const start = Math.min(
      ...household.people.map((p) => p.retirementYear ?? NaN),
    );
    primary =
      household.people.find((p) => p.retirementYear === start) ??
      household.people[0];
  }
  return personRmdAge(primary);
}
