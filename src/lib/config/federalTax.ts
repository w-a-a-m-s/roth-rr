import type { FilingStatus, TaxBracket } from "@/lib/domain/types";
import federalTaxFallback from "./data/federalTax.json";

/**
 * Federal income-tax parameters. Live values live in Mongo `external_data`
 * (key `federal-tax`) and are hydrated on app boot. This module holds the type,
 * the committed fallback snapshot, and Social Security taxability (a fixed rule).
 *
 * See docs/external-data.md for how to update.
 */
export interface FederalTaxYear {
  year: number;
  /** Required for every filing status, including HOH. */
  standardDeduction: Record<FilingStatus, number>;
  brackets: Record<FilingStatus, TaxBracket[]>;
  /**
   * Bonus senior deduction (per person age 65+) and the income above which it
   * is lost. Reflects the 2025 OBBBA $6,000 senior deduction.
   */
  seniorDeductionPerPerson: number;
  seniorDeductionPhaseOut: Record<FilingStatus, number>;
  /**
   * Preferential long-term capital gains brackets (0% / 15% / 20%). Gains are
   * stacked on top of ordinary taxable income when computing LTCG tax.
   */
  longTermCapitalGains: Record<FilingStatus, TaxBracket[]>;
}

/** Committed fallback (offline, tests, first paint). Kept in sync by apply. */
export const FALLBACK_FEDERAL_TAX: FederalTaxYear =
  federalTaxFallback as FederalTaxYear;

/**
 * @deprecated Prefer injecting `refs.federalTax` via `calculate(household, refs)`.
 * Kept as an alias of the committed fallback for any remaining static imports.
 */
export const CURRENT_FEDERAL_TAX = FALLBACK_FEDERAL_TAX;

/**
 * Share of Social Security benefits counted as taxable income. Up to 85% is
 * federally taxable for the higher-income households this tool targets, so it is
 * always applied as a fixed rule rather than a per-plan assumption.
 */
export const SOCIAL_SECURITY_TAXABLE_PCT = 0.85;

/**
 * IRC 469(i) special allowance for active-participation rental real estate.
 * Not inflation-adjusted. Phases out by $0.50 per $1 of MAGI from
 * {@link RENTAL_LOSS_ALLOWANCE_MAGI_START} to {@link RENTAL_LOSS_ALLOWANCE_MAGI_END}.
 */
export const RENTAL_LOSS_SPECIAL_ALLOWANCE = 25_000;
export const RENTAL_LOSS_ALLOWANCE_MAGI_START = 100_000;
export const RENTAL_LOSS_ALLOWANCE_MAGI_END = 150_000;
