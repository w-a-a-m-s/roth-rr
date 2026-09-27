import type { Household } from "@/lib/domain/types";
import {
  conversionTarget,
  conversionYears,
  convertibleTotal,
  padToProjection,
  spreadConversionEvenly,
} from "@/lib/optimizer/util";

/** Spread the conversion target evenly across the pre-RMD window. */
export function evenSchedule(household: Household): number[] {
  const years = conversionYears(household);
  const target = conversionTarget(household);
  const convertible = convertibleTotal(household);
  const cap =
    household.optimizer.allowOverConvertible === true ? target : convertible;
  return padToProjection(
    household,
    spreadConversionEvenly(target, years, cap),
  );
}
