import type { Household } from "@/lib/domain/types";
import { conversionYears } from "@/lib/engine/convertible";
import { projectionStartYear } from "@/lib/engine/project";
import { runRothScenario } from "@/lib/engine/runScenario";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";
import type { ReferenceData } from "@/lib/externalData/types";
import { convertibleTotal } from "@/lib/optimizer/util";

/**
 * What's still available to convert once `schedule` (and the plan's typed
 * early conversions) have run: the tax-deferred balance left at the end of
 * the last conversion year, never more than the convertible total minus
 * what's scheduled.
 *
 * The convertible total grows every balance untouched to the end of the
 * window, so it counts growth on money that a schedule converts early. A
 * schedule that empties the accounts in its first year would still show
 * that growth as left to convert; the Roth run's own balance shows none.
 */
export function convertibleLeft(
  household: Household,
  schedule: number[],
  scheduledTotal: number,
  refs: ReferenceData = FALLBACK_REFERENCE_DATA,
): number {
  const byTotal = Math.max(0, convertibleTotal(household, refs.asOfDate) - scheduledTotal);
  if (scheduledTotal <= 0) return byTotal;
  const lastYear = projectionStartYear(household) + conversionYears(household) - 1;
  const rows = runRothScenario(household, schedule, "Left", refs).rows;
  const row = rows.find((r) => r.calendarYear === lastYear);
  if (!row) return byTotal;
  return Math.min(byTotal, Math.max(0, row.retirementTotal));
}
