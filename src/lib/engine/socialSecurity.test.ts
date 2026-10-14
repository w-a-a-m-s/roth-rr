import { describe, it, expect } from "vitest";
import type { Household } from "@/lib/domain/types";
import { socialSecurityBreakeven } from "@/lib/engine/socialSecurity";

/** Single filer born 1962: Social Security from 2028 (age 66), 2% COLA, to 90. */
function plan(monthly: number): Household {
  return {
    filingStatus: "single",
    residenceState: "FL",
    people: [{ id: "p1", name: "Shelya", birthYear: 1962, retirementYear: 2028 }],
    accounts: [],
    incomes: [
      {
        id: "ss",
        label: "Social Security",
        ownerId: "p1",
        kind: "socialSecurity",
        monthlyAmount: monthly,
        growthRate: 0.02,
        taxability: "full",
        startYear: 2028,
      },
    ],
    realEstate: [],
    expenses: [],
    assumptions: { expenseGrowth: 0.02, finalAge: 90 },
    optimizer: { strategy: "manual" },
  } as unknown as Household;
}

describe("Social Security breakeven", () => {
  it("$2,600 at 66 vs $3,800 at 70 crosses over in 2041, at 79", () => {
    const h = plan(2600);
    h.socialSecurityClaims = [{ id: "c70", personId: "p1", age: 70, monthlyAmount: 3800 }];
    const r = socialSecurityBreakeven(h, "p1")!;
    expect(r.options.map((o) => [o.label, o.claimYear])).toEqual([
      ["Plan: claim at 66", 2028],
      ["Claim at 70", 2032],
    ]);
    // Years run from the first claim to age 90.
    expect(r.years[0].year).toBe(2028);
    expect(r.years[r.years.length - 1].age).toBe(90);
    // The plan's benefit grows 2% a year from its claim; the later claim
    // starts at its own amount the year it begins.
    const y2032 = r.years.find((y) => y.year === 2032)!;
    expect(y2032.annual[0]).toBeCloseTo(2600 * 12 * 1.02 ** 4, 2);
    expect(y2032.annual[1]).toBeCloseTo(3800 * 12, 2);
    expect(r.years.find((y) => y.year === 2031)!.annual[1]).toBe(0);
    const [c] = r.crossovers;
    expect(c.year).toBe(2041);
    expect(c.age).toBe(79);
    const y2040 = r.years.find((y) => y.year === 2040)!;
    expect(y2040.cumulative[1]).toBeLessThan(y2040.cumulative[0]);
    expect(Math.round(c.differenceAtEnd)).toBe(176_374);
    expect(Math.round(c.totalAtEnd)).toBe(1_175_719);
  });

  it("an earlier, smaller claim crosses when the plan catches up", () => {
    const h = plan(3800);
    h.incomes[0].startYear = 2032;
    h.socialSecurityClaims = [{ id: "c66", personId: "p1", age: 66, monthlyAmount: 2600 }];
    const r = socialSecurityBreakeven(h, "p1")!;
    expect(r.crossovers[0].year).toBe(2041);
    expect(r.crossovers[0].differenceAtEnd).toBeLessThan(0);
  });

  it("reports no crossover when the other claim never catches up", () => {
    const h = plan(2600);
    h.socialSecurityClaims = [{ id: "c70", personId: "p1", age: 70, monthlyAmount: 2700 }];
    expect(socialSecurityBreakeven(h, "p1")!.crossovers[0].year).toBeNull();
  });

  it("skips other people's claims and empty amounts, and needs a Social Security income", () => {
    const h = plan(2600);
    h.socialSecurityClaims = [
      { id: "x", personId: "p2", age: 70, monthlyAmount: 3800 },
      { id: "y", personId: "p1", age: 68, monthlyAmount: 0 },
    ];
    expect(socialSecurityBreakeven(h, "p1")!.options).toHaveLength(1);
    h.incomes = [];
    expect(socialSecurityBreakeven(h, "p1")).toBeNull();
  });
});

describe("Social Security claim limit", () => {
  it("compares the plan with at most two other ages, the first two entered", () => {
    const h = plan(2600);
    h.socialSecurityClaims = [
      { id: "c70", personId: "p1", age: 70, monthlyAmount: 3800 },
      { id: "c67", personId: "p1", age: 67, monthlyAmount: 2800 },
      { id: "c68", personId: "p1", age: 68, monthlyAmount: 3000 },
    ];
    const r = socialSecurityBreakeven(h, "p1")!;
    expect(r.options.map((o) => o.label)).toEqual([
      "Plan: claim at 66",
      "Claim at 67",
      "Claim at 70",
    ]);
    expect(r.crossovers).toHaveLength(2);
  });
});
