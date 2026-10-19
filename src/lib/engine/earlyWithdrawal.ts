import type { Account, Household, Person } from "@/lib/domain/types";
import { hasPassed, type ResolvedDeath } from "@/lib/domain/survivorship";

/** IRC 72(t): 10% additional tax on an early distribution. */
export const EARLY_WITHDRAWAL_PENALTY_RATE = 0.1;
/**
 * First age, by calendar year, that's surely past 59½. The plan has birth
 * years only, so the year a person turns 59 counts as early (they may not
 * be 59½ until the next year).
 */
export const PENALTY_FREE_AGE = 60;
/** Rule of 55: leaving the employer in or after the year you turn 55. */
export const SEPARATION_FREE_AGE = 55;

/** Employer plans the Rule of 55 covers (not IRAs, and not a 457(b)). */
const EMPLOYER_PLANS = new Set(["401k", "403b", "tsp", "drop"]);

/** Whether the plan lets the app take money a 10% penalty applies to. */
export function allowsEarlyWithdrawals(household: Pick<Household, "assumptions">): boolean {
  return household.assumptions?.allowEarlyWithdrawals === true;
}

/**
 * Whether a withdrawal from `acc` in `calendarYear` owes the 10% penalty.
 * Tax-deferred and Roth accounts only. No penalty once the owner is past
 * 59½, from a governmental 457(b), from an employer plan after leaving work
 * in or after the year they turn 55, after the owner's death (the heir's
 * money) or once the owner is disabled. A Roth is treated like an IRA: the
 * plan doesn't track what was contributed, so the whole draw counts.
 */
export function owesEarlyWithdrawalPenalty(
  acc: Account,
  people: Person[],
  calendarYear: number,
  context: {
    death?: ResolvedDeath | null;
    disability?: { personId: string; year: number } | null;
  } = {},
): boolean {
  if (acc.kind !== "retirementTaxable" && acc.kind !== "rothTaxFree") return false;
  if (hasPassed(context.death ?? null, acc.ownerId, calendarYear)) return false;
  const disability = context.disability;
  if (disability && disability.personId === acc.ownerId && calendarYear >= disability.year) {
    return false;
  }
  const owner = people.find((p) => p.id === acc.ownerId);
  if (owner?.birthYear == null || !Number.isFinite(owner.birthYear)) return false;
  const age = calendarYear - owner.birthYear;
  if (age >= PENALTY_FREE_AGE) return false;
  if (acc.kind === "rothTaxFree") return true;
  if (acc.retirementType === "457b") return false;
  const type = acc.retirementType ?? "ira";
  const retired = owner.retirementYear;
  if (
    EMPLOYER_PLANS.has(type) &&
    retired != null &&
    retired - owner.birthYear >= SEPARATION_FREE_AGE &&
    calendarYear >= retired
  ) {
    return false;
  }
  return true;
}
