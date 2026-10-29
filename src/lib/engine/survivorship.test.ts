import { uniformLifetimeDenominator } from "@/lib/config/rmdTable";
import { describe, expect, it } from "vitest";
import type { Household } from "@/lib/domain/types";
import { projectScenario, projectionYears } from "@/lib/engine/project";
import { calculate } from "@/lib/calculate";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";

const FALLBACK_WITH_DATE = (asOfDate: string) => ({ ...FALLBACK_REFERENCE_DATA, asOfDate });
import {
  defaultDeathEvent,
  resolveDeath,
  socialSecurityAfterDeath,
  survivorshipEvent,
} from "@/lib/domain/survivorship";

// Alex (born 1952, RMD at 73) passes at 76, the end of 2028. Sam (born 1962,
// RMD at 75) survives.
function couple(): Household {
  return {
    filingStatus: "mfj",
    residenceState: "FL",
    people: [
      { id: "a", name: "Alex", birthYear: 1952, retirementYear: 2026 },
      { id: "b", name: "Sam", birthYear: 1962, retirementYear: 2026 },
    ],
    mainPersonId: "a",
    accounts: [
      { id: "iraA", label: "IRA Alex", ownerId: "a", kind: "retirementTaxable", balance: 500_000, growthRate: 0.05, retirementType: "ira" },
    ],
    incomes: [
      { id: "penLife", label: "Pension life", ownerId: "a", kind: "pension", monthlyAmount: 3000, growthRate: 0, taxability: "full" },
      { id: "penSurv", label: "Pension survivor", ownerId: "a", kind: "militaryPension", monthlyAmount: 1000, growthRate: 0, taxability: "full", pensionPayout: "survivor" },
      { id: "ssA", label: "SS Alex", ownerId: "a", kind: "socialSecurity", monthlyAmount: 3000, growthRate: 0, taxability: "full" },
      { id: "ssB", label: "SS Sam", ownerId: "b", kind: "socialSecurity", monthlyAmount: 1500, growthRate: 0, taxability: "full" },
      { id: "salB", label: "Salary Sam", ownerId: "b", kind: "salary", monthlyAmount: 2000, growthRate: 0, taxability: "full" },
    ],
    realEstate: [],
    expenses: [
      { id: "living", label: "Living", amount: 5000, frequency: "monthly", growthRate: 0 },
    ],
    assumptions: { expenseGrowth: 0, finalAge: 95 },
    optimizer: { strategy: "manual", manualSchedule: [] },
  };
}

const death = { personId: "a", deathAge: 76 };
const zeros = (h: Household) => new Array(projectionYears(h)).fill(0);

function rows(withDeath: boolean) {
  const h = couple();
  return projectScenario(h, zeros(h), undefined, withDeath ? { death } : {});
}
const year = (r: ReturnType<typeof rows>, y: number) => r.find((x) => x.calendarYear === y)!;

describe("survivorship projection", () => {
  const after = rows(true);
  const plain = rows(false);

  it("pays everything through the year of death", () => {
    const y = year(after, 2028);
    expect(y.incomeMonthly.penLife).toBe(3000);
    expect(y.filingStatus).toBe("mfj");
    expect(y.livingIds).toEqual(["a", "b"]);
  });

  it("stops a life-only pension and keeps a survivorship pension the same", () => {
    const y = year(after, 2029);
    expect(y.incomeMonthly.penLife).toBeUndefined();
    expect(y.incomeMonthly.penSurv).toBe(1000);
  });

  it("keeps the larger Social Security benefit for the survivor", () => {
    const y = year(after, 2029);
    expect(y.incomeMonthly.ssA).toBe(3000);
    expect(y.incomeMonthly.ssB).toBeUndefined();
  });

  it("cuts expenses to 70% from the year after the death", () => {
    expect(year(after, 2028).monthlyExpenses).toBe(5000);
    expect(year(after, 2029).monthlyExpenses).toBeCloseTo(3500, 6);
    expect(year(after, 2029).expenseMonthly.living).toBeCloseTo(3500, 6);
    expect(year(plain, 2029).monthlyExpenses).toBe(5000);
  });

  it("leaves the survivor's own income alone", () => {
    expect(year(after, 2029).incomeMonthly.salB).toBe(2000);
  });

  it("files single from the year after the death", () => {
    const y = year(after, 2029);
    expect(y.filingStatus).toBe("single");
    expect(y.livingIds).toEqual(["b"]);
  });

  it("moves the deceased's IRA to the survivor: its lifetime income goes by the survivor's age and covers the RMD", () => {
    expect(year(plain, 2029).incomeMonthly["rmd:iraA"]).toBeGreaterThan(0);
    // Sam is 67 in 2029: 6.0% of the IRA on January 1.
    const income = year(after, 2028).balances.iraA * 0.06;
    expect(year(after, 2029).incomeMonthly["draw:iraA"] * 12).toBeCloseTo(income, 6);
    // At Sam's RMD age (75 in 2037) the income is more than the RMD.
    for (const y of [2029, 2036, 2037]) {
      expect(year(after, y).incomeMonthly["rmd:iraA"]).toBeUndefined();
    }
    // Later the RMD outgrows the fixed income and only the difference is added.
    const late = year(after, 2045);
    const required = year(after, 2044).balances.iraA / uniformLifetimeDenominator(83);
    expect(late.incomeMonthly["rmd:iraA"] * 12).toBeCloseTo(required - income, 6);
  });

  it("stops the deceased's disability insurance", () => {
    const h = couple();
    h.incomes.push({
      id: "disA",
      label: "Disability Alex",
      ownerId: "a",
      kind: "disabilityInsurance",
      monthlyAmount: 2000,
      growthRate: 0,
      taxability: "taxFree",
    });
    const r = projectScenario(h, zeros(h), undefined, { death });
    expect(year(r, 2028).incomeMonthly.disA).toBe(2000);
    expect(year(r, 2029).incomeMonthly.disA).toBeUndefined();
  });

  it("changes nothing without a death", () => {
    const h = couple();
    expect(calculate(h)).toEqual(calculate(h, undefined, {}));
    expect(year(plain, 2040).filingStatus).toBe("mfj");
  });
});

describe("survivorship setting", () => {
  it("defaults to the main person at 80 and needs two people", () => {
    const h = couple();
    expect(defaultDeathEvent(h)).toEqual({ personId: "a", deathAge: 80 });
    expect(defaultDeathEvent({ ...h, people: [h.people[0]] })).toBeNull();
  });

  it("uses a valid saved setting and falls back otherwise", () => {
    const h = couple();
    expect(survivorshipEvent({ ...h, survivorship: { personId: "b", deathAge: 70 } })).toEqual({
      personId: "b",
      deathAge: 70,
    });
    expect(survivorshipEvent({ ...h, survivorship: { personId: "gone", deathAge: 70 } })).toEqual({
      personId: "a",
      deathAge: 80,
    });
  });

  it("resolves the death year from the birth year", () => {
    expect(resolveDeath(couple(), death)).toEqual({ personId: "a", year: 2028, survivorId: "b" });
  });
});

describe("socialSecurityAfterDeath", () => {
  it("reports a step-up when the deceased's benefit is larger", () => {
    const h = couple();
    expect(socialSecurityAfterDeath(h, resolveDeath(h, death), 2026, 2057)).toEqual({
      steppedUp: true,
      year: 2029,
      deceasedMonthly: 3000,
      survivorMonthly: 1500,
    });
  });

  it("reports no step-up when the survivor's own benefit is larger", () => {
    const h = couple();
    const r = socialSecurityAfterDeath(h, resolveDeath(h, { personId: "b", deathAge: 70 }), 2026, 2057);
    expect(r?.steppedUp).toBe(false);
    expect(r?.survivorMonthly).toBe(3000);
  });

  it("is null without Social Security", () => {
    const h = { ...couple(), incomes: [] };
    expect(socialSecurityAfterDeath(h, resolveDeath(h, death), 2026, 2057)).toBeNull();
  });
});

// Ran (born 1973) and Rita (born 1979) both retire in 2040, so the plan
// starts in 2040, when Ran is 67.
function laterRetirees(): Household {
  return {
    filingStatus: "mfj",
    residenceState: "FL",
    people: [
      { id: "r", name: "Ran", birthYear: 1973, retirementYear: 2040 },
      { id: "t", name: "Rita", birthYear: 1979, retirementYear: 2040 },
    ],
    mainPersonId: "r",
    accounts: [
      { id: "sep", label: "SEP", ownerId: "r", kind: "retirementTaxable", balance: 500_000, growthRate: 0.06, retirementType: "ira" },
      { id: "brk", label: "Brokerage", ownerId: "r", kind: "investment", balance: 100_000, growthRate: 0.05, costBasis: 100_000 },
    ],
    incomes: [
      { id: "ssR", label: "SS Ran", ownerId: "r", kind: "socialSecurity", monthlyAmount: 4000, growthRate: 0.02, taxability: "full", startYear: 2040 },
      { id: "rent", label: "Side income", ownerId: "t", kind: "other", monthlyAmount: 1000, growthRate: 0.03, taxability: "full" },
    ],
    realEstate: [],
    expenses: [
      { id: "living", label: "Living", amount: 8000, frequency: "monthly", growthRate: 0.02 },
    ],
    assumptions: { expenseGrowth: 0, finalAge: 90 },
    optimizer: { strategy: "manual", manualSchedule: [50_000, 50_000] },
    insurance: [
      { id: "wl", kind: "life", label: "Whole life", insuredId: "r", policyType: "permanent", permanentType: "whole", faceAmount: 1_000_000 },
    ],
  };
}

describe("a death before the plan starts", () => {
  const h = laterRetirees();
  // Ran passes at 55, the end of 2028.
  const early = { death: { personId: "r", deathAge: 55 } };
  const plain = calculate(h);
  const survivor = calculate(h, undefined, early);
  const rows = survivor.roth.rows;
  const at = (y: number) => rows.find((r) => r.calendarYear === y)!;

  it("starts the projection in the year of death and still runs to the plan's final age", () => {
    expect(rows[0].calendarYear).toBe(2028);
    expect(rows[rows.length - 1].calendarYear).toBe(plain.roth.rows[plain.roth.rows.length - 1].calendarYear);
    expect(rows.length).toBe(projectionYears(h) + 12);
  });

  it("keeps start-year dollars anchored to the plan start", () => {
    const planRow = plain.roth.rows[0];
    expect(at(2040).incomeMonthly.rent).toBeCloseTo(planRow.incomeMonthly.rent, 6);
    // Before the plan start the amount holds at what was entered.
    expect(at(2028).incomeMonthly.rent).toBe(1000);
    expect(at(2041).incomeMonthly.rent).toBeCloseTo(1030, 6);
    expect(at(2041).expenseMonthly.living).toBeCloseTo(8000 * 1.02 * 0.7, 6);
  });

  it("only converts in plan years", () => {
    expect(at(2030).conversion).toBe(0);
    expect(at(2040).conversion).toBe(50_000);
    expect(at(2041).conversion).toBe(50_000);
  });

  it("pays life insurance from the year after the death at the under-59 rate", () => {
    expect(at(2028).incomeMonthly["life:wl"]).toBeUndefined();
    expect(at(2029).incomeMonthly["life:wl"]).toBeCloseTo(50_000 / 12, 6);
    expect(at(2029).filingStatus).toBe("single");
    expect(at(2029).livingIds).toEqual(["t"]);
  });

  it("never starts before today", () => {
    const r = projectScenario(h, [], FALLBACK_WITH_DATE("2030-03-01"), early);
    expect(r[0].calendarYear).toBe(2030);
  });

  it("leaves a death after the plan start where it was", () => {
    const later = calculate(h, undefined, { death: { personId: "r", deathAge: 75 } });
    expect(later.roth.rows[0].calendarYear).toBe(2040);
  });
});
