import { describe, expect, it } from "vitest";
import type { Account } from "@/lib/domain/types";
import { SAMPLE_HOUSEHOLD } from "@/lib/config/sampleData";
import { SP500_MEAN_RETURN, balancedReturn, sp500Return } from "@/lib/config/marketHistory";
import { accountGrowthForYear, monteCarloGrowth } from "@/lib/engine/marketHistory";
import { projectScenario } from "@/lib/engine/project";
import { buildConversionSchedule } from "@/lib/optimizer";
import {
  historyYears,
  marketPaths,
  monteCarlo,
  percentile,
  seededRandom,
} from "@/lib/engine/monteCarlo";

const ira: Account = { id: "ira", label: "IRA", ownerId: "p1", kind: "retirementTaxable", balance: 1, growthRate: 0.06 };
const fixed = { assumptions: { expenseGrowth: 0, finalAge: 90 } };

describe("monteCarloGrowth", () => {
  it("moves a fixed market account by that year's S&P 500 swing from its average", () => {
    expect(monteCarloGrowth(fixed, ira, 2008)).toBeCloseTo(0.06 + sp500Return(2008)! - SP500_MEAN_RETURN, 12);
    const roth = { ...ira, kind: "rothTaxFree" as const, growthRate: 0.08 };
    expect(monteCarloGrowth(fixed, roth, 1995)).toBeCloseTo(0.08 + sp500Return(1995)! - SP500_MEAN_RETURN, 12);
  });

  it("gives history accounts that year's actual return", () => {
    expect(monteCarloGrowth(fixed, { ...ira, returnSource: "sp500" }, 2008)).toBe(sp500Return(2008));
    expect(monteCarloGrowth(fixed, { ...ira, returnSource: "balanced" }, 2008)).toBe(balancedReturn(2008));
    const history = { assumptions: { ...fixed.assumptions, retirementReturnMode: "balanced" as const } };
    expect(monteCarloGrowth(history, ira, 2008)).toBe(balancedReturn(2008));
  });

  it("keeps savings, CDs and annuities on their own rate", () => {
    const savings = { ...ira, kind: "savings" as const, growthRate: 0.03 };
    expect(monteCarloGrowth(fixed, savings, 2008)).toBe(0.03);
  });

  it("only applies with a market path, and never before the plan starts", () => {
    expect(accountGrowthForYear(fixed, ira, 0)).toBe(0.06);
    expect(accountGrowthForYear(fixed, ira, -1, [2008])).toBe(0.06);
    expect(accountGrowthForYear(fixed, ira, 3, [1950, 2008])).toBe(monteCarloGrowth(fixed, ira, 2008));
  });
});

describe("market paths", () => {
  it("are the same for the same seed and only use years with data", () => {
    const a = marketPaths(5, 30, 7);
    expect(marketPaths(5, 30, 7)).toEqual(a);
    expect(marketPaths(5, 30, 8)).not.toEqual(a);
    const years = new Set(historyYears());
    expect(a.flat().every((y) => years.has(y))).toBe(true);
    expect(a.every((p) => p.length === 30)).toBe(true);
  });

  it("draws numbers in [0, 1)", () => {
    const random = seededRandom(1);
    for (let i = 0; i < 1000; i++) {
      const x = random();
      expect(x >= 0 && x < 1).toBe(true);
    }
  });

  it("interpolates percentiles", () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([0, 10], 0.1)).toBeCloseTo(1, 12);
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe("monteCarlo", () => {
  const schedule = buildConversionSchedule(SAMPLE_HOUSEHOLD);

  it("changes the projection only through the market path", () => {
    const plain = projectScenario(SAMPLE_HOUSEHOLD, schedule);
    expect(projectScenario(SAMPLE_HOUSEHOLD, schedule, undefined, { marketPath: undefined })).toEqual(plain);
    const crash = projectScenario(SAMPLE_HOUSEHOLD, schedule, undefined, { marketPath: [2008] });
    expect(crash[0].retirementTotal).toBeLessThan(plain[0].retirementTotal);
  });

  it("summarizes both scenarios, the same every time", () => {
    const a = monteCarlo(SAMPLE_HOUSEHOLD, schedule, undefined, 40);
    expect(monteCarlo(SAMPLE_HOUSEHOLD, schedule, undefined, 40)).toEqual(a);
    expect(a.runs).toBe(40);
    for (const s of [a.baseline, a.roth]) {
      expect(s.successRate).toBeGreaterThanOrEqual(0);
      expect(s.successRate).toBeLessThanOrEqual(1);
      expect(s.inheritance.p10).toBeLessThanOrEqual(s.inheritance.p50);
      expect(s.inheritance.p50).toBeLessThanOrEqual(s.inheritance.p90);
      expect(s.accountsByYear.length).toBe(a.baseline.accountsByYear.length);
    }
    expect({
      baseline: a.baseline.successRate,
      roth: a.roth.successRate,
      rothAhead: a.rothAheadRate,
      baselineMedianInheritance: Math.round(a.baseline.inheritance.p50),
      rothMedianInheritance: Math.round(a.roth.inheritance.p50),
    }).toMatchInlineSnapshot(`
      {
        "baseline": 1,
        "baselineMedianInheritance": 4501979,
        "roth": 1,
        "rothAhead": 1,
        "rothMedianInheritance": 7074334,
      }
    `);
  });

  it("counts the markets where a tight budget runs short", () => {
    const tight = {
      ...SAMPLE_HOUSEHOLD,
      expenses: SAMPLE_HOUSEHOLD.expenses.map((e) => ({ ...e, amount: e.amount * 2.2 })),
    };
    const a = monteCarlo(tight, buildConversionSchedule(tight), undefined, 60);
    expect(a.baseline.successRate).toBeGreaterThan(0);
    expect(a.baseline.successRate).toBeLessThan(1);
    expect(a.baseline.medianShortYear).not.toBeNull();
    expect({
      baseline: a.baseline.successRate,
      roth: a.roth.successRate,
      baselineShort: a.baseline.medianShortYear,
      rothShort: a.roth.medianShortYear,
      planLasts: [a.plan.baseline.lasts, a.plan.roth.lasts],
    }).toMatchInlineSnapshot(`
      {
        "baseline": 0.5166666666666667,
        "baselineShort": 2044,
        "planLasts": [
          false,
          true,
        ],
        "roth": 0.6333333333333333,
        "rothShort": 2045,
      }
    `);
  });
});
