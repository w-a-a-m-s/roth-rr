import type { Account, AccountKind, Household } from "@/lib/domain/types";
import { SP500_FIRST_YEAR, SP500_LAST_YEAR, sp500Return } from "@/lib/config/marketHistory";
import { DEFAULT_ACCOUNT_GROWTH } from "@/lib/config/defaults";

/**
 * Accounts invested in the market, which follow the S&P 500 in Market
 * history mode. Savings, CDs, annuities and DPP / MLP accounts keep their
 * own fixed rate.
 */
export const MARKET_ACCOUNT_KINDS: AccountKind[] = ["retirementTaxable", "rothTaxFree", "investment"];

/** Whether the plan grows market accounts by S&P 500 history. */
export function usesMarketHistory(household: Pick<Household, "assumptions">): boolean {
  return household.assumptions?.returnMode === "history";
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
 * year): the S&P 500's return for that year in Market history mode when the
 * account is market-invested, else its own fixed rate. Years before the plan
 * starts (a negative index) always use the fixed rate.
 */
export function accountGrowthForYear(
  household: Pick<Household, "assumptions">,
  account: Account,
  planYearIndex: number,
): number {
  if (planYearIndex < 0 || !usesMarketHistory(household)) return fixedRate(account);
  if (!MARKET_ACCOUNT_KINDS.includes(account.kind)) return fixedRate(account);
  return sp500Return(historyYearFor(household, planYearIndex)) ?? fixedRate(account);
}
