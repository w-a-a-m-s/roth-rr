import type { AccountKind, Assumptions, FilingStatus } from "@/lib/domain/types";

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  expenseGrowth: 0.02,
  finalAge: 85,
};

/** Starting per-property real-estate values used when adding a new property. */
export const DEFAULT_REAL_ESTATE_APPRECIATION = 0.03;
export const DEFAULT_DEPRECIATION_YEARS = 27.5;

/**
 * Starting annual rent growth used to seed a new rental property and as the
 * fallback when a property doesn't set its own `rentGrowthRate`.
 */
export const DEFAULT_RENT_GROWTH = 0.02;

/**
 * Starting annual growth rate used to seed a newly added account of each kind.
 * Each account carries its own required `growthRate`; this is only the initial
 * value the form pre-fills (the user can change it per account).
 */
export const DEFAULT_ACCOUNT_GROWTH: Record<AccountKind, number> = {
  retirementTaxable: 0,
  rothTaxFree: 0,
  investment: 0,
  annuity: 0,
  cd: 0,
  savings: 0,
};

/**
 * Growth applied to the synthetic Roth account the engine creates when a plan
 * runs conversions but has no Roth yet. Kept separate from
 * `DEFAULT_ACCOUNT_GROWTH` so the form default can stay at 0 without changing
 * conversion projections for plans that omit a Roth account.
 */
export const IMPLICIT_ROTH_GROWTH = 0.08;

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
