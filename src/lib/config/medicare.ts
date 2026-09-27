import type { FilingStatus } from "@/lib/domain/types";
import { forFiling, type FilingTable } from "./filingStatus";
import medicareFallback from "./data/medicare.json";

/**
 * Medicare Part B premiums, including the income-related monthly adjustment
 * amount (IRMAA). Live values live in Mongo `external_data` (key `medicare`)
 * and are hydrated on app boot. This module holds the types, the committed
 * fallback snapshot, and eligibility constants.
 *
 * See docs/external-data.md for how to update.
 *
 * Note: the published brackets mix inclusive ("$109,000 or less") and exclusive
 * ("above $109,000") boundaries. We model each tier by its MAGI floor and pick
 * the highest tier the income reaches, which can differ from the official tier
 * only at the exact dollar boundary - immaterial for projected income.
 */
export interface MedicarePartBTier {
  /** Lowest MAGI (inclusive) at which this monthly premium applies. */
  magiFloor: number;
  /** Total monthly Part B premium per enrollee (standard premium + IRMAA). */
  monthlyPremium: number;
}

export interface MedicarePartBYear {
  year: number;
  /** Standard (lowest-tier) monthly premium, kept for reference/labels. */
  standardMonthlyPremium: number;
  /**
   * IRMAA tiers by filing status, ascending by MAGI floor. CMS publishes
   * individual and joint schedules only; HOH aliases to single via
   * {@link forFiling}.
   */
  tiers: FilingTable<MedicarePartBTier[]>;
}

/** Committed fallback (offline, tests, first paint). Kept in sync by apply. */
export const FALLBACK_MEDICARE_PART_B: MedicarePartBYear =
  medicareFallback as MedicarePartBYear;

/**
 * @deprecated Prefer injecting `refs.medicare` via `calculate(household, refs)`.
 * Kept as an alias of the committed fallback for any remaining static imports.
 */
export const CURRENT_MEDICARE_PART_B = FALLBACK_MEDICARE_PART_B;

/** Age at which Medicare Part B enrollment (and premiums) begin. */
export const MEDICARE_ELIGIBILITY_AGE = 65;

/** IRMAA is based on the MAGI reported on the tax return from two years prior. */
export const MEDICARE_IRMAA_LOOKBACK_YEARS = 2;

/**
 * Monthly Part B premium per enrollee for a given MAGI and filing status. Picks
 * the highest tier whose `magiFloor` the income reaches.
 */
export function medicarePartBMonthlyPremium(
  magi: number,
  filingStatus: FilingStatus,
  table: MedicarePartBYear = FALLBACK_MEDICARE_PART_B,
): number {
  const tiers = forFiling(table.tiers, filingStatus, "medicare IRMAA tiers");
  let premium = tiers[0].monthlyPremium;
  for (const tier of tiers) {
    if (magi >= tier.magiFloor) premium = tier.monthlyPremium;
    else break;
  }
  return premium;
}
