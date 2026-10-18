import { describe, expect, it } from "vitest";
import { netInvestmentIncomeTax } from "@/lib/engine/netInvestmentIncomeTax";
import { projectScenario, projectionYears } from "@/lib/engine/project";
import type { Household } from "@/lib/domain/types";

describe("netInvestmentIncomeTax (Form 8960)", () => {
  it("owes nothing at or under the threshold", () => {
    expect(netInvestmentIncomeTax(100_000, 250_000, "mfj")).toBe(0);
    expect(netInvestmentIncomeTax(100_000, 200_000, "single")).toBe(0);
  });

  it("taxes the smaller of investment income and MAGI over the threshold", () => {
    // $300k MAGI joint: $50k over, but only $20k of investment income.
    expect(netInvestmentIncomeTax(20_000, 300_000, "mfj")).toBeCloseTo(0.038 * 20_000, 6);
    // $260k MAGI joint: $10k over, less than the $20k of investment income.
    expect(netInvestmentIncomeTax(20_000, 260_000, "mfj")).toBeCloseTo(0.038 * 10_000, 6);
  });

  it("uses each filing status's threshold", () => {
    // $230k MAGI: over the $200k single / HOH line, under $250k joint.
    expect(netInvestmentIncomeTax(50_000, 230_000, "single")).toBeCloseTo(0.038 * 30_000, 6);
    expect(netInvestmentIncomeTax(50_000, 230_000, "hoh")).toBeCloseTo(0.038 * 30_000, 6);
    expect(netInvestmentIncomeTax(50_000, 230_000, "mfj")).toBe(0);
  });

  it("owes nothing on a net investment loss", () => {
    expect(netInvestmentIncomeTax(-10_000, 900_000, "mfj")).toBe(0);
  });
});

describe("net investment income tax in the projection", () => {
  // One retiree: a pension plus a $60k draw from a zero-basis brokerage
  // account (all gain), and an IRA to convert from.
  const plan = (pension: number): Household => ({
    filingStatus: "single",
    residenceState: "FL",
    people: [{ id: "p1", name: "Sam", birthYear: 1962, retirementYear: 2026 }],
    accounts: [
      {
        id: "brk",
        label: "Brokerage",
        ownerId: "p1",
        kind: "investment",
        balance: 2_000_000,
        costBasis: 0,
        growthRate: 0,
      },
      { id: "ira", label: "IRA", ownerId: "p1", kind: "retirementTaxable", balance: 500_000, growthRate: 0 },
    ],
    incomes: [
      {
        id: "pension",
        label: "Pension",
        ownerId: "p1",
        kind: "pension",
        monthlyAmount: pension / 12,
        growthRate: 0,
        taxability: "full",
      },
      {
        id: "draw",
        label: "Brokerage draw",
        ownerId: "p1",
        kind: "afterTaxWithdrawal",
        monthlyAmount: 60_000 / 12,
        growthRate: 0,
        taxability: "taxFree",
        drawsFromAccountId: "brk",
      },
    ],
    realEstate: [],
    expenses: [],
    assumptions: { expenseGrowth: 0, finalAge: 66, taxIndexing: 0 },
    optimizer: { strategy: "manual" },
  });
  const first = (h: Household, conversion = 0) =>
    projectScenario(h, [conversion, ...new Array(projectionYears(h) - 1).fill(0)])[0];

  it("taxes gains when MAGI passes the threshold", () => {
    // $100k pension + $60k gains = $160k: under $200k, no tax.
    expect(first(plan(100_000)).netInvestmentIncomeTax).toBe(0);
    // $180k + $60k = $240k: $40k over, less than the $60k of gains.
    const row = first(plan(180_000));
    expect(row.netInvestmentIncome).toBeCloseTo(60_000, 6);
    expect(row.netInvestmentIncomeTax).toBeCloseTo(0.038 * 40_000, 6);
    expect(row.federalAnnualTax).toBeCloseTo(
      row.federalOrdinaryTax + row.federalCapitalGainsTax + row.netInvestmentIncomeTax,
      6,
    );
  });

  it("is pushed up by a Roth conversion, which isn't investment income itself", () => {
    // $100k pension + $60k gains + $80k conversion = $240k MAGI.
    const row = first(plan(100_000), 80_000);
    expect(row.conversion).toBe(80_000);
    expect(row.netInvestmentIncome).toBeCloseTo(60_000, 6);
    expect(row.netInvestmentIncomeTax).toBeCloseTo(0.038 * 40_000, 6);
  });

  const rental = (realEstateProfessional: boolean): Household => ({
    ...plan(300_000),
    incomes: plan(300_000).incomes.filter((i) => i.id === "pension"),
    realEstateProfessional,
    realEstate: [
      {
        id: "re",
        label: "Rental",
        purchaseYear: 1990,
        purchasePrice: 100_000,
        marketValue: 500_000,
        appreciationRate: 0,
        depreciationYears: 27.5,
        activeParticipation: true,
        monthlyRent: 3_000,
        monthlyOperatingExpenses: 1_000,
        rentGrowthRate: 0,
        loans: [],
      },
    ],
  });

  it("counts net rental income, except for a real-estate professional", () => {
    // $36k rent less $12k expenses, fully depreciated long ago: $24k net.
    const row = first(rental(false));
    expect(row.netInvestmentIncome).toBeCloseTo(24_000, 6);
    expect(row.netInvestmentIncomeTax).toBeCloseTo(0.038 * 24_000, 6);
    expect(first(rental(true)).netInvestmentIncomeTax).toBe(0);
  });
});
