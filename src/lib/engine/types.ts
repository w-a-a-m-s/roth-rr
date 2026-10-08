export interface DeductionBreakdown {
  standard: number;
  senior: number;
  depreciation: number;
  total: number;
}

export interface StateDeductionBreakdown {
  standard: number;
  personalExemption: number;
  total: number;
}

import type {
  DeathEvent,
  FilingStatus,
  LongTermCareSettings,
} from "@/lib/domain/types";

/** Extra inputs for an analysis other than plain Retirement. */
export interface ProjectionOptions {
  /** Survivorship: one spouse passes at this age. */
  death?: DeathEvent;
  /** Long-term care: who's in care, when, and what it costs. */
  longTermCare?: LongTermCareSettings;
}

export interface ProjectionRow {
  yearIndex: number;
  calendarYear: number;
  /** Age of each person (keyed by person id) in this year. */
  ages: Record<string, number>;
  /** People still living this year (everyone, outside Survivorship). */
  livingIds: string[];
  /** Filing status used for this year's tax (single after a spouse passes). */
  filingStatus: FilingStatus;
  /** End-of-year balance per account (keyed by account id). */
  balances: Record<string, number>;
  retirementTotal: number;
  rothTotal: number;
  afterTaxTotal: number;
  /** Total appreciated market value of all real estate this year. */
  realEstateValue: number;
  /** Total remaining mortgage principal across all properties. */
  mortgageBalance: number;
  /** Real-estate equity (value - mortgage), included in estate totals. */
  realEstateEquity: number;
  /** Amount actually converted from tax-deferred to Roth this year. */
  conversion: number;
  /** Gross spendable monthly income (excludes Roth conversions). */
  totalMonthlyIncome: number;
  /**
   * Per-source monthly income that sums to `totalMonthlyIncome`. Keys are income
   * ids, `rmd:<accountId>` for RMD draws, and `re:<propertyId>` for real-estate
   * cash flow.
   */
  incomeMonthly: Record<string, number>;
  /** Federal ordinary gross taxable income (excludes capital gains). */
  grossTaxableIncome: number;
  /** Realized capital gains from after-tax withdrawals this year. */
  capitalGainsIncome: number;
  deductions: DeductionBreakdown;
  /** Federal ordinary taxable income after deductions (excludes gains). */
  taxableIncome: number;
  /** State ordinary gross taxable income before state deductions (excludes gains). */
  stateGrossTaxableIncome: number;
  stateDeductions: StateDeductionBreakdown;
  /** State ordinary taxable income after state deductions (excludes gains). */
  stateTaxableIncome: number;
  /** Federal ordinary income tax (excludes LTCG). */
  federalOrdinaryTax: number;
  /** Federal long-term capital gains tax. */
  federalCapitalGainsTax: number;
  /** Federal ordinary + LTCG. */
  federalAnnualTax: number;
  federalMonthlyTax: number;
  /**
   * Per-bracket breakdown of federal ordinary tax (not LTCG).
   */
  federalTaxByBracket: { rate: number; tax: number }[];
  /**
   * Per-bracket breakdown of federal long-term capital gains tax (0% / 15% / 20%).
   */
  federalCapitalGainsTaxByBracket: { rate: number; tax: number }[];
  /** State income tax (ordinary + state treatment of gains). */
  stateAnnualTax: number;
  stateMonthlyTax: number;
  stateTaxByBracket: { rate: number; tax: number }[];
  /**
   * Combined federal + state annual tax (cash-flow netting).
   * @deprecated Prefer federalAnnualTax / stateAnnualTax; kept for totals rollup.
   */
  annualTax: number;
  monthlyTax: number;
  /**
   * Alias of federalTaxByBracket for older call sites.
   * @deprecated Prefer federalTaxByBracket.
   */
  taxByBracket: { rate: number; tax: number }[];
  netMonthlyIncome: number;
  netAnnualIncome: number;
  monthlyExpenses: number;
  /** Per-expense monthly amount; sums to `monthlyExpenses`. */
  expenseMonthly: Record<string, number>;
  /** Monthly-equivalent deposits paid into accounts this year. */
  monthlyDeposits: number;
  /** Per-deposit monthly-equivalent amount; sums to `monthlyDeposits`. */
  depositMonthly: Record<string, number>;
  /**
   * Annual deposits into tax-deferred accounts, excluded from ordinary gross
   * income (pre-tax contributions).
   */
  preTaxDeposits: number;
  /** Per-property equity (market value − mortgage); sums to `realEstateEquity`. */
  realEstateEquityById: Record<string, number>;
  /** Year-end suspended rental passive loss (total across properties). */
  rentalLossCarryforward: number;
  /** Year-end suspended rental passive loss per property. */
  rentalLossCarryforwardById: Record<string, number>;
  surplus: number;
}

export interface ScenarioTotals {
  /** Total combined (federal+state) taxes before the RMD age. */
  taxesEarly: number;
  /** Total combined taxes from the RMD age onward. */
  taxesLate: number;
  taxesTotal: number;
  federalTaxesEarly: number;
  federalTaxesLate: number;
  federalTaxesTotal: number;
  stateTaxesEarly: number;
  stateTaxesLate: number;
  stateTaxesTotal: number;
  /** Total Medicare Part B premiums (incl. IRMAA) paid across the projection. */
  medicareTotal: number;
  /** After-tax estate value at the RMD age. */
  afterTaxAssetsAtRmd: number;
  /** After-tax estate value in the final projection year (inheritance). */
  inheritanceFinal: number;
}

export interface ScenarioResult {
  label: string;
  rows: ProjectionRow[];
  conversionSchedule: number[];
  totals: ScenarioTotals;
}

export interface Comparison {
  baseline: ScenarioResult;
  roth: ScenarioResult;
  deltas: {
    taxesEarly: number;
    taxesLate: number;
    taxesTotal: number;
    federalTaxesTotal: number;
    stateTaxesTotal: number;
    medicareTotal: number;
    afterTaxAssetsAtRmd: number;
    inheritanceFinal: number;
  };
}
