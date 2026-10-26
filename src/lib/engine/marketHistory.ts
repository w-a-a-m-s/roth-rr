import type { Account, AccountKind, Household, ReturnSource } from "@/lib/domain/types";
import {
  SP500_FIRST_YEAR,
  SP500_LAST_YEAR,
  balancedReturn,
  sp500Return,
} from "@/lib/config/marketHistory";
import { DEFAULT_ACCOUNT_GROWTH } from "@/lib/config/defaults";

/**
 * Accounts invested in the market, which follow the S&P 500 in Market
 * history mode. Savings, CDs, annuities and DPP / MLP accounts keep their
 * own fixed rate.
 */
export const MARKET_ACCOUNT_KINDS: AccountKind[] = ["retirementTaxable", "rothTaxFree", "investment"];

/** Whether the plan grows its market accounts by history (S&P 500 or the 50 / 50 mix). */
export function usesMarketHistory(household: Pick<Household, "assumptions">): boolean {
  const mode = household.assumptions?.returnMode;
  return mode === "history" || mode === "balanced";
}

/**
 * What an account's return follows: its own tag, else the plan's Returns
 * for a market account, else its fixed rate.
 */
export function accountReturnSource(
  household: Pick<Household, "assumptions">,
  account: Pick<Account, "kind" | "returnSource">,
): ReturnSource {
  if (account.returnSource) return account.returnSource;
  if (!MARKET_ACCOUNT_KINDS.includes(account.kind)) return "fixed";
  const mode = household.assumptions?.returnMode;
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
