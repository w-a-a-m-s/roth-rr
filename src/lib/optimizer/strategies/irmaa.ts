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
 * Each conversion year: convert up to just under the next IRMAA tier above
 * that year's baseline MAGI. Top tier has no MAGI cap (uses the conversion
 * target; the engine still caps at balances).
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
  const uncapped = conversionTarget(household);

  const window = rows.slice(0, years).map((row) => {
    const magi = row.grossTaxableIncome + row.capitalGainsIncome;
    const room = irmaaHeadroom(magi, tiers);
    if (!Number.isFinite(room)) return uncapped;
    // Stay strictly below the next tier's inclusive MAGI floor.
    return roundCents(Math.max(0, room - 0.01));
  });
  return padToProjection(household, window);
}
