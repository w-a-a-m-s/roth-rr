import { describe, expect, it } from "vitest";
import type { Household } from "@/lib/domain/types";
import { calculate } from "@/lib/calculate";
import { formatSignedCompactCurrency } from "@/lib/format";
import {
  scoreConversionStrategies,
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

describe("formatSignedCompactCurrency", () => {
  it("shortens the menu's changes to k and M", () => {
    expect(formatSignedCompactCurrency(439_074)).toBe("+$439k");
    expect(formatSignedCompactCurrency(-429_390)).toBe("-$429k");
    expect(formatSignedCompactCurrency(1_159_499)).toBe("+$1.2M");
    expect(formatSignedCompactCurrency(-12_400_000)).toBe("-$12M");
    expect(formatSignedCompactCurrency(850)).toBe("+$850");
    expect(formatSignedCompactCurrency(0)).toBe("$0");
  });
});

describe("scoreConversionStrategies", () => {
  it("returns finite tax and assets-at-RMD changes for each built-in strategy", () => {
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
      "minTax",
    ]);
    for (const row of scores) {
      expect(Number.isFinite(row.taxesTotal)).toBe(true);
      expect(Number.isFinite(row.afterTaxAssetsAtRmd)).toBe(true);
    }
  });

  it("matches calculate() for the selected even strategy", () => {
    const h = sampleHousehold();
    const even = scoreConversionStrategies(h).find((s) => s.id === "even");
    expect(even).toBeDefined();
    const { deltas } = calculate(h);
    expect(even?.taxesTotal).toBeCloseTo(deltas.taxesTotal, 2);
    expect(even?.afterTaxAssetsAtRmd).toBeCloseTo(deltas.afterTaxAssetsAtRmd, 2);
  });
});
