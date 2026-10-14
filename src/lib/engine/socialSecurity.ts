import type {
  Household,
  IncomeSource,
  Person,
  SocialSecurityClaim,
} from "@/lib/domain/types";
import { projectionStartYear } from "@/lib/engine/project";

/** One way to claim: the plan's own Social Security, or a claim at another age. */
export interface ClaimOption {
  key: string;
  label: string;
  claimYear: number;
  claimAge: number;
  /** Monthly benefit in the claim year. */
  monthlyAtClaim: number;
}

export interface BreakevenYear {
  year: number;
  age: number;
  /** Benefit paid this year, per option. */
  annual: number[];
  /** Benefits paid from the first claim through this year, per option. */
  cumulative: number[];
}

/** When a later (or earlier) claim catches up with the plan's claim. */
export interface Crossover {
  /** Index into `options` (never 0, the plan). */
  option: number;
  /** First year this option's running total passes the plan's, or null. */
  year: number | null;
  age: number | null;
  /** Running total at the final age, and how far it is ahead of the plan. */
  totalAtEnd: number;
  differenceAtEnd: number;
}

export interface SocialSecurityBreakeven {
  personId: string;
  /** Yearly Social Security COLA, from the plan's income. */
  cola: number;
  /** The plan's claim first, then the other ages in age order. */
  options: ClaimOption[];
  years: BreakevenYear[];
  crossovers: Crossover[];
}

/** The plan's Social Security income for `personId`, if there is one. */
export function planSocialSecurity(
  household: Household,
  personId: string,
): IncomeSource | undefined {
  return household.incomes.find(
    (i) => i.kind === "socialSecurity" && i.ownerId === personId,
  );
}

/** People with a Social Security income in the plan and a birth year. */
export function socialSecurityPeople(household: Household): Person[] {
  return household.people.filter(
    (p) => Number.isFinite(p.birthYear) && planSocialSecurity(household, p.id),
  );
}

/** Other claiming ages a person can compare with the plan's own claim. */
export const MAX_SOCIAL_SECURITY_CLAIMS = 2;

/** The person's claims as entered, up to the limit. */
export function enteredClaims(
  household: Household,
  personId: string,
): SocialSecurityClaim[] {
  return (household.socialSecurityClaims ?? [])
    .filter((c) => c.personId === personId)
    .slice(0, MAX_SOCIAL_SECURITY_CLAIMS);
}

/** The claims entered for `personId` that can run: a real age and amount. */
export function claimsFor(
  household: Household,
  personId: string,
): SocialSecurityClaim[] {
  return enteredClaims(household, personId)
    .filter((c) => Number.isFinite(c.age) && c.monthlyAmount > 0)
    .sort((a, b) => a.age - b.age);
}

function benefitInYear(option: ClaimOption, year: number, cola: number): number {
  if (year < option.claimYear) return 0;
  return option.monthlyAtClaim * 12 * Math.pow(1 + cola, year - option.claimYear);
}

/**
 * Year-by-year Social Security under the plan's claim and each other claiming
 * age, with running totals through the person's final age, and the year each
 * other claim's running total crosses the plan's. Benefits are before tax and
 * not discounted: the classic breakeven.
 */
export function socialSecurityBreakeven(
  household: Household,
  personId: string,
): SocialSecurityBreakeven | null {
  const person = household.people.find((p) => p.id === personId);
  const income = planSocialSecurity(household, personId);
  if (!person || !income || !Number.isFinite(person.birthYear)) return null;
  const birthYear = person.birthYear as number;
  const cola = Number.isFinite(income.growthRate) ? income.growthRate : 0;
  const planYear = income.startYear ?? projectionStartYear(household);

  const options: ClaimOption[] = [
    {
      key: income.id,
      label: `Plan: claim at ${planYear - birthYear}`,
      claimYear: planYear,
      claimAge: planYear - birthYear,
      monthlyAtClaim: income.monthlyAmount || 0,
    },
    ...claimsFor(household, personId).map((c) => ({
      key: c.id,
      label: `Claim at ${Math.round(c.age)}`,
      claimYear: birthYear + Math.round(c.age),
      claimAge: Math.round(c.age),
      monthlyAtClaim: c.monthlyAmount,
    })),
  ];

  const first = Math.min(...options.map((o) => o.claimYear));
  const last = birthYear + household.assumptions.finalAge;
  const years: BreakevenYear[] = [];
  const running = options.map(() => 0);
  for (let year = first; year <= last; year++) {
    const annual = options.map((o) => benefitInYear(o, year, cola));
    annual.forEach((a, i) => (running[i] += a));
    years.push({ year, age: year - birthYear, annual, cumulative: [...running] });
  }

  const crossovers: Crossover[] = options.slice(1).map((_, k) => {
    const option = k + 1;
    const diff = (y: BreakevenYear) => y.cumulative[option] - y.cumulative[0];
    // The side the option starts on (behind for a later claim), then the
    // first year it reaches the other side.
    const start = years.find((y) => Math.abs(diff(y)) > 0.005);
    const behind = start != null && diff(start) < 0;
    const cross =
      start == null
        ? undefined
        : years.find(
            (y) => y.year > start.year && (behind ? diff(y) >= 0 : diff(y) <= 0),
          );
    const end = years[years.length - 1];
    return {
      option,
      year: cross?.year ?? null,
      age: cross?.age ?? null,
      totalAtEnd: end?.cumulative[option] ?? 0,
      differenceAtEnd: end ? diff(end) : 0,
    };
  });

  return { personId, cola, options, years, crossovers };
}
