import type { Household } from "@/lib/domain/types";
import {
  conversionTarget,
  convertibleTotal,
  levelThroughWindow,
  padToProjection,
  spreadFromRetirement,
} from "@/lib/optimizer/util";

/**
 * Convert one level amount every year of the window that empties the
 * accounts by its end (see `levelThroughWindow`). With a set amount to
 * convert, spread that amount evenly across the window instead.
 */
export function evenSchedule(
  household: Household,
  asOfDate?: string,
): number[] {
  // With no set amount, one level amount that lasts the whole window (see
  // `levelThroughWindow`).
  const requested = household.optimizer.convertAmount;
  if (!(requested != null && requested > 0)) {
    return padToProjection(household, levelThroughWindow(household, asOfDate));
  }
  const target = conversionTarget(household, asOfDate);
  const convertible = convertibleTotal(household, asOfDate);
  const cap =
    household.optimizer.allowOverConvertible === true ? target : convertible;
  return padToProjection(
    household,
    spreadFromRetirement(household, target, cap),
  );
}
