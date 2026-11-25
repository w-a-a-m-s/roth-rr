import type { Household } from "@/lib/domain/types";
import type { MedicarePartBTier } from "@/lib/config/medicare";
import { forFiling } from "@/lib/config/filingStatus";
import { projectScenario } from "@/lib/engine/project";
import { conversionYears } from "@/lib/engine/convertible";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";
import type { ReferenceData } from "@/lib/externalData/types";
import {
  conversionTarget,
  padToProjection,
  roundCents,
  strategyStartIndex,
} from "@/lib/optimizer/util";

/**
 * Room under the next IRMAA MAGI floor above `magi`. Infinity when already in
 * the top published tier (no further cliff).
 */
export function irmaaHeadroom(
  magi: number,
  tiers: MedicarePartBTier[],
): number {
  if (tiers.length === 0) return 0;
  let current = 0;
  for (let i = 0; i < tiers.length; i++) {
    if (magi >= tiers[i].magiFloor) current = i;
    else break;
  }
  if (current >= tiers.length - 1) return Number.POSITIVE_INFINITY;
  const nextFloor = tiers[current + 1].magiFloor;
  return Math.max(0, nextFloor - magi);
}

/**
 * Dollars the strategy keeps under each IRMAA threshold (user's request), so
 * a little more interest or a pension raise than projected doesn't push the
 * year over the line.
 */
export const IRMAA_SAFETY_MARGIN = 1000;

/** Most re-projections spent settling each year onto its ceiling. */
const MAX_PASSES = 12;

/** A year is filled once it's this close under its ceiling. */
const FILLED_WITHIN = 1;

/**
 * Steepest MAGI rise per converted dollar the step trusts: 1, plus up to 0.85
 * of Social Security that the conversion makes taxable, and a bit more.
 */
const MAX_SLOPE = 3;

function medicareMagiOf(row: { grossTaxableIncome: number; capitalGainsIncome: number }): number {
  return row.grossTaxableIncome + row.capitalGainsIncome;
}

/**
 * Each conversion year: convert up to `IRMAA_SAFETY_MARGIN` under the next
 * IRMAA tier above that year's MAGI with no conversion, so the year stays in
 * its tier. Top tier has no MAGI cap (uses the conversion target; the engine
 * still caps at balances).
 *
 * A converted dollar can raise MAGI by more than a dollar: it makes more
 * Social Security taxable (up to 85 cents more). So the room with no
 * conversion is only a first guess: each pass re-projects with the schedule
 * and moves every year by its gap to the ceiling over its measured slope,
 * then the last passes back off any year still over, the same way
 * fill-bracket settles on its bracket.
 */
export function irmaaSchedule(
  household: Household,
  refs: ReferenceData = FALLBACK_REFERENCE_DATA,
): number[] {
  const zeros = padToProjection(household, []);
  const rows = projectScenario(household, zeros, refs);
  const tiers = forFiling(
    refs.medicare.tiers,
    household.filingStatus,
    "medicare IRMAA tiers",
  );
  const years = conversionYears(household);
  const uncapped = conversionTarget(household, refs.asOfDate);
  const first = strategyStartIndex(household);

  // The most MAGI each year can have: the margin under the next tier's
  // floor above its MAGI with no conversion. Null is a year in the top tier.
  const targets = rows.slice(0, years).map((row, i) => {
    if (i < first) return 0;
    const magi = medicareMagiOf(row);
    const room = irmaaHeadroom(magi, tiers);
    if (!Number.isFinite(room)) return null;
    return magi + room - IRMAA_SAFETY_MARGIN;
  });

  let schedule = padToProjection(
    household,
    targets.map((target, i) => {
      if (i < first) return 0;
      if (target == null) return uncapped;
      return roundCents(Math.max(0, target - medicareMagiOf(rows[i])));
    }),
  );
  const previous = rows.map((row) => ({ amount: 0, magi: medicareMagiOf(row) }));

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const projected = projectScenario(household, schedule, refs);
    // The last two passes only back off: they guarantee no year is left over.
    const backOffOnly = pass >= MAX_PASSES - 2;
    const next = schedule.slice();
    let settled = true;
    for (let i = first; i < targets.length; i++) {
      const target = targets[i];
      if (target == null) continue;
      const row = projected[i];
      const magi = medicareMagiOf(row);
      const gap = target - magi;
      // Converted less than scheduled: the accounts ran dry.
      const capped = row.conversion < schedule[i] - 0.005;
      if (gap >= 0 && (gap < FILLED_WITHIN || capped || backOffOnly)) continue;
      // Over without converting: income alone is past the ceiling.
      if (gap < 0 && row.conversion <= 0) continue;
      settled = false;
      const run = row.conversion - previous[i].amount;
      const rise = magi - previous[i].magi;
      const measured = Math.abs(run) > 1 ? rise / run : 1;
      // Every converted dollar adds at least a dollar of MAGI, so backing off
      // by the whole overshoot (slope 1) always lands at or under the ceiling.
      const slope = backOffOnly ? 1 : Math.min(MAX_SLOPE, Math.max(1, measured));
      previous[i] = { amount: row.conversion, magi };
      next[i] = roundCents(Math.max(0, row.conversion + gap / slope));
    }
    if (settled) break;
    schedule = next;
  }
  return schedule;
}
