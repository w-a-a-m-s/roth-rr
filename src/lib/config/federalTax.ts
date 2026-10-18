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
  /**
   * Extra standard deduction per person age 65 or older (the "aged" amount).
   * Married filers get the joint figure each; single and HOH the higher one.
   */
  additionalStandardDeduction: Record<FilingStatus, number>;
  brackets: Record<FilingStatus, TaxBracket[]>;
  /**
   * Bonus senior deduction (per person age 65+) and the MAGI where it starts
   * to phase out (6% of MAGI above it, see
   * {@link SENIOR_DEDUCTION_PHASE_OUT_RATE}). Reflects the 2025 OBBBA $6,000
   * senior deduction.
   */
  seniorDeductionPerPerson: number;
  seniorDeductionPhaseOut: Record<FilingStatus, number>;
  /**
   * Preferential long-term capital gains brackets (0% / 15% / 20%). Gains are
   * stacked on top of ordinary taxable income when computing LTCG tax.
   */
  longTermCapitalGains: Record<FilingStatus, TaxBracket[]>;
  /**
   * Social Security wage base: the most earnings per person that pay the
   * Social Security part of FICA / self-employment tax. Set yearly by SSA.
   */
  socialSecurityWageBase: number;
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
 * Taxable Social Security (IRC 86): the most of the benefits that can be
 * taxed, and the provisional-income thresholds where taxation starts (base)
 * and where the 85% tier starts (adjusted base). Fixed in the law, not
 * indexed. Each filing status has its own entry (see `taxableSocialSecurity`).
 */
export const SOCIAL_SECURITY_MAX_TAXABLE_SHARE = 0.85;
export const SOCIAL_SECURITY_BASE_AMOUNT: Record<FilingStatus, number> = {
  mfj: 32_000,
  single: 25_000,
  hoh: 25_000,
};
export const SOCIAL_SECURITY_ADJUSTED_BASE: Record<FilingStatus, number> = {
  mfj: 44_000,
  single: 34_000,
  hoh: 34_000,
};

/**
 * Each person's senior deduction drops by this share of MAGI above
 * `seniorDeductionPhaseOut`, so $6,000 is gone $100,000 past the start.
 * Fixed in the law.
 */
export const SENIOR_DEDUCTION_PHASE_OUT_RATE = 0.06;

/**
 * IRC 469(i) special allowance for active-participation rental real estate.
 * Not inflation-adjusted. Phases out by $0.50 per $1 of MAGI from
 * {@link RENTAL_LOSS_ALLOWANCE_MAGI_START} to {@link RENTAL_LOSS_ALLOWANCE_MAGI_END}.
 */
export const RENTAL_LOSS_SPECIAL_ALLOWANCE = 25_000;
export const RENTAL_LOSS_ALLOWANCE_MAGI_START = 100_000;
export const RENTAL_LOSS_ALLOWANCE_MAGI_END = 150_000;

/**
 * Employment tax rates and limits fixed in the law (IRC 3101, 1401, 1402).
 * Only the Social Security wage base changes yearly, so it lives in the
 * federal-tax dataset instead (`socialSecurityWageBase`).
 */
export const EMPLOYEE_SOCIAL_SECURITY_RATE = 0.062;
export const EMPLOYEE_MEDICARE_RATE = 0.0145;
/** Self-employed pay both halves. */
export const SELF_EMPLOYMENT_SOCIAL_SECURITY_RATE = 0.124;
export const SELF_EMPLOYMENT_MEDICARE_RATE = 0.029;
/** Net earnings from self-employment are 92.35% of business profit. */
export const SELF_EMPLOYMENT_EARNINGS_SHARE = 0.9235;
/** Below this much net earnings there's no self-employment tax. */
export const SELF_EMPLOYMENT_TAX_MINIMUM = 400;
/**
 * Additional Medicare tax on wages and self-employment income above a
 * threshold by filing status. Not indexed for inflation.
 */
export const ADDITIONAL_MEDICARE_RATE = 0.009;
export const ADDITIONAL_MEDICARE_THRESHOLD: Record<FilingStatus, number> = {
  mfj: 250_000,
  single: 200_000,
  hoh: 200_000,
};

/**
 * Net investment income tax (IRC 1411, Form 8960): 3.8% of the smaller of
 * net investment income and MAGI above the threshold by filing status. Fixed
 * in the law, not indexed. (Not filing statuses here yet: a qualifying
 * surviving spouse uses $250,000, married filing separately $125,000.)
 */
export const NET_INVESTMENT_INCOME_TAX_RATE = 0.038;
export const NET_INVESTMENT_INCOME_TAX_THRESHOLD: Record<FilingStatus, number> = {
  mfj: 250_000,
  single: 200_000,
  hoh: 200_000,
};
