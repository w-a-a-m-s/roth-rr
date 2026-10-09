import type { Household } from "@/lib/domain/types";
import {
  conversionTarget,
  conversionYears,
  convertibleTotal,
  padToProjection,
  spreadConversionEvenly,
} from "@/lib/optimizer/util";

/** Spread the conversion target evenly across the pre-RMD window. */
export function evenSchedule(
  household: Household,
  asOfDate?: string,
): number[] {
  const years = conversionYears(household);
  const target = conversionTarget(household, asOfDate);
  const convertible = convertibleTotal(household, asOfDate);
  const cap =
    household.optimizer.allowOverConvertible === true ? target : convertible;
  return padToProjection(
    household,
    spreadConversionEvenly(target, years, cap),
  );
}
