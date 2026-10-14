import { describe, expect, it } from "vitest";
import type { Household } from "@/lib/domain/types";
import type { ProjectionOptions, ProjectionRow } from "@/lib/engine/types";
import { projectScenario, projectionYears } from "@/lib/engine/project";
import { SOCIAL_SECURITY_TAXABLE_PCT } from "@/lib/config/federalTax";

// Alex (born 1960) and Sam (born 1962), retired in 2026. Accounts don't grow
// on their own, so the 8% after an event is easy to see.
function couple(patch: Partial<Household> = {}): Household {
  return {
    filingStatus: "mfj",
    residenceState: "FL",
    people: [
      { id: "a", name: "Alex", birthYear: 1960, retirementYear: 2026, sex: "male" },
      { id: "b", name: "Sam", birthYear: 1962, retirementYear: 2026, sex: "female" },
    ],
    mainPersonId: "a",
    accounts: [
      { id: "brk", label: "Brokerage", ownerId: "a", kind: "investment", balance: 50_000, growthRate: 0, costBasis: 0 },
      { id: "ira", label: "IRA", ownerId: "a", kind: "retirementTaxable", balance: 300_000, growthRate: 0, retirementType: "ira" },
      { id: "roth", label: "Roth", ownerId: "a", kind: "rothTaxFree", balance: 100_000, growthRate: 0 },
    ],
    incomes: [
      { id: "ss", label: "SS", ownerId: "b", kind: "socialSecurity", monthlyAmount: 3000, growthRate: 0, taxability: "full" },
    ],
    realEstate: [
      { id: "rental", label: "Rental", purchaseYear: 2010, purchasePrice: 200_000, marketValue: 300_000, appreciationRate: 0, depreciationYears: 27.5, activeParticipation: true },
    ],
    businesses: [{ id: "biz", label: "Shop", value: 500_000, growthRate: 0 }],
    expenses: [
      { id: "living", label: "Living", amount: 10_000, frequency: "monthly", growthRate: 0 },
    ],
    assumptions: { expenseGrowth: 0, finalAge: 90 },
    optimizer: { strategy: "manual", manualSchedule: [] },
    ...patch,
  };
}

function rows(household: Household, options: ProjectionOptions = {}): ProjectionRow[] {
  return projectScenario(household, new Array(projectionYears(household)).fill(0), undefined, options);
}

const at = (r: ProjectionRow[], year: number) => r.find((row) => row.calendarYear === year)!;
const draws = (row: ProjectionRow) =>
  Object.keys(row.incomeMonthly).filter((key) => key.startsWith("draw:"));

// Alex passes at 70: the end of 2030.
const death: ProjectionOptions = { death: { personId: "a", deathAge: 70 } };

describe("lifetime income once an event happens", () => {
  it("pays nothing from the accounts in the Retirement analysis", () => {
    for (const row of rows(couple())) expect(draws(row)).toEqual([]);
  });

  it("starts the year after a death at the survivor's payout rate", () => {
    const r = rows(couple(), death);
    expect(draws(at(r, 2030))).toEqual([]);
    // Sam is 69 in 2031: 6.7% of each balance on January 1.
    const y = at(r, 2031);
    expect(y.incomeMonthly["draw:brk"] * 12).toBeCloseTo(50_000 * 0.067, 6);
    expect(y.incomeMonthly["draw:ira"] * 12).toBeCloseTo(300_000 * 0.067, 6);
    expect(y.incomeMonthly["draw:roth"] * 12).toBeCloseTo(100_000 * 0.067, 6);
  });

  it("grows what's left at 8% and keeps the income fixed", () => {
    const r = rows(couple(), death);
    const income = 300_000 * 0.067;
    expect(at(r, 2031).balances.ira).toBeCloseTo(300_000 * 1.08 - income, 6);
    expect(at(r, 2032).balances.ira).toBeCloseTo((300_000 * 1.08 - income) * 1.08 - income, 6);
    expect(at(r, 2045).incomeMonthly["draw:ira"] * 12).toBeCloseTo(income, 6);
  });

  it("taxes each income like the account's money", () => {
    const y = at(rows(couple(), death), 2031);
    // IRA income is ordinary; the zero-basis brokerage income is all gain;
    // Roth income is tax free.
    expect(y.grossTaxableIncome).toBeCloseTo(36_000 * SOCIAL_SECURITY_TAXABLE_PCT + 300_000 * 0.067, 6);
    expect(y.capitalGainsIncome).toBeCloseTo(
      50_000 * 0.067 + y.incomeMonthly["topup:brk"] * 12,
      6,
    );
  });

  it("takes more to cover a year still short, investment account first", () => {
    const r = rows(couple(), death);
    expect(at(r, 2030).incomeMonthly["topup:brk"]).toBeUndefined();
    const y = at(r, 2031);
    // $84,000 of spending (70% after the death) against $36,000 of Social
    // Security and the lifetime income: the brokerage covers the rest.
    expect(y.incomeMonthly["topup:brk"]).toBeGreaterThan(0);
    expect(y.incomeMonthly["topup:ira"]).toBeUndefined();
    expect(y.surplus).toBeCloseTo(0, 1);
    // Every year is covered until the accounts run dry.
    const covered = r.filter((row) => row.calendarYear > 2030 && row.retirementTotal + row.rothTotal + row.afterTaxTotal > 1);
    for (const row of covered) expect(row.surplus).toBeGreaterThan(-0.1);
  });

  it("then the IRA, grossed up for its tax, and the Roth last", () => {
    const r = rows(couple(), death);
    const firstIra = r.find((row) => (row.incomeMonthly["topup:ira"] ?? 0) > 0)!;
    expect(firstIra.surplus).toBeCloseTo(0, 1);
    const ira = (firstIra.incomeMonthly["draw:ira"] + firstIra.incomeMonthly["topup:ira"]) * 12;
    expect(firstIra.grossTaxableIncome).toBeCloseTo(36_000 * SOCIAL_SECURITY_TAXABLE_PCT + ira, 6);
    const firstRoth = r.find((row) => (row.incomeMonthly["topup:roth"] ?? 0) > 0);
    if (firstRoth) expect(firstRoth.calendarYear).toBeGreaterThanOrEqual(firstIra.calendarYear);
  });

  it("takes nothing extra when the income covers the year", () => {
    const rich = couple({
      incomes: [
        { id: "ss", label: "SS", ownerId: "b", kind: "socialSecurity", monthlyAmount: 15_000, growthRate: 0, taxability: "full" },
      ],
    });
    for (const row of rows(rich, death)) {
      expect(Object.keys(row.incomeMonthly).filter((k) => k.startsWith("topup:"))).toEqual([]);
    }
  });

  it("counts the income toward the RMD", () => {
    // Sam's RMD age is 75 (2037): 6.7% beats the required ~4%.
    expect(at(rows(couple(), death), 2040).incomeMonthly["rmd:ira"]).toBeUndefined();
    expect(at(rows(couple()), 2040).incomeMonthly["rmd:ira"]).toBeGreaterThan(0);
  });

  it("never touches business or real estate", () => {
    const r = rows(couple(), death);
    const plain = rows(couple());
    for (const row of r) {
      const same = at(plain, row.calendarYear);
      expect(row.businessEquity).toBe(same.businessEquity);
      expect(row.realEstateValue).toBe(same.realEstateValue);
    }
  });

  it("starts in the first year of long-term care at the owner's age", () => {
    // Alex in home care from 75 (2035): 7.3%.
    const care: ProjectionOptions = {
      longTermCare: {
        who: "one",
        personId: "a",
        careType: "home",
        inflation: 0,
        periods: [{ personId: "a", startAge: 75, years: 3 }],
      },
    };
    const r = rows(couple(), care);
    expect(draws(at(r, 2034))).toEqual([]);
    const ira = at(r, 2034).balances.ira;
    expect(at(r, 2035).incomeMonthly["draw:ira"] * 12).toBeCloseTo(ira * 0.073, 6);
    // Care is over, but the income keeps paying.
    expect(at(r, 2040).incomeMonthly["draw:ira"] * 12).toBeCloseTo(ira * 0.073, 6);
  });

  it("takes more to cover a long-term care year still short, until the accounts run dry", () => {
    // Both in a nursing home from 75 for 3 years ($20,000 a month of care):
    // the lifetime income and Social Security fall well short.
    const care: ProjectionOptions = {
      longTermCare: { who: "both", personId: "a", careType: "nursing", inflation: 0, periods: [] },
    };
    const r = rows(couple(), care);
    const y = r.find((row) => Object.keys(row.expenseMonthly).some((k) => k.startsWith("ltc:")))!;
    expect(y.incomeMonthly["topup:brk"]).toBeGreaterThan(0);
    expect(y.surplus).toBeCloseTo(0, 1);
    const covered = r.filter(
      (row) => row.calendarYear >= y.calendarYear && row.retirementTotal + row.rothTotal + row.afterTaxTotal > 1,
    );
    for (const row of covered) expect(row.surplus).toBeGreaterThan(-0.1);
  });

  it("stops the deceased's own contributions, but not a joint account's while the survivor works", () => {
    const working = couple({
      people: [
        { id: "a", name: "Alex", birthYear: 1960, retirementYear: 2036, sex: "male" },
        { id: "b", name: "Sam", birthYear: 1962, retirementYear: 2034, sex: "female" },
      ],
      assumptions: { expenseGrowth: 0, finalAge: 90, startYear: 2026 },
      accounts: [
        { id: "ira", label: "IRA", ownerId: "a", kind: "retirementTaxable", balance: 300_000, growthRate: 0, retirementType: "ira",
          deposits: [{ id: "sep", label: "SEP", amount: 1_000, frequency: "monthly", startYear: 2026, endYear: 2040 }] },
        { id: "brk", label: "Brokerage", ownerId: "a", kind: "investment", balance: 50_000, growthRate: 0, costBasis: 0, joint: true,
          deposits: [{ id: "save", label: "Savings", amount: 500, frequency: "monthly", startYear: 2026 }] },
      ],
    });
    const r = rows(working, death);
    expect(at(r, 2030).depositMonthly.sep).toBe(1_000);
    expect(at(r, 2031).depositMonthly.sep).toBeUndefined();
    // Sam keeps saving into the joint account until retiring in 2034.
    expect(at(r, 2033).depositMonthly.save).toBe(500);
    expect(at(r, 2034).depositMonthly.save).toBeUndefined();
    // Without a death, both stop the year Alex (the later one) retires.
    const plain = rows(working);
    expect(at(plain, 2035).depositMonthly.sep).toBe(1_000);
    expect(at(plain, 2035).depositMonthly.save).toBe(500);
    expect(at(plain, 2036).monthlyDeposits).toBe(0);
  });

});
