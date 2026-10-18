import type { FilingStatus } from "@/lib/domain/types";
import {
  SOCIAL_SECURITY_ADJUSTED_BASE,
  SOCIAL_SECURITY_BASE_AMOUNT,
  SOCIAL_SECURITY_MAX_TAXABLE_SHARE,
} from "@/lib/config/federalTax";
import { forFiling } from "@/lib/config/filingStatus";

/** Share of benefits taxed between the base and adjusted base amounts. */
const FIRST_TIER_SHARE = 0.5;

/**
 * The taxable part of the year's Social Security benefits (IRC 86, the IRS
 * Pub. 915 worksheet). Provisional income is every other income on the
 * return (`otherIncome`: AGI without Social Security, capital gains included)
 * plus half the benefits.
 *
 * - Up to the base amount: none of it is taxable.
 * - Between the base and adjusted base: half of the income above the base,
 *   capped at half the benefits.
 * - Above the adjusted base: 85% of the income above it, plus the smaller of
 *   half the benefits and half the gap between the two amounts, capped at
 *   85% of the benefits.
 *
 * Thresholds by filing status: single and head of household $25,000 /
 * $34,000, married filing jointly $32,000 / $44,000. They aren't indexed for
 * inflation. (Not filing statuses in this app yet: a qualifying surviving
 * spouse uses the single amounts; married filing separately while living
 * together uses $0, so up to 85% is taxable from the first dollar.)
 */
export function taxableSocialSecurity(
  benefits: number,
  otherIncome: number,
  filingStatus: FilingStatus,
): number {
  if (!(benefits > 0)) return 0;
  const base = forFiling(SOCIAL_SECURITY_BASE_AMOUNT, filingStatus, "social security base");
  const adjusted = forFiling(
    SOCIAL_SECURITY_ADJUSTED_BASE,
    filingStatus,
    "social security adjusted base",
  );
  const provisional = Math.max(0, otherIncome) + FIRST_TIER_SHARE * benefits;
  if (provisional <= base) return 0;

  const halfBenefits = FIRST_TIER_SHARE * benefits;
  if (provisional <= adjusted) {
    return Math.min(halfBenefits, FIRST_TIER_SHARE * (provisional - base));
  }
  const firstTier = Math.min(halfBenefits, FIRST_TIER_SHARE * (adjusted - base));
  return Math.min(
    SOCIAL_SECURITY_MAX_TAXABLE_SHARE * benefits,
    SOCIAL_SECURITY_MAX_TAXABLE_SHARE * (provisional - adjusted) + firstTier,
  );
}
