import type { Household, TaxBracket } from "@/lib/domain/types";
import type { FederalTaxYear } from "@/lib/config/federalTax";
import { DEFAULT_TAX_INDEXING } from "@/lib/config/defaults";

/**
 * The plan's yearly inflation indexing for federal brackets and the standard
 * deduction. Missing or bad values fall back to the default (2%).
 */
export function taxIndexingRate(household: Pick<Household, "assumptions">): number {
  const rate = household.assumptions?.taxIndexing;
  if (rate == null || !Number.isFinite(rate)) return DEFAULT_TAX_INDEXING;
  return rate;
}

function scaleBrackets(brackets: TaxBracket[], factor: number): TaxBracket[] {
  return brackets.map((b) => ({ ...b, floor: b.floor * factor }));
}

/**
 * Federal tax parameters for `calendarYear`: the table's bracket floors (ordinary
 * and long-term gains), standard deduction (with its 65+ amount) and Social
 * Security wage base grown
 * by `rate` a year from the table's own year, the way the IRS and SSA index
 * them. Years at or before the table's year use it as is. The senior deduction
 * and its income limit are fixed dollar amounts in the law, so they don't move.
 */
export function indexedFederalTax(
  federal: FederalTaxYear,
  calendarYear: number,
  rate: number,
): FederalTaxYear {
  const years = calendarYear - federal.year;
  if (!(years > 0) || !Number.isFinite(rate) || rate === 0) return federal;
  const factor = Math.pow(1 + rate, years);
  return {
    ...federal,
    year: calendarYear,
    standardDeduction: {
      mfj: federal.standardDeduction.mfj * factor,
      single: federal.standardDeduction.single * factor,
      hoh: federal.standardDeduction.hoh * factor,
    },
    additionalStandardDeduction: {
      mfj: federal.additionalStandardDeduction.mfj * factor,
      single: federal.additionalStandardDeduction.single * factor,
      hoh: federal.additionalStandardDeduction.hoh * factor,
    },
    brackets: {
      mfj: scaleBrackets(federal.brackets.mfj, factor),
      single: scaleBrackets(federal.brackets.single, factor),
      hoh: scaleBrackets(federal.brackets.hoh, factor),
    },
    longTermCapitalGains: {
      mfj: scaleBrackets(federal.longTermCapitalGains.mfj, factor),
      single: scaleBrackets(federal.longTermCapitalGains.single, factor),
      hoh: scaleBrackets(federal.longTermCapitalGains.hoh, factor),
    },
    socialSecurityWageBase: federal.socialSecurityWageBase * factor,
  };
}

/** {@link indexedFederalTax} with the plan's own indexing rate. */
export function federalTaxForYear(
  household: Pick<Household, "assumptions">,
  federal: FederalTaxYear,
  calendarYear: number,
): FederalTaxYear {
  return indexedFederalTax(federal, calendarYear, taxIndexingRate(household));
}
