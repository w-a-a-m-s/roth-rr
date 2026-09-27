import type { Household } from "@/lib/domain/types";
import type { Comparison } from "@/lib/engine/types";
import { compareScenarios } from "@/lib/engine/runScenario";
import { buildConversionSchedule } from "@/lib/optimizer";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";
import type { ReferenceData } from "@/lib/externalData/types";

/**
 * Top-level entry point: resolve the conversion strategy into a schedule and
 * compare the no-conversion baseline against the Roth-conversion scenario.
 * Pass hydrated `refs` from the client store; tests use the committed fallback.
 */
export function calculate(
  household: Household,
  refs: ReferenceData = FALLBACK_REFERENCE_DATA,
): Comparison {
  const schedule = buildConversionSchedule(household, refs);
  return compareScenarios(household, schedule, refs);
}
