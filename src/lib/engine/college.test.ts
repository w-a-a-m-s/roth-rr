import { describe, expect, it } from "vitest";
import type { CollegePlan, Household } from "@/lib/domain/types";
import {
  NON_QUALIFIED_529_PENALTY,
  collegePlanFor,
  compareCollegeOptions,
  defaultCollegePlan,
} from "@/lib/engine/college";

const plan = (patch: Partial<CollegePlan> = {}): CollegePlan => ({
  ...defaultCollegePlan(2026),
  ...patch,
});

describe("college: out of pocket vs 529", () => {
  it("heals missing or broken inputs from the defaults", () => {
    const h = { college: { annualCost: 50_000, costGrowth: "x", years: -2 } } as unknown as Household;
    const p = collegePlanFor(h, 2026);
    expect(p.annualCost).toBe(50_000);
    expect(p.costGrowth).toBe(0.05);
    expect(p.years).toBe(0);
    expect(collegePlanFor({} as Household, 2026)).toEqual(defaultCollegePlan(2026));
  });

  it("with no return, both accounts match and cover the bills dollar for dollar", () => {
    // Saves $1,000 a month for 2 years, then a 2-year college at $10,000 flat.
    const r = compareCollegeOptions(
      plan({ birthYear: 2010, startAge: 18, years: 2, annualCost: 10_000, costGrowth: 0, monthlyContribution: 1_000, investmentReturn: 0 }),
      2026,
    );
    expect(r.firstCollegeYear).toBe(2028);
    expect(r.lastCollegeYear).toBe(2029);
    expect(r.years).toHaveLength(4);
    for (const o of r.options) {
      expect(o.contributed).toBe(24_000);
      expect(o.balanceAtStart).toBe(24_000);
      expect(o.paidFromAccount).toBe(20_000);
      expect(o.shortfall).toBe(0);
      expect(o.leftover).toBe(4_000);
      expect(o.leftoverTax).toBe(0);
      expect(o.netCost).toBe(20_000);
    }
    expect(r.savings).toBe(0);
  });

  it("taxes brokerage growth every year, and 529 leftover earnings with the penalty", () => {
    const r = compareCollegeOptions(
      plan({ birthYear: 2026, startAge: 18, years: 4, annualCost: 0, currentSavings: 10_000, monthlyContribution: 0, investmentReturn: 0.06, taxOnGrowth: 0.15 }),
      2026,
    );
    const [oop, p529] = r.options;
    // 22 years with nothing taken out.
    expect(p529.leftover).toBeCloseTo(10_000 * 1.06 ** 22, 4);
    expect(oop.leftover).toBeCloseTo(10_000 * (1 + 0.06 * 0.85) ** 22, 4);
    expect(oop.taxOnGrowth).toBeCloseTo(oop.growth * 0.15, 6);
    expect(p529.taxOnGrowth).toBe(0);
    expect(p529.leftoverTax).toBeCloseTo((p529.leftover - 10_000) * (0.24 + NON_QUALIFIED_529_PENALTY), 1);
  });

  it("pays a bill the account can't cover from your pocket, and grows the bill", () => {
    const r = compareCollegeOptions(
      plan({ birthYear: 2008, startAge: 18, years: 1, annualCost: 30_000, costGrowth: 0.05, currentSavings: 5_000, monthlyContribution: 0, investmentReturn: 0 }),
      2026,
    );
    expect(r.years).toHaveLength(1);
    expect(r.years[0].cost).toBe(30_000);
    expect(r.options[1].paidFromAccount).toBe(5_000);
    expect(r.options[1].shortfall).toBe(25_000);
    const later = compareCollegeOptions(plan({ birthYear: 2010, years: 1, annualCost: 30_000, costGrowth: 0.05 }), 2026);
    expect(later.years.at(-1)!.cost).toBeCloseTo(30_000 * 1.05 ** 2, 6);
  });

  it("the 529 wins when the money is used for college: no tax on growth, plus state tax saved", () => {
    const r = compareCollegeOptions(plan({ stateDeductionRate: 0.05 }), 2026);
    const [oop, p529] = r.options;
    expect(r.best).toBe("plan529");
    expect(p529.stateTaxSaved).toBeCloseTo(p529.contributed * 0.05, 6);
    expect(p529.balanceAtStart).toBeGreaterThan(oop.balanceAtStart);
    expect(r.savings).toBeCloseTo(oop.netCost - p529.netCost, 6);
    // Stops saving when college starts by default.
    expect(r.years.filter((y) => y.inCollege).every((y) => y.contributed === 0)).toBe(true);
  });

  it("can keep saving through college", () => {
    const r = compareCollegeOptions(plan({ contributeDuringCollege: true }), 2026);
    expect(r.years.filter((y) => y.inCollege).every((y) => y.contributed === 6_000)).toBe(true);
  });

  it("splits what you put in between before and during college", () => {
    // Aria's plan: born 2019, college 2037 to 2040, $16k saved, $500 a month throughout.
    const r = compareCollegeOptions(
      plan({ birthYear: 2019, currentSavings: 16_000, contributeDuringCollege: true }),
      2026,
    );
    for (const o of r.options) {
      expect(o.contributedBeforeCollege).toBe(16_000 + 11 * 6_000);
      expect(o.contributedDuringCollege).toBe(4 * 6_000);
      expect(o.contributed).toBe(106_000);
    }
    const stops = compareCollegeOptions(plan({ birthYear: 2019, currentSavings: 16_000 }), 2026);
    expect(stops.options[0].contributedDuringCollege).toBe(0);
    expect(stops.options[0].contributed).toBe(stops.options[0].contributedBeforeCollege);
  });
});
