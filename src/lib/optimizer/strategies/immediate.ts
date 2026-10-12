import type { Household } from "@/lib/domain/types";
import {
  conversionTarget,
  padToProjection,
  strategyStartIndex,
} from "@/lib/optimizer/util";

/**
 * Convert the target in the first conversion year from retirement on. The
 * engine still caps at that year's live pre-RMD tax-deferred balance.
 */
export function immediateSchedule(
  household: Household,
  asOfDate?: string,
): number[] {
  const window: number[] = new Array(strategyStartIndex(household)).fill(0);
  window.push(conversionTarget(household, asOfDate));
  return padToProjection(household, window);
}
