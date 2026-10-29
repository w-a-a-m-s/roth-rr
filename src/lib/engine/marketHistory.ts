import type {
  Account,
  AccountKind,
  Assumptions,
  Household,
  ReturnMode,
  ReturnSource,
} from "@/lib/domain/types";
import {
  SP500_FIRST_YEAR,
  SP500_LAST_YEAR,
  balancedReturn,
  sp500Return,
} from "@/lib/config/marketHistory";
import { DEFAULT_ACCOUNT_GROWTH } from "@/lib/config/defaults";

/**
 * The groups the Household step's Returns sets, one per market account kind.
 * Savings, CDs, annuities and DPP / MLP accounts keep their own fixed rate
 * unless the account picks history itself.
 */
export type ReturnGroup = "retirement" | "roth" | "investment";

export const RETURN_GROUPS: ReturnGroup[] = ["retirement", "roth", "investment"];

/** The account kind each Returns group covers. */
export const RETURN_GROUP_KIND: Record<ReturnGroup, AccountKind> = {
  retirement: "retirementTaxable",
  roth: "rothTaxFree",
  investment: "investment",
};

/** The assumption that holds each group's Returns. */
export const RETURN_GROUP_KEY = {
  retirement: "retirementReturnMode",
  roth: "rothReturnMode",
  investment: "investmentReturnMode",
} as const satisfies Record<ReturnGroup, keyof Assumptions>;

/** The assumption that holds each group's fixed return. */
export const RETURN_GROUP_RATE_KEY = {
  retirement: "retirementFixedRate",
  roth: "rothFixedRate",
  investment: "investmentFixedRate",
} as const satisfies Record<ReturnGroup, keyof Assumptions>;

/** A group's fixed return when the plan set one. */
export function groupFixedRate(
  household: Pick<Household, "assumptions">,
  group: ReturnGroup,
): number | undefined {
  const rate = household.assumptions?.[RETURN_GROUP_RATE_KEY[group]];
  return Number.isFinite(rate) ? rate : undefined;
}

/** The fixed return a new account of this kind starts at, when its group has one. */
export function groupFixedRateForKind(
  household: Pick<Household, "assumptions">,
  kind: AccountKind,
): number | undefined {
  const group = returnGroupOf(kind);
  return group ? groupFixedRate(household, group) : undefined;
}

export function isReturnMode(value: unknown): value is ReturnMode {
  return value === "fixed" || value === "history" || value === "balanced";
}

/** A group's Returns: fixed when unset. */
export function returnModeFor(
  household: Pick<Household, "assumptions">,
  group: ReturnGroup,
): ReturnMode {
  const mode = household.assumptions?.[RETURN_GROUP_KEY[group]];
  return isReturnMode(mode) ? mode : "fixed";
}

export function returnGroupOf(kind: AccountKind): ReturnGroup | null {
  return RETURN_GROUPS.find((group) => RETURN_GROUP_KIND[group] === kind) ?? null;
}

/** Whether any group grows by history (S&P 500 or the 50 / 50 mix). */
export function usesMarketHistory(household: Pick<Household, "assumptions">): boolean {
  return RETURN_GROUPS.some((group) => returnModeFor(household, group) !== "fixed");
}

/**
 * What an account's return follows: its own tag, else its group's Returns
 * for a market account, else its fixed rate.
 */
export function accountReturnSource(
  household: Pick<Household, "assumptions">,
  account: Pick<Account, "kind" | "returnSource">,
): ReturnSource {
  if (account.returnSource) return account.returnSource;
  const group = returnGroupOf(account.kind);
  if (!group) return "fixed";
  const mode = returnModeFor(household, group);
  if (mode === "history") return "sp500";
  if (mode === "balanced") return "balanced";
  return "fixed";
}

/** Whether any account in the plan follows history (so the start year matters). */
export function anyHistoryReturns(household: Pick<Household, "assumptions" | "accounts">): boolean {
  return household.accounts.some((acc) => accountReturnSource(household, acc) !== "fixed");
}

/** The first S&P 500 year the plan uses (its setting, or 1950). */
export function historyStartYear(household: Pick<Household, "assumptions">): number {
  const year = household.assumptions?.historyStartYear;
  if (year == null || !Number.isInteger(year)) return SP500_FIRST_YEAR;
  return Math.min(SP500_LAST_YEAR, Math.max(SP500_FIRST_YEAR, year));
}

/**
 * The S&P 500 year a plan year uses: the start year in the plan's first
 * year, then one year later each year. Past the last year of data it wraps
 * back to the first (1950) and keeps going.
 */
export function historyYearFor(household: Pick<Household, "assumptions">, planYearIndex: number): number {
  const span = SP500_LAST_YEAR - SP500_FIRST_YEAR + 1;
  const offset = historyStartYear(household) - SP500_FIRST_YEAR + Math.max(0, planYearIndex);
  return SP500_FIRST_YEAR + (offset % span);
}

function fixedRate(account: Account): number {
  return Number.isFinite(account.growthRate)
    ? account.growthRate
    : DEFAULT_ACCOUNT_GROWTH[account.kind] ?? 0;
}

/**
 * An account's growth in plan year `planYearIndex` (0 is the plan's first
 * year): that history year's S&P 500 or 50 / 50 return when the account
 * follows one (`accountReturnSource`), else its own fixed rate. Years before
 * the plan starts (a negative index) always use the fixed rate.
 */
export function accountGrowthForYear(
  household: Pick<Household, "assumptions">,
  account: Account,
  planYearIndex: number,
): number {
  if (planYearIndex < 0) return fixedRate(account);
  const source = accountReturnSource(household, account);
  if (source === "fixed") return fixedRate(account);
  const year = historyYearFor(household, planYearIndex);
  const historical = source === "balanced" ? balancedReturn(year) : sp500Return(year);
  return historical ?? fixedRate(account);
}
