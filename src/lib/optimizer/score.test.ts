import { describe, expect, it } from "vitest";
import type { Household } from "@/lib/domain/types";
import { calculate } from "@/lib/calculate";
import {
  scoreConversionStrategies,
  totalImpact,
} from "@/lib/optimizer/score";

function sampleHousehold(): Household {
  return {
    filingStatus: "single",
    residenceState: "FL",
    people: [
      {
        id: "p1",
        name: "Pat",
        birthYear: 1960,
        retirementYear: 2026,
      },
    ],
    accounts: [
      {
        id: "ret",
        label: "IRA",
        ownerId: "p1",
        kind: "retirementTaxable",
        balance: 200_000,
        growthRate: 0.04,
      },
    ],
    incomes: [
      {
        id: "pen",
        label: "Pension",
        ownerId: "p1",
        kind: "pension",
        monthlyAmount: 2500,
        growthRate: 0,
        taxability: "full",
      },
    ],
    realEstate: [],
    expenses: [],
    assumptions: {
      expenseGrowth: 0,
      finalAge: 76,
    },
    optimizer: { strategy: "even" },
  };
}

describe("totalImpact", () => {
  it("combines inheritance with tax and Medicare savings", () => {
    expect(
      totalImpact({
        inheritanceFinal: 20,
        taxesTotal: 3,
        medicareTotal: 4,
      }),
    ).toBe(13);
  });
});

describe("scoreConversionStrategies", () => {
  it("returns a finite impact for each built-in strategy", () => {
    const scores = scoreConversionStrategies(sampleHousehold());
    const ids = scores.map((s) => s.id);
    expect(ids).toEqual([
      "manual",
      "even",
      "immediate",
      "fillBracket:0.12",
      "fillBracket:0.22",
      "fillBracket:0.24",
      "irmaa",
      "depleteByRmd",
    ]);
    for (const row of scores) {
      expect(Number.isFinite(row.impact)).toBe(true);
    }
  });

  it("matches calculate() for the selected even strategy", () => {
    const h = sampleHousehold();
    const even = scoreConversionStrategies(h).find((s) => s.id === "even");
    expect(even).toBeDefined();
    expect(even?.impact).toBeCloseTo(totalImpact(calculate(h).deltas), 2);
  });
});
