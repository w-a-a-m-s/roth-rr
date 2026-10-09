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
import { capConversionsToShortfall } from "@/lib/optimizer/shortfall";

/**
 * Resolve the household's optimizer config into a concrete per-year conversion
 * schedule. Every strategy returns the same `number[]` shape so the engine
 * treats them identically. With `maxMonthlyShortfall` set, each year's amount
 * is then lowered so the conversion's tax doesn't leave the year short by more
 * than that per month.
 */
export function buildConversionSchedule(
  household: Household,
  refs: ReferenceData = FALLBACK_REFERENCE_DATA,
): number[] {
  const schedule = strategySchedule(household, refs);
  const limit = household.optimizer.maxMonthlyShortfall;
  if (limit == null) return schedule;
  return capConversionsToShortfall(household, schedule, limit, refs);
}

function strategySchedule(
  household: Household,
  refs: ReferenceData,
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
