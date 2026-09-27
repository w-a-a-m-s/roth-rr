import type { Account, Deposit } from "@/lib/domain/types";
import { isDropRetirementAccount } from "@/lib/domain/household";
import { DEFAULT_ACCOUNT_GROWTH } from "@/lib/config/defaults";

/**
 * Deposits are money paid into an account, and they split into two worlds
 * around the projection start year (the earliest retirement year).
 *
 * The engine treats `account.balance` as January 1 of the first projection
 * year, and inside the loop it grows balances first and adds deposits after, so
 * a deposit made in year `Y` effectively lands on January 1 of `Y + 1`.
 *
 * Deposits dated *before* the start year happen in years the projection never
 * runs (someone still working who contributes until they retire). They can't
 * touch cash flow or taxes, so {@link preStartDepositValue} compounds them
 * forward into the opening balance using that same convention (DROP adds
 * principal only: growth starts the year after the owner retires). Deposits
 * from the start year on run through {@link depositAmountForYear} inside the
 * loop.
 */

function accountGrowthRate(account: Account): number {
  return Number.isFinite(account.growthRate)
    ? account.growthRate
    : DEFAULT_ACCOUNT_GROWTH[account.kind] ?? 0;
}

/** Last year this deposit can pay in, or `null` when it runs open-ended. */
function depositLastYear(deposit: Deposit): number | null {
  if (deposit.frequency === "oneTime") return deposit.startYear;
  if (deposit.endYear != null && Number.isFinite(deposit.endYear)) {
    return deposit.endYear;
  }
  return null;
}

function isDepositActive(deposit: Deposit, calendarYear: number): boolean {
  if (!Number.isFinite(deposit.startYear)) return false;
  if (calendarYear < deposit.startYear) return false;
  const last = depositLastYear(deposit);
  return last == null || calendarYear <= last;
}

/**
 * Dollars paid in during `calendarYear` (0 when the deposit isn't running).
 * The amount is flat for the life of the deposit.
 */
export function depositAmountForYear(
  deposit: Deposit,
  calendarYear: number,
): number {
  if (!isDepositActive(deposit, calendarYear)) return 0;
  const amount = Number.isFinite(deposit.amount) ? deposit.amount : 0;
  if (amount <= 0) return 0;
  return deposit.frequency === "monthly" ? amount * 12 : amount;
}

/**
 * Walk every year a deposit pays in, from its start through `throughYear`.
 * Open-ended deposits stop at `throughYear`, so the loop is always bounded.
 */
function eachDepositYear(
  deposit: Deposit,
  throughYear: number,
  visit: (calendarYear: number, amount: number) => void,
): void {
  if (!Number.isFinite(deposit.startYear) || !Number.isFinite(throughYear)) {
    return;
  }
  const last = depositLastYear(deposit);
  const end = last == null ? throughYear : Math.min(last, throughYear);
  for (let year = deposit.startYear; year <= end; year++) {
    const amount = depositAmountForYear(deposit, year);
    if (amount > 0) visit(year, amount);
  }
}

/** Principal paid into `account` in every year up to and including `throughYear`. */
export function depositPrincipalThrough(
  account: Account,
  throughYear: number,
): number {
  let total = 0;
  for (const deposit of account.deposits ?? []) {
    eachDepositYear(deposit, throughYear, (_year, amount) => {
      total += amount;
    });
  }
  return total;
}

/** Principal paid into `account` before the projection starts, ignoring growth. */
export function preStartDepositPrincipal(
  account: Account,
  startYear: number,
): number {
  if (!Number.isFinite(startYear)) return 0;
  return depositPrincipalThrough(account, startYear - 1);
}

/**
 * Value at January 1 of `startYear` of every deposit made before the plan
 * begins. A deposit in year `Y` lands on January 1 of `Y + 1`, so it compounds
 * for `startYear - Y - 1` years at the account's growth rate.
 */
export function preStartDepositValue(
  account: Account,
  startYear: number,
): number {
  if (!Number.isFinite(startYear)) return 0;
  // DROP does not compound until the year after the owner retires, which is
  // never before the plan starts, so pre-start deposits add principal only.
  const rate = isDropRetirementAccount(account) ? 0 : accountGrowthRate(account);
  let total = 0;
  for (const deposit of account.deposits ?? []) {
    eachDepositYear(deposit, startYear - 1, (year, amount) => {
      total += amount * Math.pow(1 + rate, startYear - year - 1);
    });
  }
  return total;
}