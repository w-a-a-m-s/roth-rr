import { describe, expect, it } from "vitest";
import { calculate } from "@/lib/calculate";
import type { Household } from "@/lib/domain/types";
import { primaryPersonId } from "@/lib/engine/project";
import barasch from "@/lib/engine/golden/cases/barasch-single-pension.json";
import {
  INCOME_CATEGORIES,
  buildPresentationData,
  capitalizationRate,
  incomeCategory,
} from "./presentationCharts";

const household = barasch.household as unknown as Household;
const comparison = calculate(household);
const primaryId = primaryPersonId(household);
const sum = (r: Record<string, number>) =>
  Object.values(r).reduce((a, b) => a + b, 0);

describe("incomeCategory", () => {
  it("sorts income into presentation categories", () => {
    const ss = household.incomes.find((i) => i.kind === "socialSecurity")!;
    const pension = household.incomes.find((i) => i.kind === "pension")!;
    expect(incomeCategory(household, ss.id)).toBe("socialSecurity");
    expect(incomeCategory(household, pension.id)).toBe("pension");
    expect(incomeCategory(household, "rmd:any")).toBe("rmd");
    expect(incomeCategory(household, "re:any")).toBe("other");
  });
});

describe("buildPresentationData", () => {
  for (const [name, scenario] of [
    ["baseline", comparison.baseline],
    ["roth", comparison.roth],
  ] as const) {
    const { years } = buildPresentationData(scenario.rows, household, primaryId);

    it(`${name}: the need is spending plus tax, and income is the gross`, () => {
      years.forEach((y, i) => {
        const row = scenario.rows[i];
        expect(y.need).toBeCloseTo((row.monthlyExpenses + row.monthlyTax) * 12, 6);
        expect(sum(y.income)).toBeCloseTo(row.totalMonthlyIncome * 12, 6);
      });
    });

    it(`${name}: applied income plus shortfall adds up to the need`, () => {
      for (const y of years) {
        expect(sum(y.applied) + y.shortfall).toBeCloseTo(y.need, 6);
        for (const cat of INCOME_CATEGORIES) {
          expect(y.applied[cat.key]).toBeLessThanOrEqual(y.income[cat.key] + 1e-9);
        }
      }
    });

    it(`${name}: shortfall matches a negative table surplus`, () => {
      years.forEach((y, i) => {
        const row = scenario.rows[i];
        const gap = Math.max(0, -(row.surplus + row.monthlyDeposits) * 12);
        expect(y.shortfall).toBeCloseTo(gap, 4);
      });
    });
  }

  it("capitalizes at the balance-weighted account growth rate", () => {
    const { summary, years } = buildPresentationData(
      comparison.baseline.rows,
      household,
      primaryId,
    );
    const r = capitalizationRate(household);
    expect(summary.rate).toBe(r);
    const pv = years.reduce((s, y, i) => s + y.need / Math.pow(1 + r, i), 0);
    expect(summary.capitalizedNeed).toBeCloseTo(pv, 6);
    expect(summary.capitalizedIncomeSources + summary.capitalizedNeededFromAssets)
      .toBeCloseTo(summary.capitalizedNeed, 6);
  });
});
