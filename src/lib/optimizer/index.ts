import type { Household } from "@/lib/domain/types";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";
import type { ReferenceData } from "@/lib/externalData/types";
import { evenSchedule } from "@/lib/optimizer/strategies/even";
import { fillBracketSchedule } from "@/lib/optimizer/strategies/fillBracket";
import { immediateSchedule } from "@/lib/optimizer/strategies/immediate";
import { irmaaSchedule } from "@/lib/optimizer/strategies/irmaa";
import { depleteByRmdSchedule } from "@/lib/optimizer/strategies/depleteByRmd";
import { manualSchedule } from "@/lib/optimizer/strategies/manual";
import { minTaxSchedule } from "@/lib/optimizer/strategies/minTax";

/**
 * Resolve the household's optimizer config into a concrete per-year conversion
 * schedule. Every strategy returns the same `number[]` shape so the engine
 * treats them identically.
 */
export function buildConversionSchedule(
  household: Household,
  refs: ReferenceData = FALLBACK_REFERENCE_DATA,
): number[] {
  switch (household.optimizer.strategy) {
    case "immediate":
      return immediateSchedule(household);
    case "fillBracket":
      return fillBracketSchedule(household, refs);
    case "irmaa":
      return irmaaSchedule(household, refs);
    case "depleteByRmd":
      return depleteByRmdSchedule(household);
    case "minTax":
      return minTaxSchedule(household, refs);
    case "manual":
      return manualSchedule(household);
    case "even":
    default:
      return evenSchedule(household);
  }
}
