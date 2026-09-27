import type { Household } from "@/lib/domain/types";
import { DEFAULT_ASSUMPTIONS } from "@/lib/config/defaults";

/**
 * Faithful transcription of the source spreadsheet
 * (`doc/reference/Example - Aligned.xlsx`). Used as a golden-regression plan
 * (see `engine/golden/cases/spreadsheet-household.json`).
 *
 * Deliberately mirrors the sheet's modeling choices rather than our newer
 * features, so the comparison isolates real discrepancies:
 *  - Rental shows up as a single net-income line (sheet row 31) with the
 *    one-year growth delay quirk, NOT as structured property rent.
 *  - Real estate does not appreciate (the sheet holds property value implicit;
 *    only depreciation matters there).
 */
export const EXCEL_HOUSEHOLD: Household = {
  filingStatus: "mfj",
  residenceState: "FL",
  expenses: [
    { id: "exp-living", label: "Living expenses", amount: 12_000, frequency: "monthly", growthRate: 0.02 },
  ],
  people: [
    { id: "p1", name: "David", birthYear: 1965, retirementYear: 2030 },
    { id: "p2", name: "Batsheva", birthYear: 1967, retirementYear: 2032 },
  ],
  accounts: [
    { id: "drop-s1", label: "DROP (David)", ownerId: "p1", kind: "retirementTaxable", retirementType: "drop", balance: 1_100_000, growthRate: 0.05 },
    { id: "drop-s2", label: "DROP (Batsheva)", ownerId: "p2", kind: "retirementTaxable", retirementType: "drop", balance: 300_000, growthRate: 0.05 },
    { id: "tsp-s1", label: "403(B)/457/401(K)/TSP (David)", ownerId: "p1", kind: "retirementTaxable", retirementType: "tsp", balance: 250_000, growthRate: 0.05 },
    { id: "tsp-s2", label: "403(B)/457/401(K)/TSP (Batsheva)", ownerId: "p2", kind: "retirementTaxable", retirementType: "tsp", balance: 120_000, growthRate: 0.05 },
    { id: "ira-s1", label: "IRA (David)", ownerId: "p1", kind: "retirementTaxable", retirementType: "ira", balance: 50_000, growthRate: 0.05 },
    { id: "ira-s2", label: "IRA (Batsheva)", ownerId: "p2", kind: "retirementTaxable", retirementType: "ira", balance: 20_000, growthRate: 0.05 },
    { id: "roth-s1", label: "Roth IRA (David)", ownerId: "p1", kind: "rothTaxFree", balance: 30_000, growthRate: 0.08 },
    { id: "roth-s2", label: "Roth IRA (Batsheva)", ownerId: "p2", kind: "rothTaxFree", balance: 15_000, growthRate: 0.08 },
    { id: "annuity", label: "Annuity", ownerId: "p1", kind: "annuity", balance: 40_000, costBasis: 30_000, growthRate: 0.05 },
    { id: "brokerage", label: "Investment account", ownerId: "p1", kind: "investment", balance: 400_000, costBasis: 500_000, growthRate: 0.05 },
  ],
  incomes: [
    { id: "pension-s1", label: "Pension (David)", ownerId: "p1", kind: "pension", monthlyAmount: 4_000, growthRate: 0.023, taxability: "full" },
    { id: "pension-s2", label: "Pension (Batsheva)", ownerId: "p2", kind: "pension", monthlyAmount: 4_000, growthRate: 0.02, taxability: "full" },
    // Information!B31 lists David's salary ($10k), but he retires in 2030 (the
    // projection's first year), so the sheet's Regular!row25 is all zeros.
    // Modeled with endYear 2029 so it mirrors the input list yet contributes 0.
    { id: "salary-s1", label: "Salary (David)", ownerId: "p1", kind: "salary", monthlyAmount: 10_000, growthRate: 0.02, taxability: "full", endYear: 2029 },
    { id: "salary-s2", label: "Salary (Batsheva)", ownerId: "p2", kind: "salary", monthlyAmount: 7_500, growthRate: 0.02, taxability: "full", endYear: 2031 },
    { id: "business", label: "Business income", ownerId: "p1", kind: "business", monthlyAmount: 2_000, growthRate: 0, taxability: "full", endYear: 2035 },
    { id: "ss-s1", label: "Social Security (David)", ownerId: "p1", kind: "socialSecurity", monthlyAmount: 3_000, growthRate: 0.02, taxability: "full" },
    { id: "ss-s2", label: "Social Security (Batsheva)", ownerId: "p2", kind: "socialSecurity", monthlyAmount: 2_600, growthRate: 0.02, taxability: "full" },
    { id: "military", label: "Military pension", ownerId: "p1", kind: "militaryPension", monthlyAmount: 1_100, growthRate: 0.02, taxability: "taxFree" },
    // Sheet row 31: net rent stays flat one year, then grows 2% (growthDelayYears).
    // Modeled as a generic income line (the sheet treats rental as net income,
    // not as a structured property in the Real estate tab).
    { id: "rental", label: "Real estate (net)", ownerId: "p1", kind: "other", monthlyAmount: 1_400, growthRate: 0.02, taxability: "full", growthDelayYears: 1 },
    { id: "discretionary", label: "Income from retirement assets", ownerId: "p1", kind: "retirementDraw", monthlyAmount: 1_000, growthRate: 0, taxability: "full", drawsFromAccountId: "drop-s1" },
  ],
  realEstate: [
    // Depreciation basis only; the sheet does not appreciate or include equity.
    { id: "re-investment", label: "Investment property", purchaseYear: 2010, purchasePrice: 300_000, marketValue: 0, appreciationRate: 0, depreciationYears: 27.5 },
  ],
  deletedPeople: [],
  deletedAccounts: [],
  deletedIncomes: [],
  deletedRealEstate: [],
  deletedExpenses: [],
  assumptions: DEFAULT_ASSUMPTIONS,
  optimizer: {
    // Flat $150k/yr conversions (sheet's "Roth analysis"); the final year is
    // 150,855 only because that is what zeroes out David's DROP exactly.
    strategy: "manual",
    manualSchedule: [
      150_000, 150_000, 150_000, 150_000, 150_000, 150_000, 150_000, 150_855,
    ],
  },
};
