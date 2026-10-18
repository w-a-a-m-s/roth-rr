export interface DeductionBreakdown {
  standard: number;
  /** Extra standard deduction for each living person 65 or older. */
  additional: number;
  senior: number;
  depreciation: number;
  /** One-time 100% depreciation entered on the plan for this year. */
  oneTimeDepreciation: number;
  total: number;
}

export interface StateDeductionBreakdown {
  standard: number;
  personalExemption: number;
  /** One-time 100% depreciation entered on the plan for this year. */
  oneTimeDepreciation: number;
  total: number;
}

import type { EmploymentTax } from "@/lib/engine/employmentTax";
import type {
  DeathEvent,
  DisabilityEvent,
  FilingStatus,
  LongTermCareSettings,
  EarlyConversion,
} from "@/lib/domain/types";

/** Extra inputs for an analysis other than plain Retirement. */
export interface ProjectionOptions {
  /** Survivorship: one spouse passes at this age. */
  death?: DeathEvent;
  /** Long-term care: who's in care, when, and what it costs. */
  longTermCare?: LongTermCareSettings;
  /** Disability: one person becomes disabled at this age. */
  disability?: DisabilityEvent;
  /**
   * Start the projection no later than this year, to show the years before
   * the plan start (Jump to from today). Amounts stay anchored to the plan
   * start and conversions only run in plan years, so the years from the plan
   * start on match a normal run (mortgages amortize from the earlier year).
   */
  fromYear?: number;
  /**
   * Roth scenario only: conversions in years before the plan start. Each runs
   * only when the projection reaches its year (see `fromYear`).
   */
  earlyConversions?: EarlyConversion[];
  /**
   * Spending capacity: multiplies the plan's own expenses (not long-term care
   * or property loan payments). Missing means 1.
   */
  spendingScale?: number;
  /**
   * Spending capacity: every year still short takes more from the accounts
   * (after-tax, then tax-deferred, then Roth, grossed up for the tax), the
   * same way a year after a death or long-term care does.
   */
  coverShortfalls?: boolean;
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
  /**
   * End-of-year balance per account (keyed by account id). Survivorship adds
   * `life:<policyId>` for life insurance proceeds (counted in `afterTaxTotal`).
   */
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
  /** Business equity (sum of every business's grown value), in estate totals. */
  businessEquity: number;
  /** Per-business value; sums to `businessEquity`. */
  businessEquityById: Record<string, number>;
  /** Amount actually converted from tax-deferred to Roth this year. */
  conversion: number;
  /**
   * Tax on this year's conversion withheld from the converted dollars when
   * the plan pays conversion tax from assets (0 when paid from income). The
   * Roth receives `conversion - conversionTaxWithheld`; `annualTax` still
   * includes it, but `netMonthlyIncome` and `surplus` don't pay it.
   */
  conversionTaxWithheld: number;
  /** Gross spendable monthly income (excludes Roth conversions). */
  totalMonthlyIncome: number;
  /**
   * Per-source monthly income that sums to `totalMonthlyIncome`. Keys are income
   * ids, `rmd:<accountId>` for RMD draws, `re:<propertyId>` for real-estate
   * cash flow, and `life:` / `di:` / `ltci:<policyId>` for insurance benefits
   * in their analyses.
   */
  incomeMonthly: Record<string, number>;
  /** Federal ordinary gross taxable income (excludes capital gains). */
  grossTaxableIncome: number;
  /**
   * The part of this year's Social Security benefits that's federally
   * taxable (0% to 85%, from provisional income). Inside `grossTaxableIncome`.
   */
  socialSecurityTaxable: number;
  /** Realized capital gains from after-tax withdrawals this year. */
  capitalGainsIncome: number;
  /**
   * DPP / MLP depreciation recaptured this year: gain taxed as ordinary income
   * (already inside `grossTaxableIncome`, not in `capitalGainsIncome`).
   */
  recaptureIncome: number;
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
  /**
   * Investment income for the 3.8% tax: gains, DPP / MLP recapture, net
   * rental income (none for a real-estate professional) and life insurance
   * earnings paid like an annuity. Never below 0.
   */
  netInvestmentIncome: number;
  /** 3.8% net investment income tax (Form 8960). */
  netInvestmentIncomeTax: number;
  /**
   * Social Security and Medicare tax: employee FICA on salary plus
   * self-employment tax on business income. Its `selfEmploymentDeduction` is
   * already out of `grossTaxableIncome`.
   */
  employmentTax: EmploymentTax;
  /** Federal ordinary + LTCG + net investment income tax + employment tax. */
  federalAnnualTax: number;
  federalMonthlyTax: number;
  /**
   * Per-bracket breakdown of federal ordinary tax (not LTCG), with each
   * bracket's taxable-income range for this year's filing status. `ceiling`
   * is the next bracket's floor, null for the top bracket.
   */
  federalTaxByBracket: {
    rate: number;
    tax: number;
    floor: number;
    ceiling: number | null;
  }[];
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
  /** One-time 100% depreciation this year, keyed by entry id. */
  oneTimeDepreciationById: Record<string, number>;
  surplus: number;
}

export interface ScenarioTotals {
  /** Total combined (federal+state) taxes from retirement until the RMD age. */
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
  /**
   * The plan's conversions before the projection starts, when they ran in
   * years these rows don't show. Their tax is already in `totals`.
   */
  earlyConversions?: EarlyConversionResult;
}

export interface EarlyConversionResult {
  /** Dollars actually moved out of tax-deferred accounts, per year. */
  convertedByYear: Record<number, number>;
  /** Extra federal and state tax in those years because of the conversions. */
  federalTax: number;
  stateTax: number;
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
