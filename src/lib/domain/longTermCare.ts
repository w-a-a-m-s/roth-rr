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

/** An LTC rider doubles an account's lifetime income during care... */
export const LTC_RIDER_INCOME_MULTIPLIER = 2;
/** ...and what's left in it grows 4% a year instead of 8%. */
export const LTC_RIDER_GROWTH = 0.04;
export const DEFAULT_CARE_START_AGE = 80;

/**
 * Share of the household's other expenses that still applies while someone is
 * in care, by the care each spouse gets. Order doesn't matter: one spouse at
 * home and the other in a nursing home is 50% whichever spouse is which. A
 * single person has their own table, `INDIVIDUAL_CARE_EXPENSE_SHARES`.
 */
export const CARE_EXPENSE_SHARES = {
  home: 0.75,
  nursing: 0.6,
  homeHome: 0.55,
  homeNursing: 0.5,
  nursingNursing: 0,
} as const;

/**
 * The same for a one-person household: nobody is left at home, so a nursing
 * home replaces the other expenses entirely.
 */
export const INDIVIDUAL_CARE_EXPENSE_SHARES: Record<CareType, number> = {
  home: 0.7,
  nursing: 0,
};

/**
 * Share of other expenses for the care types of the people in care this year.
 * `individual` is a one-person household.
 */
export function careExpenseShare(types: CareType[], individual = false): number {
  if (types.length === 0) return 1;
  if (individual) return INDIVIDUAL_CARE_EXPENSE_SHARES[types[0]];
  const nursing = types.filter((t) => t === "nursing").length;
  if (types.length === 1) return nursing ? CARE_EXPENSE_SHARES.nursing : CARE_EXPENSE_SHARES.home;
  if (nursing === 0) return CARE_EXPENSE_SHARES.homeHome;
  if (nursing === 1) return CARE_EXPENSE_SHARES.homeNursing;
  return CARE_EXPENSE_SHARES.nursingNursing;
}

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
    rider: saved.rider === true,
    ...(saved.riderAccountIds
      ? {
          riderAccountIds: saved.riderAccountIds.filter((id) =>
            household.accounts.some((a) => a.id === id),
          ),
        }
      : {}),
  };
}

/** Whether the LTC rider is on this account. */
export function hasCareRider(settings: LongTermCareSettings | null | undefined, accountId: string): boolean {
  if (!settings?.rider) return false;
  return settings.riderAccountIds == null || settings.riderAccountIds.includes(accountId);
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
  /** One-person household: other expenses follow `INDIVIDUAL_CARE_EXPENSE_SHARES`. */
  individual: boolean;
  /** Accounts with the LTC rider on (`hasCareRider`). */
  riderAccountIds: string[];
  /** Each stay's monthly cost is in first-projection-year dollars. */
  stays: {
    personId: string;
    firstYear: number;
    lastYear: number;
    careType: CareType;
    monthlyCost: number;
  }[];
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
    const careType = period.careType ?? settings.careType;
    stays.push({
      personId,
      firstYear,
      lastYear: firstYear + period.years - 1,
      careType,
      monthlyCost: CARE_MONTHLY_COST[careType],
    });
  }
  if (stays.length === 0) return null;
  return {
    inflation: settings.inflation,
    individual: household.people.length === 1,
    riderAccountIds: household.accounts.filter((a) => hasCareRider(settings, a.id)).map((a) => a.id),
    stays,
  };
}

/**
 * One year of care: the care cost per person (inflated from the first
 * projection year) and the share of the regular expenses that still applies:
 * all of it with nobody in care, otherwise `careExpenseShare` of the care
 * types of the people in care that year (the individual table for a
 * one-person household).
 */
export function careForYear(
  care: ResolvedCare | null,
  calendarYear: number,
  projectionStart: number,
): { costMonthlyById: Record<string, number>; expenseShare: number } {
  const costMonthlyById: Record<string, number> = {};
  if (!care) return { costMonthlyById, expenseShare: 1 };
  const growth = Math.pow(1 + care.inflation, Math.max(0, calendarYear - projectionStart));
  const types: CareType[] = [];
  for (const stay of care.stays) {
    if (calendarYear < stay.firstYear || calendarYear > stay.lastYear) continue;
    costMonthlyById[stay.personId] = stay.monthlyCost * growth;
    types.push(stay.careType);
  }
  return { costMonthlyById, expenseShare: careExpenseShare(types, care.individual) };
}

/** Expense key for a person's care cost in `ProjectionRow.expenseMonthly`. */
export function careExpenseKey(personId: string): string {
  return `ltc:${personId}`;
}
