import type {
  CarePeriod,
  CareType,
  Household,
  LongTermCareSettings,
  Person,
} from "@/lib/domain/types";

/** Monthly cost per person in care, in today's dollars (first projection year). */
export const CARE_MONTHLY_COST: Record<CareType, number> = {
  home: 6_000,
  nursing: 10_000,
};

export const CARE_TYPE_LABELS: Record<CareType, string> = {
  home: "Home care",
  nursing: "Nursing home",
};

export const DEFAULT_CARE_INFLATION = 0.03;
export const DEFAULT_CARE_START_AGE = 80;

/** While some (not all) of the household is in care, expenses drop to this share. */
export const CARE_EXPENSE_SHARE = 0.7;

/** Default years of care: 3 for men, 5 for women, 3 when not set. */
export function defaultCareYears(person: Pick<Person, "sex"> | undefined): number {
  return person?.sex === "female" ? 5 : 3;
}

export function defaultLongTermCare(household: Household): LongTermCareSettings | null {
  if (household.people.length === 0) return null;
  const personId = household.mainPersonId ?? household.people[0].id;
  return {
    who: "one",
    personId,
    careType: "home",
    inflation: DEFAULT_CARE_INFLATION,
    periods: [],
  };
}

/** The plan's long-term care settings, healed against the current people. */
export function longTermCareSettings(household: Household): LongTermCareSettings | null {
  const fallback = defaultLongTermCare(household);
  if (!fallback) return null;
  const saved = household.longTermCare;
  if (!saved) return fallback;
  const known = (id: string) => household.people.some((p) => p.id === id);
  return {
    who: saved.who === "both" && household.people.length > 1 ? "both" : "one",
    personId: known(saved.personId) ? saved.personId : fallback.personId,
    careType: saved.careType === "nursing" ? "nursing" : "home",
    inflation: Number.isFinite(saved.inflation) ? saved.inflation : DEFAULT_CARE_INFLATION,
    periods: (saved.periods ?? []).filter((p) => known(p.personId)),
  };
}

/** Start age and years for one person, saved or default. */
export function carePeriodFor(
  household: Household,
  settings: LongTermCareSettings,
  personId: string,
): CarePeriod {
  const saved = settings.periods.find((p) => p.personId === personId);
  const person = household.people.find((p) => p.id === personId);
  return {
    personId,
    startAge:
      saved && Number.isFinite(saved.startAge) ? saved.startAge : DEFAULT_CARE_START_AGE,
    years:
      saved && Number.isFinite(saved.years) && saved.years > 0
        ? Math.round(saved.years)
        : defaultCareYears(person),
    careType:
      saved?.careType === "home" || saved?.careType === "nursing"
        ? saved.careType
        : settings.careType,
  };
}

/** People whose care runs under these settings. */
export function peopleInCare(household: Household, settings: LongTermCareSettings): string[] {
  if (settings.who === "both") return household.people.map((p) => p.id);
  return household.people.some((p) => p.id === settings.personId) ? [settings.personId] : [];
}

/** Care resolved to calendar years. */
export interface ResolvedCare {
  inflation: number;
  peopleCount: number;
  /** Each stay's monthly cost is in first-projection-year dollars. */
  stays: { personId: string; firstYear: number; lastYear: number; monthlyCost: number }[];
}

export function resolveLongTermCare(
  household: Household,
  settings: LongTermCareSettings | undefined | null,
): ResolvedCare | null {
  if (!settings) return null;
  const stays: ResolvedCare["stays"] = [];
  for (const personId of peopleInCare(household, settings)) {
    const person = household.people.find((p) => p.id === personId);
    if (!person || !Number.isFinite(person.birthYear)) continue;
    const period = carePeriodFor(household, settings, personId);
    const firstYear = (person.birthYear as number) + Math.round(period.startAge);
    stays.push({
      personId,
      firstYear,
      lastYear: firstYear + period.years - 1,
      monthlyCost: CARE_MONTHLY_COST[period.careType ?? settings.careType],
    });
  }
  if (stays.length === 0) return null;
  return {
    inflation: settings.inflation,
    peopleCount: household.people.length,
    stays,
  };
}

/**
 * One year of care: the care cost per person (inflated from the first
 * projection year) and the share of the regular expenses that still applies:
 * all of it with nobody in care, 70% while some of the household is in care,
 * none once everyone is.
 */
export function careForYear(
  care: ResolvedCare | null,
  calendarYear: number,
  projectionStart: number,
): { costMonthlyById: Record<string, number>; expenseShare: number } {
  const costMonthlyById: Record<string, number> = {};
  if (!care) return { costMonthlyById, expenseShare: 1 };
  const growth = Math.pow(1 + care.inflation, Math.max(0, calendarYear - projectionStart));
  let inCare = 0;
  for (const stay of care.stays) {
    if (calendarYear < stay.firstYear || calendarYear > stay.lastYear) continue;
    costMonthlyById[stay.personId] = stay.monthlyCost * growth;
    inCare += 1;
  }
  if (inCare === 0) return { costMonthlyById, expenseShare: 1 };
  return {
    costMonthlyById,
    expenseShare: inCare >= care.peopleCount ? 0 : CARE_EXPENSE_SHARE,
  };
}

/** Expense key for a person's care cost in `ProjectionRow.expenseMonthly`. */
export function careExpenseKey(personId: string): string {
  return `ltc:${personId}`;
}
