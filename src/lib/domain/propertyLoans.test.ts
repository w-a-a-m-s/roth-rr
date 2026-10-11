import { describe, expect, it } from "vitest";
import type { Household } from "@/lib/domain/types";
import { propertyMortgageStatements } from "@/lib/domain/propertyLoans";

const next = { month: 11, year: 2026 };
const household = (extra: Partial<Household> = {}): Household => ({
  filingStatus: "single",
  residenceState: "FL",
  people: [{ id: "p", name: "P", birthYear: 1960, retirementYear: 2026 }],
  accounts: [],
  incomes: [],
  realEstate: [
    {
      id: "re1",
      label: "Tara",
      purchaseYear: 2015,
      purchasePrice: 700_000,
      marketValue: 1_600_000,
      appreciationRate: 0.03,
      depreciationYears: 27.5,
      loans: [
        { id: "m1", kind: "mortgage", label: "Mortgage", balance: 264_057, rate: 0.0425, monthlyPayment: 2671 },
        { id: "l1", kind: "lineOfCredit", label: "HELOC", balance: 162_952, rate: 0.0574 },
        { id: "m2", kind: "mortgage", label: "Paid off", balance: 0, rate: 0.03, monthlyPayment: 900 },
      ],
    },
  ],
  expenses: [],
  assumptions: { expenseGrowth: 0.02, finalAge: 90 },
  optimizer: { strategy: "manual", manualSchedule: [] },
  ...extra,
});

describe("propertyMortgageStatements", () => {
  it("brings each property mortgage with a balance into Mortgage analysis", () => {
    expect(propertyMortgageStatements(household(), next)).toEqual([
      {
        id: "mtg-m1",
        label: "Tara · Mortgage",
        propertyId: "re1",
        loanId: "m1",
        principalBalance: 264_057,
        interestRate: 0.0425,
        monthlyPayment: 2671,
        nextPaymentMonth: 11,
        nextPaymentYear: 2026,
      },
    ]);
  });

  it("skips a mortgage that already has a statement, saved or deleted", () => {
    const statement = { id: "x", label: "Mine", loanId: "m1", principalBalance: 1, interestRate: 0, nextPaymentMonth: 1, nextPaymentYear: 2027 };
    expect(propertyMortgageStatements(household({ mortgages: [statement] }), next)).toEqual([]);
    expect(
      propertyMortgageStatements(household({ deletedMortgages: [{ item: statement, deletedAt: "2026-10-11T00:00:00Z" }] }), next),
    ).toEqual([]);
  });
});
