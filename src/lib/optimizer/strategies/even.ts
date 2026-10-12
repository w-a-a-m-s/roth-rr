import type { Household } from "@/lib/domain/types";
import {
  conversionTarget,
  convertibleTotal,
  padToProjection,
  spreadFromRetirement,
} from "@/lib/optimizer/util";

/**
 * Spread the conversion target evenly across the pre-RMD window, from the
 * first retirement year.
 */
export function evenSchedule(
  household: Household,
  asOfDate?: string,
): number[] {
  const target = conversionTarget(household, asOfDate);
  const convertible = convertibleTotal(household, asOfDate);
  const cap =
    household.optimizer.allowOverConvertible === true ? target : convertible;
  return padToProjection(
    household,
    spreadFromRetirement(household, target, cap),
  );
}
