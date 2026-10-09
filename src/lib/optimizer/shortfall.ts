import type { Household } from "@/lib/domain/types";
import { projectScenario } from "@/lib/engine/project";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";
import type { ReferenceData } from "@/lib/externalData/types";

/** Monthly shortfall the shortfall toggle allows when it's turned on. */
export const DEFAULT_MAX_MONTHLY_SHORTFALL = 1000;

/** Bisection stops once the bounds are this close, in dollars. */
const PRECISION = 1;

/**
 * Lower each year's conversion until that year's monthly shortfall (a
 * negative Surplus) is no more than `maxMonthlyShortfall`. Years are fixed in
 * order because a conversion changes later balances, RMDs, and IRMAA.
 * A year that is already short by more than the limit with no conversion
 * converts nothing.
 */
export function capConversionsToShortfall(
  household: Household,
  schedule: number[],
  maxMonthlyShortfall: number,
  refs: ReferenceData = FALLBACK_REFERENCE_DATA,
): number[] {
  const floor = -Math.max(0, maxMonthlyShortfall);
  const capped = schedule.slice();
  const fits = (trial: number[], i: number) =>
    projectScenario(household, trial, refs)[i].surplus >= floor;

  let rows = projectScenario(household, capped, refs);
  for (let i = 0; i < capped.length && i < rows.length; i++) {
    if (capped[i] <= 0) continue;
    if (rows[i].surplus >= floor) continue;

    const trial = capped.slice();
    trial[i] = 0;
    if (!fits(trial, i)) {
      capped[i] = 0;
      rows = projectScenario(household, capped, refs);
      continue;
    }
    let lo = 0;
    let hi = capped[i];
    while (hi - lo > PRECISION) {
      const mid = (lo + hi) / 2;
      trial[i] = mid;
      if (fits(trial, i)) lo = mid;
      else hi = mid;
    }
    capped[i] = Math.floor(lo);
    rows = projectScenario(household, capped, refs);
  }
  return capped;
}
