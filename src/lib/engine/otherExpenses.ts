import type { Household, LifeInsurancePolicy } from "@/lib/domain/types";
import { hasPassed, type ResolvedDeath } from "@/lib/domain/survivorship";
import { termEndYear } from "@/lib/domain/insurance";
import {
  carCashFlows,
  carDecisionFor,
  compareCarOptions,
  type CarOptionKey,
} from "@/lib/engine/carDecision";

/**
 * Whether the plan counts costs entered on other steps as expenses
 * (`Household.includeOtherExpenses`, the Expenses step switch): life
 * insurance premiums, homestead loan payments and the Car analysis.
 */
export function includesOtherExpenses(household: Pick<Household, "includeOtherExpenses">): boolean {
  return household.includeOtherExpenses === true;
}

/**
 * Whether the plan counts Medicare Part B premiums (IRMAA included) as an
 * expense (`Household.includeMedicarePremiums`, the Expenses step switch).
 */
export function includesMedicarePremiums(
  household: Pick<Household, "includeMedicarePremiums">,
): boolean {
  return household.includeMedicarePremiums === true;
}

/** Expense key for a person's Medicare Part B premiums in a projection row. */
export function medicareExpenseKey(personId: string): string {
  return `medicare:${personId}`;
}

/** Expense key for a policy's premiums in a projection row. */
export function premiumExpenseKey(policyId: string): string {
  return `premium:${policyId}`;
}

/** Expense key for the Car analysis's costs in a projection row. */
export const CAR_EXPENSE_KEY = "car";

function annualPremium(policy: LifeInsurancePolicy): number {
  const premium = Number.isFinite(policy.premium) ? Math.max(0, policy.premium as number) : 0;
  return policy.premiumFrequency === "annual" ? premium : premium * 12;
}

/**
 * Life insurance premiums paid in `calendarYear`, by policy: a term policy
 * from its issue year through the end of its term (missing dates count as
 * in force), a permanent one for life. Nothing after the insured passes.
 */
export function lifePremiumsForYear(
  household: Household,
  calendarYear: number,
  death: ResolvedDeath | null,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const policy of household.insurance ?? []) {
    if (policy.kind !== "life") continue;
    const annual = annualPremium(policy);
    if (!(annual > 0)) continue;
    if (hasPassed(death, policy.insuredId, calendarYear)) continue;
    if (policy.policyType === "term") {
      if (Number.isFinite(policy.issueYear) && calendarYear < (policy.issueYear as number)) continue;
      const end = termEndYear(policy);
      if (end != null && calendarYear > end) continue;
    }
    out[policy.id] = annual;
  }
  return out;
}

/**
 * The Car analysis's yearly costs, by calendar year, once it has been filled
 * in: the option it recommends (lowest net cost counting lost growth),
 * starting in the plan's first year and lasting the analysis's years.
 */
export function carCostsByYear(
  household: Household,
  planStart: number,
): { option: CarOptionKey; byYear: Record<number, number> } | null {
  if (!household.carDecision) return null;
  const decision = carDecisionFor(household);
  const { best } = compareCarOptions(decision);
  const byYear: Record<number, number> = {};
  carCashFlows(best, decision).forEach((amount, i) => {
    if (!(amount > 0)) return;
    const year = planStart + i;
    byYear[year] = (byYear[year] ?? 0) + amount;
  });
  return { option: best, byYear };
}
