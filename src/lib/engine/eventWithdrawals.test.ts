import { describe, expect, it } from "vitest";
import type { Household } from "@/lib/domain/types";
import type { ProjectionOptions, ProjectionRow } from "@/lib/engine/types";
import { projectScenario, projectionYears } from "@/lib/engine/project";

// Alex (born 1960) and Sam (born 1962), retired in 2026. Spending is well
// over Social Security, so every year after an event comes up short.
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

describe("withdrawals once an event happens", () => {
  it("draws nothing in the Retirement analysis", () => {
    for (const row of rows(couple())) expect(draws(row)).toEqual([]);
  });

  it("starts the year after a death and covers the shortfall exactly", () => {
    const r = rows(couple(), death);
    expect(draws(at(r, 2030))).toEqual([]);
    expect(at(r, 2030).surplus).toBeLessThan(0);
    expect(draws(at(r, 2031)).length).toBeGreaterThan(0);
    expect(at(r, 2031).surplus).toBeCloseTo(0, 1);
  });

  it("draws the investment account first, realizing gains above basis", () => {
    const r = rows(couple(), death);
    const year = at(r, 2031);
    // $10,000/mo at 70% is $84,000 a year; SS covers $36,000.
    expect(year.incomeMonthly["draw:brk"] * 12).toBeCloseTo(50_000, 6);
    // Zero basis, so the whole investment draw is a gain.
    expect(year.capitalGainsIncome).toBeCloseTo(50_000, 6);
    expect(year.balances.brk).toBeCloseTo(0, 6);
  });

  it("then the IRA, grossed up for the tax it adds", () => {
    const r = rows(couple(), death);
    const year = at(r, 2031);
    const ira = year.incomeMonthly["draw:ira"] * 12;
    // The IRA covers the rest of the gap plus the year's tax.
    expect(ira).toBeCloseTo(84_000 - 36_000 - 50_000 + year.annualTax, 0);
    expect(year.balances.ira).toBeCloseTo(300_000 - ira, 6);
    expect(year.grossTaxableIncome).toBeCloseTo(36_000 * 0.85 + ira, 6);
  });

  it("reaches the Roth only once the IRA is empty, and never touches business or real estate", () => {
    const r = rows(couple(), death);
    const firstRoth = r.find((row) => (row.incomeMonthly["draw:roth"] ?? 0) > 0)!;
    expect(firstRoth).toBeDefined();
    expect(firstRoth.balances.ira).toBeCloseTo(0, 6);
    expect(at(r, 2031).incomeMonthly["draw:roth"]).toBeUndefined();
    const plain = rows(couple());
    for (const row of r) {
      const same = at(plain, row.calendarYear);
      expect(row.businessEquity).toBe(same.businessEquity);
      expect(row.realEstateValue).toBe(same.realEstateValue);
    }
  });

  it("leaves a shortfall once every account is empty", () => {
    const r = rows(couple(), death);
    const last = r[r.length - 1];
    expect(last.retirementTotal + last.rothTotal + last.afterTaxTotal).toBeCloseTo(0, 6);
    expect(last.surplus).toBeLessThan(0);
  });

  it("starts in the first year of long-term care", () => {
    // Alex in home care from 75 (2035).
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
    expect(draws(at(r, 2035)).length).toBeGreaterThan(0);
    expect(at(r, 2035).surplus).toBeCloseTo(0, 1);
    // Care is over, but the household keeps living off its accounts.
    expect(draws(at(r, 2038)).length).toBeGreaterThan(0);
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

  it("draws nothing in a year the income already covers", () => {
    const rich = couple({
      incomes: [
        { id: "ss", label: "SS", ownerId: "b", kind: "socialSecurity", monthlyAmount: 15_000, growthRate: 0, taxability: "full" },
      ],
    });
    for (const row of rows(rich, death)) expect(draws(row)).toEqual([]);
  });
});
