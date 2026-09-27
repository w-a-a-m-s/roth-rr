import type { Household } from "@/lib/domain/types";
import { DEFAULT_ASSUMPTIONS } from "@/lib/config/defaults";
import { uid } from "@/lib/id";

/**
 * The "David & Batsheva" household, transcribed from the source spreadsheet
 * (`doc/reference/Example - Aligned.xlsx`). Used as the default
 * dataset so the app opens with a working example and so the engine can be
 * validated against the spreadsheet's known results.
 */
export const SAMPLE_HOUSEHOLD: Household = {
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
    // Tax-deferred retirement accounts.
    { id: "drop-s1", label: "DROP (David)", ownerId: "p1", kind: "retirementTaxable", retirementType: "drop", balance: 1_100_000, growthRate: 0.05 },
    { id: "drop-s2", label: "DROP (Batsheva)", ownerId: "p2", kind: "retirementTaxable", retirementType: "drop", balance: 300_000, growthRate: 0.05 },
    { id: "tsp-s1", label: "403(B)/401(K)/TSP (David)", ownerId: "p1", kind: "retirementTaxable", retirementType: "tsp", balance: 250_000, growthRate: 0.05 },
    { id: "tsp-s2", label: "403(B)/401(K)/TSP (Batsheva)", ownerId: "p2", kind: "retirementTaxable", retirementType: "tsp", balance: 120_000, growthRate: 0.05 },
    { id: "ira-s1", label: "IRA (David)", ownerId: "p1", kind: "retirementTaxable", retirementType: "ira", balance: 50_000, growthRate: 0.05 },
    { id: "ira-s2", label: "IRA (Batsheva)", ownerId: "p2", kind: "retirementTaxable", retirementType: "ira", balance: 20_000, growthRate: 0.05 },
    // Tax-free Roth accounts (receive conversions in list order).
    { id: "roth-s1", label: "Roth IRA (David)", ownerId: "p1", kind: "rothTaxFree", balance: 30_000, growthRate: 0.08 },
    { id: "roth-s2", label: "Roth IRA (Batsheva)", ownerId: "p2", kind: "rothTaxFree", balance: 15_000, growthRate: 0.08 },
    // After-tax accounts (cost basis used for inheritance valuation).
    { id: "annuity", label: "Annuity", ownerId: "p1", kind: "annuity", balance: 40_000, costBasis: 30_000, growthRate: 0.05 },
    { id: "brokerage", label: "Investment account", ownerId: "p1", kind: "investment", balance: 400_000, costBasis: 500_000, growthRate: 0.05 },
  ],
  incomes: [
    { id: "pension-s1", label: "Pension (David)", ownerId: "p1", kind: "pension", monthlyAmount: 4_000, growthRate: 0.023, taxability: "full" },
    { id: "pension-s2", label: "Pension (Batsheva)", ownerId: "p2", kind: "pension", monthlyAmount: 4_000, growthRate: 0.02, taxability: "full" },
    // Salary stops the year the owner retires (Batsheva retires 2032).
    { id: "salary-s2", label: "Salary (Batsheva)", ownerId: "p2", kind: "salary", monthlyAmount: 7_500, growthRate: 0.02, taxability: "full", endYear: 2031 },
    { id: "business", label: "Business income", ownerId: "p1", kind: "business", monthlyAmount: 2_000, growthRate: 0, taxability: "full", endYear: 2035 },
    { id: "ss-s1", label: "Social Security (David)", ownerId: "p1", kind: "socialSecurity", monthlyAmount: 3_000, growthRate: 0.02, taxability: "full" },
    { id: "ss-s2", label: "Social Security (Batsheva)", ownerId: "p2", kind: "socialSecurity", monthlyAmount: 2_600, growthRate: 0.02, taxability: "full" },
    { id: "military", label: "Military pension", ownerId: "p1", kind: "militaryPension", monthlyAmount: 1_100, growthRate: 0.02, taxability: "taxFree" },
    // Rental income is modeled on the property itself (see realEstate below).
    // Discretionary draw from the DROP account (continues alongside RMDs).
    { id: "discretionary", label: "Income from retirement assets", ownerId: "p1", kind: "retirementDraw", monthlyAmount: 1_000, growthRate: 0, taxability: "full", drawsFromAccountId: "drop-s1" },
  ],
  realEstate: [
    // Net rent of ~1,400/mo (4,000 rent - 2,600 expenses), owned free and clear.
    {
      id: "re-investment",
      label: "Investment property",
      purchaseYear: 2010,
      purchasePrice: 300_000,
      marketValue: 1_000_000,
      appreciationRate: 0.03,
      depreciationYears: 27.5,
      monthlyRent: 4_000,
      monthlyOperatingExpenses: 2_600,
      rentGrowthRate: 0.02,
      activeParticipation: true,
    },
  ],
  realEstateProfessional: false,
  deletedPeople: [],
  deletedAccounts: [],
  deletedIncomes: [],
  deletedRealEstate: [],
  deletedExpenses: [],
  assumptions: DEFAULT_ASSUMPTIONS,
  optimizer: {
    // The spreadsheet's hand-tuned conversion schedule.
    strategy: "manual",
    manualSchedule: [150_000, 150_000, 150_000, 150_000, 150_000, 150_000, 150_000, 150_855],
  },
};

/** A clean starting household for a brand-new plan (no pre-filled data). */
export function createBlankHousehold(): Household {
  return {
    filingStatus: "single",
    residenceState: "FL",
    expenses: [],
    people: [{ id: uid("p"), name: "" }],
    accounts: [],
    incomes: [],
    realEstate: [],
    realEstateProfessional: false,
    deletedPeople: [],
    deletedAccounts: [],
    deletedIncomes: [],
    deletedRealEstate: [],
    deletedExpenses: [],
    assumptions: structuredClone(DEFAULT_ASSUMPTIONS),
    optimizer: { strategy: "manual" },
  };
}
