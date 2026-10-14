import type { Household } from "@/lib/domain/types";
import type { ProjectionRow } from "@/lib/engine/types";
import { forFiling } from "@/lib/config/filingStatus";
import {
  MEDICARE_IRMAA_LOOKBACK_YEARS,
  medicarePartBMonthlyPremium,
  paysMedicarePartB,
  type MedicarePartBYear,
} from "@/lib/config/medicare";

/** One projection year of Medicare Part B, for the Medicare analysis. */
export interface MedicareYear {
  calendarYear: number;
  ages: Record<string, number>;
  /** People paying Part B this year. */
  enrolled: number;
  /** This year's MAGI. It sets the premiums two years from now. */
  magi: number;
  /** The year whose MAGI sets this year's premium. */
  lookbackYear: number;
  lookbackMagi: number;
  /** 0 is the standard premium; 1 and up are IRMAA tiers. */
  tier: number;
  /** Monthly Part B premium per person, IRMAA included. */
  monthlyPremium: number;
  /** Part B premiums for everyone enrolled this year. */
  annualPremium: number;
  /** What the year pays above the standard premium. */
  irmaaSurcharge: number;
  /**
   * How much more MAGI this year can have before the premium two years from
   * now moves up a tier, and what that step costs that year. Null when
   * nobody pays Part B then, the top tier is already reached, or the
   * projection ends first.
   */
  roomToNextTier: number | null;
  nextTierCost: number | null;
}

export interface MedicareSummary {
  years: MedicareYear[];
  totalPremiums: number;
  totalIrmaa: number;
  /** Years paying more than the standard premium. */
  irmaaYears: number;
}

/**
 * MAGI the way the plan counts it for IRMAA: federal ordinary gross taxable
 * income plus realized capital gains.
 */
export function medicareMagi(row: ProjectionRow): number {
  return row.grossTaxableIncome + row.capitalGainsIncome;
}

function enrolledIn(household: Household, row: ProjectionRow): number {
  return household.people.filter(
    (p) => row.livingIds.includes(p.id) && paysMedicarePartB(p, row.calendarYear),
  ).length;
}

/**
 * Part B premiums year by year. Each year's premium uses the MAGI from two
 * years earlier (the first two years use the first year's).
 */
export function medicareYears(
  household: Household,
  rows: ProjectionRow[],
  medicare: MedicarePartBYear,
): MedicareSummary {
  const years: MedicareYear[] = [];
  let totalPremiums = 0;
  let totalIrmaa = 0;
  let irmaaYears = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lookback = rows[Math.max(0, i - MEDICARE_IRMAA_LOOKBACK_YEARS)];
    const lookbackMagi = medicareMagi(lookback);
    const tiers = forFiling(medicare.tiers, row.filingStatus, "medicare IRMAA tiers");
    const enrolled = enrolledIn(household, row);
    const monthlyPremium = medicarePartBMonthlyPremium(lookbackMagi, row.filingStatus, medicare);
    const tier = Math.max(0, tiers.findLastIndex((t) => lookbackMagi >= t.magiFloor));
    const annualPremium = enrolled * monthlyPremium * 12;
    const irmaaSurcharge = enrolled * (monthlyPremium - tiers[0].monthlyPremium) * 12;
    totalPremiums += annualPremium;
    totalIrmaa += irmaaSurcharge;
    if (enrolled > 0 && tier > 0) irmaaYears += 1;

    const magi = medicareMagi(row);
    let roomToNextTier: number | null = null;
    let nextTierCost: number | null = null;
    const affected = rows[i + MEDICARE_IRMAA_LOOKBACK_YEARS];
    const affectedEnrolled = affected ? enrolledIn(household, affected) : 0;
    if (affected && affectedEnrolled > 0) {
      const ahead = forFiling(medicare.tiers, affected.filingStatus, "medicare IRMAA tiers");
      const at = Math.max(0, ahead.findLastIndex((t) => magi >= t.magiFloor));
      const next = ahead[at + 1];
      if (next) {
        roomToNextTier = next.magiFloor - magi;
        nextTierCost = affectedEnrolled * (next.monthlyPremium - ahead[at].monthlyPremium) * 12;
      }
    }

    years.push({
      calendarYear: row.calendarYear,
      ages: row.ages,
      enrolled,
      magi,
      lookbackYear: lookback.calendarYear,
      lookbackMagi,
      tier: enrolled > 0 ? tier : 0,
      monthlyPremium,
      annualPremium,
      irmaaSurcharge,
      roomToNextTier,
      nextTierCost,
    });
  }
  return { years, totalPremiums, totalIrmaa, irmaaYears };
}
