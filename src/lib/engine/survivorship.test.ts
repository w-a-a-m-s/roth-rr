import { describe, expect, it } from "vitest";
import type { Household } from "@/lib/domain/types";
import { projectScenario, projectionYears } from "@/lib/engine/project";
import { calculate } from "@/lib/calculate";
import {
  defaultDeathEvent,
  resolveDeath,
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

  it("moves the deceased's IRA to the survivor, so RMDs wait for the survivor's RMD age", () => {
    expect(year(plain, 2029).incomeMonthly["rmd:iraA"]).toBeGreaterThan(0);
    expect(year(after, 2029).incomeMonthly["rmd:iraA"]).toBeUndefined();
    expect(year(after, 2036).incomeMonthly["rmd:iraA"]).toBeUndefined();
    expect(year(after, 2037).incomeMonthly["rmd:iraA"]).toBeGreaterThan(0);
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
