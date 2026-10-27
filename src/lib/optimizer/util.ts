import type { Household, OptimizerConfig } from "@/lib/domain/types";
import {
  conversionYears,
  convertibleTotal,
} from "@/lib/engine/convertible";
import {
  projectScenario,
  projectionStartYear,
  projectionYears,
  strategyStartYear,
} from "@/lib/engine/project";
import { allowsRmdYearConversions, personRmdAge } from "@/lib/domain/rmd";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";

export { conversionYears, convertibleTotal };

/** Round a dollar amount to cents (2 decimal places). */
export function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Spread `total` evenly across `years`, each amount rounded to cents. Any
 * leftover cents from division go on the last year so the schedule sums to the
 * rounded total (capped at `convertible`).
 */
export function spreadConversionEvenly(
  total: number,
  years: number,
  convertible: number,
): number[] {
  if (years < 1) return [];
  const cappedCents = Math.round(Math.max(0, Math.min(total, convertible)) * 100);
  const base = Math.floor(cappedCents / years);
  const remainder = cappedCents - base * years;
  return Array.from({ length: years }, (_, i) => {
    const cents = i === years - 1 ? base + remainder : base;
    return cents / 100;
  });
}

/**
 * True when the plan has an explicit per-year schedule (including an all-zero
 * one). Missing or empty means "not set yet" and should default to converting
 * the full convertible balance.
 */
export function hasManualConversionSchedule(household: Household): boolean {
  const schedule = household.optimizer.manualSchedule;
  return schedule != null && schedule.length > 0;
}

/**
 * The optimizer patch behind the "No conversion" button: Manual with every
 * projection year at $0, and no typed early conversions. The all-zero schedule
 * counts as set, so the Manual default spread never fills it back in.
 */
export function noConversionPatch(
  household: Household,
): Partial<OptimizerConfig> {
  return {
    strategy: "manual",
    manualSchedule: Array.from({ length: projectionYears(household) }, () => 0),
    earlyConversions: undefined,
  };
}

/** True when the plan converts nothing: Manual, all $0, no early conversions. */
export function isNoConversion(household: Household): boolean {
  const { strategy, manualSchedule, earlyConversions } = household.optimizer;
  if (strategy !== "manual") return false;
  if (!hasManualConversionSchedule(household)) return false;
  if (manualSchedule!.some((amount) => amount > 0)) return false;
  return !(earlyConversions ?? []).some((c) => c.amount > 0);
}

/**
 * Index of the first projection year a strategy may convert in: the first
 * retirement year. Years before it (a projection that starts before
 * retirement) are manual only: no strategy, default or even spread fills them.
 */
export function strategyStartIndex(household: Household): number {
  const start = projectionStartYear(household);
  const first = strategyStartYear(household);
  if (!Number.isFinite(start) || !Number.isFinite(first)) return 0;
  return Math.max(0, first - start);
}

/**
 * Spread `total` evenly across the conversion years from the first
 * retirement year, with zeros in front for the years before it.
 */
export function spreadFromRetirement(
  household: Household,
  total: number,
  cap: number,
): number[] {
  const years = conversionYears(household);
  const first = Math.min(strategyStartIndex(household), years);
  return [
    ...new Array<number>(first).fill(0),
    ...spreadConversionEvenly(total, years - first, cap),
  ];
}

/** Bisection stops once the level amount is this close, in dollars. */
const LEVEL_PRECISION = 0.01;
/** What may be left in an account when it's called empty, in dollars. */
const LEVEL_EMPTY = 0.01;

/**
 * One steady yearly amount, converted every year of the window (from the
 * strategy's first year), that empties each tax-deferred account by the last
 * year it can convert: the year before its owner's RMD age, or the window's
 * last year with RMD years open. Growth, draws and each year's RMD are
 * counted. Splitting the convertible total evenly instead runs the accounts
 * dry early (the total counts growth to the end); this lasts the window.
 */
export function levelThroughWindow(
  household: Household,
  asOfDate?: string,
): number[] {
  const years = conversionYears(household);
  const first = Math.min(strategyStartIndex(household), years);
  if (years - first < 1) return [];
  // Balances don't depend on the tax tables, so the fallback refs will do.
  const refs = { ...FALLBACK_REFERENCE_DATA, asOfDate };
  const start = projectionStartYear(household);
  const rmdYears = allowsRmdYearConversions(household);
  // Each account's last window year it can convert in.
  const lastIndex: Record<string, number> = {};
  for (const acc of household.accounts) {
    if (acc.kind !== "retirementTaxable") continue;
    const owner = household.people.find((p) => p.id === acc.ownerId);
    const rmdAge = personRmdAge(owner);
    let last = years - 1;
    if (!rmdYears && rmdAge != null && Number.isFinite(owner?.birthYear)) {
      last = Math.min(last, (owner?.birthYear as number) + rmdAge - 1 - start);
    }
    if (last >= first) lastIndex[acc.id] = last;
  }
  const scheduleFor = (amount: number) =>
    Array.from({ length: years }, (_, i) => (i < first ? 0 : amount));
  const leftAtEnd = (amount: number) => {
    const rows = projectScenario(household, padToProjection(household, scheduleFor(amount)), refs);
    let left = 0;
    for (const [id, i] of Object.entries(lastIndex)) {
      left = Math.max(left, rows[i]?.balances[id] ?? 0);
    }
    return left;
  };
  let lo = 0;
  let hi = Math.max(0, convertibleTotal(household, asOfDate));
  if (!(hi > 0)) return [];
  // Round up to the cent so the level amount still empties the accounts.
  const upToCent = (amount: number) => Math.ceil(amount * 100 - 1e-6) / 100;
  if (leftAtEnd(hi) > LEVEL_EMPTY) return scheduleFor(upToCent(hi));
  while (hi - lo > LEVEL_PRECISION) {
    const mid = (lo + hi) / 2;
    if (leftAtEnd(mid) > LEVEL_EMPTY) lo = mid;
    else hi = mid;
  }
  return scheduleFor(upToCent(hi));
}

/**
 * Per-year conversion amounts for the conversion window. When the user has not
 * entered a schedule, defaults to one level amount from the strategy's first
 * year that empties the accounts by the end of the window
 * (`levelThroughWindow`).
 */
export function defaultConversionSchedule(
  household: Household,
  asOfDate?: string,
): number[] {
  return levelThroughWindow(household, asOfDate);
}

/**
 * Dollar target for `even` / `immediate`: optional `convertAmount`, otherwise
 * the full convertible total. Capped unless over-convertible is allowed.
 */
export function conversionTarget(
  household: Household,
  asOfDate?: string,
): number {
  const convertible = convertibleTotal(household, asOfDate);
  const requested = household.optimizer.convertAmount;
  const amount =
    requested != null && requested > 0 ? requested : convertible;
  if (household.optimizer.allowOverConvertible === true) {
    return roundCents(Math.max(0, amount));
  }
  return roundCents(Math.max(0, Math.min(amount, convertible)));
}

/** Pad a conversion-window schedule to the full projection length. */
export function padToProjection(
  household: Household,
  windowAmounts: number[],
): number[] {
  const n = projectionYears(household);
  return Array.from({ length: n }, (_, i) =>
    Math.max(0, windowAmounts[i] ?? 0),
  );
}

/** Zero every year before the first retirement year (manual-only years). */
export function clearBeforeRetirement(
  household: Household,
  schedule: number[],
): number[] {
  const first = strategyStartIndex(household);
  return schedule.map((amount, i) => (i < first ? 0 : amount));
}
