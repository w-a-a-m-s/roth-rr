import type {
  DisabilityBenefitPeriod,
  DisabilityEvent,
  DisabilityInsurancePolicy,
  DisabilityOccupation,
  Household,
  InsurancePolicy,
  InsuranceWaitingDays,
  LifeInsurancePolicy,
  LifePolicyType,
  LongTermCareBenefitYears,
  LongTermCarePolicy,
  LongTermCarePolicyType,
  PermanentLifeType,
  PremiumFrequency,
} from "@/lib/domain/types";
import type { ResolvedDeath } from "@/lib/domain/survivorship";
import { lifeInsurancePayoutRate } from "@/lib/config/lifeInsurancePayout";

// --- Labels and option lists -------------------------------------------------

export const LIFE_POLICY_TYPE_LABELS: Record<LifePolicyType, string> = {
  term: "Term",
  permanent: "Permanent",
};

export const PERMANENT_LIFE_TYPE_LABELS: Record<PermanentLifeType, string> = {
  vul: "VUL (variable universal life)",
  iul: "IUL (indexed universal life)",
  ul: "UL (universal life)",
  whole: "Whole life",
};

export const PREMIUM_FREQUENCY_LABELS: Record<PremiumFrequency, string> = {
  monthly: "Monthly",
  annual: "Annually",
};

export const DISABILITY_OCCUPATION_LABELS: Record<DisabilityOccupation, string> = {
  own: "Own occupation",
  modified: "Modified occupation",
  any: "Any occupation",
};

export const INSURANCE_WAITING_DAYS: InsuranceWaitingDays[] = [30, 60, 90, 180, 365, 730];

export const INSURANCE_WAITING_LABELS: Record<InsuranceWaitingDays, string> = {
  30: "30 days",
  60: "60 days",
  90: "90 days",
  180: "180 days",
  365: "365 days",
  730: "2 years",
};

export const DISABILITY_BENEFIT_PERIODS: DisabilityBenefitPeriod[] = [
  "2y",
  "5y",
  "10y",
  "age65",
  "age67",
];

export const DISABILITY_BENEFIT_PERIOD_LABELS: Record<DisabilityBenefitPeriod, string> = {
  "2y": "2 years",
  "5y": "5 years",
  "10y": "10 years",
  age65: "Until age 65",
  age67: "Until age 67",
};

export const LONG_TERM_CARE_POLICY_TYPE_LABELS: Record<LongTermCarePolicyType, string> = {
  traditional: "Traditional",
  hybrid: "Hybrid (life + LTC)",
  annuity: "Annuity with LTC rider",
};

export const LONG_TERM_CARE_BENEFIT_YEARS: LongTermCareBenefitYears[] = [
  2,
  3,
  4,
  5,
  6,
  "lifetime",
];

export function longTermCareBenefitLabel(years: LongTermCareBenefitYears): string {
  return years === "lifetime" ? "Lifetime" : `${years} years`;
}

export const DEFAULT_TERM_YEARS = 20;
export const DEFAULT_WAITING_DAYS: InsuranceWaitingDays = 90;

// --- Guards (used by `migrateHousehold`) -------------------------------------

const has = <T extends string | number>(list: readonly T[], value: unknown): value is T =>
  list.includes(value as T);

export const isLifePolicyType = (v: unknown): v is LifePolicyType =>
  has(["term", "permanent"] as const, v);
export const isPermanentLifeType = (v: unknown): v is PermanentLifeType =>
  has(["vul", "iul", "ul", "whole"] as const, v);
export const isPremiumFrequency = (v: unknown): v is PremiumFrequency =>
  has(["monthly", "annual"] as const, v);
export const isDisabilityOccupation = (v: unknown): v is DisabilityOccupation =>
  has(["own", "modified", "any"] as const, v);
export const isInsuranceWaitingDays = (v: unknown): v is InsuranceWaitingDays =>
  has(INSURANCE_WAITING_DAYS, v);
export const isDisabilityBenefitPeriod = (v: unknown): v is DisabilityBenefitPeriod =>
  has(DISABILITY_BENEFIT_PERIODS, v);
export const isLongTermCarePolicyType = (v: unknown): v is LongTermCarePolicyType =>
  has(["traditional", "hybrid", "annuity"] as const, v);
export const isLongTermCareBenefitYears = (v: unknown): v is LongTermCareBenefitYears =>
  has(LONG_TERM_CARE_BENEFIT_YEARS, v);

// --- Policy lookups ----------------------------------------------------------

export function lifePolicies(household: Household): LifeInsurancePolicy[] {
  return (household.insurance ?? []).filter(
    (p): p is LifeInsurancePolicy => p.kind === "life",
  );
}

export function disabilityPolicies(household: Household): DisabilityInsurancePolicy[] {
  return (household.insurance ?? []).filter(
    (p): p is DisabilityInsurancePolicy => p.kind === "disability",
  );
}

export function longTermCarePolicies(household: Household): LongTermCarePolicy[] {
  return (household.insurance ?? []).filter(
    (p): p is LongTermCarePolicy => p.kind === "longTermCare",
  );
}

export function insurancePolicy(
  household: Household,
  id: string,
): InsurancePolicy | undefined {
  return (household.insurance ?? []).find((p) => p.id === id);
}

/** Yearly premium of a life policy (for display). */
export function annualPremium(policy: LifeInsurancePolicy): number {
  const premium = Number.isFinite(policy.premium) ? (policy.premium as number) : 0;
  return policy.premiumFrequency === "monthly" ? premium * 12 : premium;
}

/** Last year a term policy covers, or null for permanent (lifetime) cover. */
export function termEndYear(policy: LifeInsurancePolicy): number | null {
  if (policy.policyType !== "term") return null;
  if (!Number.isFinite(policy.issueYear) || !Number.isFinite(policy.termYears)) {
    return null;
  }
  return (policy.issueYear as number) + Math.max(1, Math.round(policy.termYears as number)) - 1;
}

/**
 * Whether the policy pays on a death in `deathYear`. Permanent always does; a
 * term policy only inside its term (missing dates count as covered).
 */
export function lifePolicyInForce(policy: LifeInsurancePolicy, deathYear: number): boolean {
  if (policy.policyType !== "term") return true;
  if (Number.isFinite(policy.issueYear) && deathYear < (policy.issueYear as number)) {
    return false;
  }
  const end = termEndYear(policy);
  return end == null || deathYear <= end;
}

// --- Survivorship: life insurance -------------------------------------------

/** A death benefit turned into lifetime income. */
export interface LifeInsuranceClaim {
  policyId: string;
  /** First year the proceeds are invested and pay income (the year after the death). */
  firstYear: number;
  faceAmount: number;
  /** Payout rate from the insured's age at death. */
  rate: number;
  /** Guaranteed yearly income: `faceAmount * rate`, never reduced. */
  annualIncome: number;
}

/**
 * Life policies on the person who passes that are in force at the death. Each
 * death benefit is invested (growing 8% a year) and pays a fixed lifetime
 * income picked by the insured's age at death from the payout table.
 */
export function lifeInsuranceClaims(
  household: Household,
  death: ResolvedDeath | null,
): LifeInsuranceClaim[] {
  if (!death) return [];
  const person = household.people.find((p) => p.id === death.personId);
  if (!person || !Number.isFinite(person.birthYear)) return [];
  const ageAtDeath = death.year - (person.birthYear as number);
  const rate = lifeInsurancePayoutRate(ageAtDeath);
  const claims: LifeInsuranceClaim[] = [];
  for (const policy of lifePolicies(household)) {
    if (policy.insuredId !== death.personId) continue;
    if (!(policy.faceAmount > 0)) continue;
    if (!lifePolicyInForce(policy, death.year)) continue;
    claims.push({
      policyId: policy.id,
      firstYear: death.year + 1,
      faceAmount: policy.faceAmount,
      rate,
      annualIncome: policy.faceAmount * rate,
    });
  }
  return claims;
}

/** Balance / income key for a life policy's proceeds. */
export function lifeInsuranceKey(policyId: string): string {
  return `life:${policyId}`;
}

// --- Disability --------------------------------------------------------------

/** Waiting period in whole months (30 days is one month, 365 days twelve). */
export function waitingMonths(days: InsuranceWaitingDays | undefined): number {
  const d = isInsuranceWaitingDays(days) ? days : DEFAULT_WAITING_DAYS;
  if (d === 365) return 12;
  if (d === 730) return 24;
  return Math.round(d / 30);
}

/** Months a benefit pays inside calendar year `year`, for months [from, to) counted from Jan 1 of `firstYear`. */
function monthsInYear(firstYear: number, from: number, to: number, year: number): number {
  const yearStart = (year - firstYear) * 12;
  const lo = Math.max(from, yearStart);
  const hi = Math.min(to, yearStart + 12);
  return Math.max(0, hi - lo);
}

/** Default Disability setting: the main person, at their age in the first projection year. */
export function defaultDisabilityEvent(
  household: Household,
  startYear: number,
): DisabilityEvent | null {
  if (household.people.length === 0) return null;
  const personId = household.mainPersonId ?? household.people[0].id;
  const person = household.people.find((p) => p.id === personId);
  if (!person || !Number.isFinite(person.birthYear)) return null;
  return { personId, age: startYear - (person.birthYear as number) };
}

/** The plan's Disability setting if it's still valid, else the default. */
export function disabilityEvent(
  household: Household,
  startYear: number,
): DisabilityEvent | null {
  const saved = household.disability;
  if (saved && resolveDisability(household, saved)) return saved;
  return defaultDisabilityEvent(household, startYear);
}

/** A disability resolved to the calendar year it starts (January 1). */
export interface ResolvedDisability {
  personId: string;
  year: number;
}

export function resolveDisability(
  household: Household,
  event: DisabilityEvent | undefined | null,
): ResolvedDisability | null {
  if (!event || !Number.isFinite(event.age)) return null;
  const person = household.people.find((p) => p.id === event.personId);
  if (!person || !Number.isFinite(person.birthYear)) return null;
  return {
    personId: person.id,
    year: (person.birthYear as number) + Math.round(event.age),
  };
}

/**
 * Months a disability policy pays in `year`. Benefits start after the waiting
 * period (counted from January 1 of the disability year) and run for the
 * benefit period: a number of years, or until the insured turns 65 / 67.
 */
export function disabilityBenefitMonths(
  policy: DisabilityInsurancePolicy,
  birthYear: number,
  disabilityYear: number,
  year: number,
): number {
  if (year < disabilityYear) return 0;
  const from = waitingMonths(policy.waitingDays);
  let to: number;
  switch (policy.benefitPeriod) {
    case "age65":
      to = (birthYear + 65 - disabilityYear) * 12;
      break;
    case "age67":
      to = (birthYear + 67 - disabilityYear) * 12;
      break;
    case "5y":
      to = from + 60;
      break;
    case "10y":
      to = from + 120;
      break;
    default:
      to = from + 24;
  }
  return monthsInYear(disabilityYear, from, to, year);
}

export function disabilityInsuranceKey(policyId: string): string {
  return `di:${policyId}`;
}

// --- Long-term care ----------------------------------------------------------

/**
 * Months a long-term care policy pays in `year` for a stay that starts
 * January 1 of `firstYear` and lasts through `lastYear`. Benefits start after
 * the waiting period, stop when the benefit years run out, and never outlast
 * the care itself.
 */
export function longTermCareBenefitMonths(
  policy: LongTermCarePolicy,
  firstYear: number,
  lastYear: number,
  year: number,
): number {
  const careMonths = (lastYear - firstYear + 1) * 12;
  const from = waitingMonths(policy.waitingDays);
  const to =
    policy.benefitYears === "lifetime"
      ? careMonths
      : Math.min(careMonths, from + policy.benefitYears * 12);
  return monthsInYear(firstYear, from, to, year);
}

export function longTermCareInsuranceKey(policyId: string): string {
  return `ltci:${policyId}`;
}
