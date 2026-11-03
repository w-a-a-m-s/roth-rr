import type { AccountKind, Assumptions, FilingStatus, LeftoverInvestment } from "@/lib/domain/types";

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  expenseGrowth: 0.02,
  finalAge: 85,
};

/**
 * Yearly inflation indexing for federal tax brackets and the standard
 * deduction, used when a plan doesn't set its own (`assumptions.taxIndexing`).
 */
export const DEFAULT_TAX_INDEXING = 0.02;

/** Starting per-property real-estate values used when adding a new property. */
export const DEFAULT_REAL_ESTATE_APPRECIATION = 0.03;
export const DEFAULT_DEPRECIATION_YEARS = 27.5;
/** Share of a property's price that's land (not depreciable) when unset. */
export const DEFAULT_LAND_SHARE = 0.2;
/** Month a property was placed in service when unset (January). */
export const DEFAULT_PURCHASE_MONTH = 1;

/** Default yearly growth for a new business equity entry. */
export const DEFAULT_BUSINESS_GROWTH = 0.03;

/**
 * Starting annual rent growth used to seed a new rental property and as the
 * fallback when a property doesn't set its own `rentGrowthRate`.
 */
export const DEFAULT_RENT_GROWTH = 0.02;

/** The default yearly return on tax-deferred (401k, IRA, DROP...) and investment (brokerage) accounts. */
export const DEFAULT_NON_ROTH_GROWTH = 0.06;

/** The default yearly return on Roth accounts. */
export const DEFAULT_ROTH_GROWTH = 0.08;

/**
 * Starting annual growth rate used to seed a newly added account of each kind,
 * when the group has no Fixed return set on the Household step. Each account
 * carries its own required `growthRate`; this is only the initial value the
 * form pre-fills (the user can change it per account). It's also what the
 * Fixed return box shows before one is set, when the accounts don't share a rate.
 */
export const DEFAULT_ACCOUNT_GROWTH: Record<AccountKind, number> = {
  retirementTaxable: DEFAULT_NON_ROTH_GROWTH,
  rothTaxFree: DEFAULT_ROTH_GROWTH,
  investment: DEFAULT_NON_ROTH_GROWTH,
  annuity: 0,
  cd: 0,
  savings: 0,
  dppMlp: 0,
};

/**
 * Growth applied to the synthetic Roth account the engine creates when a plan
 * runs conversions but has no Roth yet.
 */
export const IMPLICIT_ROTH_GROWTH = DEFAULT_ROTH_GROWTH;

/** The engine's account for the plan's saved leftover money. */
export const LEFTOVER_ACCOUNT_ID = "__leftover__";

/** Yearly growth of the saved leftover money, by where it's invested. */
export const LEFTOVER_INVESTMENT_RATE: Record<LeftoverInvestment, number> = {
  sp500: 0.08,
  moneyMarket: 0.033,
};

export const LEFTOVER_INVESTMENT_LABEL: Record<LeftoverInvestment, string> = {
  sp500: "Leftover money (S&P 500)",
  moneyMarket: "Leftover money (money market)",
};

/** Starting annual growth used to seed a newly added expense. */
export const DEFAULT_EXPENSE_GROWTH = 0;

/** Starting annual growth used to seed a newly added income source. */
export const DEFAULT_INCOME_GROWTH = 0;

/**
 * Optional autocomplete suggestions for an expense's name. These are hints only
 * - any free text is valid. Sourced from the fact-finder expense worksheet;
 * "Savings" and "Retirement" are intentionally omitted because the model tracks
 * those as accounts/conversions rather than spending (including them as
 * expenses would double-count).
 */
export const EXPENSE_SUGGESTIONS: string[] = [
  "Rent/Mortgage",
  "Maintenance",
  "Real Estate Taxes",
  "Home & Flood Ins",
  "Electricity",
  "Telephone/Cell",
  "Water",
  "Garbage",
  "Fumigation",
  "Lawn/Pool Care",
  "Life Insurance",
  "Health Insurance",
  "Disability Insurance",
  "Long Term Care",
  "Other Insurance",
  "Medical/Dental/Rx",
  "Child care",
  "Tuition",
  "Car Payments",
  "Car Insurance",
  "Gas/Transportation",
  "Groceries",
  "Clothing",
  "Laundry/Dry Clean",
  "Credit Card Payments",
  "Student Loans",
  "Child Support",
  "Alimony",
  "Entertainment",
  "Education",
  "Other Mandatory",
  "Other Desired",
];

export const FILING_STATUS_ORDER: FilingStatus[] = ["single", "mfj", "hoh"];

export const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  mfj: "Married filing jointly",
  single: "Single",
  hoh: "Head of household",
};
