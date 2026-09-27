import type { Household } from "@/lib/domain/types";
import { conversionTarget, padToProjection } from "@/lib/optimizer/util";

/**
 * Convert the target in the first conversion year. The engine still caps at
 * that year's live pre-RMD tax-deferred balance.
 */
export function immediateSchedule(household: Household): number[] {
  return padToProjection(household, [conversionTarget(household)]);
}
