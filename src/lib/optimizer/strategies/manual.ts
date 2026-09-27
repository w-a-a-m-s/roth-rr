import type { Household } from "@/lib/domain/types";
import { projectionYears } from "@/lib/engine/project";
import {
  defaultConversionSchedule,
  hasManualConversionSchedule,
} from "@/lib/optimizer/util";

/**
 * Resolve the per-year conversion schedule. Uses the user's explicit amounts
 * when set; otherwise defaults to converting the full convertible balance,
 * spread evenly across the conversion years.
 */
export function manualSchedule(household: Household): number[] {
  const n = projectionYears(household);
  const provided = hasManualConversionSchedule(household)
    ? (household.optimizer.manualSchedule ?? [])
    : defaultConversionSchedule(household);
  return Array.from({ length: n }, (_, i) => Math.max(0, provided[i] ?? 0));
}
