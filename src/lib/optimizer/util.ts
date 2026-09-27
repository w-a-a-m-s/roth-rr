import type { Household } from "@/lib/domain/types";
import {
  conversionYears,
  convertibleTotal,
} from "@/lib/engine/convertible";
import { projectionYears } from "@/lib/engine/project";

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
 * Per-year conversion amounts for the conversion window. When the user has not
 * entered a schedule, defaults to the full convertible total spread evenly.
 */
export function defaultConversionSchedule(household: Household): number[] {
  const years = conversionYears(household);
  const convertible = convertibleTotal(household);
  return spreadConversionEvenly(convertible, years, convertible);
}

/**
 * Dollar target for `even` / `immediate`: optional `convertAmount`, otherwise
 * the full convertible total. Capped unless over-convertible is allowed.
 */
export function conversionTarget(household: Household): number {
  const convertible = convertibleTotal(household);
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
