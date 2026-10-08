import { describe, expect, it } from "vitest";
import type { ConversionStrategy, Household } from "@/lib/domain/types";
import { deferredTaxOwed, runScenario } from "@/lib/engine/runScenario";
import { FALLBACK_REFERENCE_DATA as refs } from "@/lib/externalData/fallback";
import { buildConversionSchedule } from "@/lib/optimizer";
import { lifetimeTaxes, minTaxSchedule } from "@/lib/optimizer/strategies/minTax";
import singleFiler from "@/lib/engine/golden/cases/single-filer.json";
import headOfHousehold from "@/lib/engine/golden/cases/head-of-household.json";

const plans = [
  ["single filer", singleFiler.household],
  ["head of household", headOfHousehold.household],
] as const;

const withStrategy = (h: Household, strategy: ConversionStrategy): Household => ({
  ...h,
  optimizer: { ...h.optimizer, strategy },
});

describe("minTaxSchedule", () => {
  for (const [name, plan] of plans) {
    const household = plan as unknown as Household;

    it(`${name}: pays no more lifetime tax than any other strategy or no conversion`, () => {
      const best = lifetimeTaxes(household, minTaxSchedule(household, refs), refs);
      const strategies: ConversionStrategy[] = [
        "even",
        "immediate",
        "fillBracket",
        "irmaa",
        "depleteByRmd",
        "manual",
      ];
      for (const strategy of strategies) {
        const schedule = buildConversionSchedule(withStrategy(household, strategy), refs);
        expect(best).toBeLessThanOrEqual(lifetimeTaxes(household, schedule, refs));
      }
      const zeros = minTaxSchedule(household, refs).map(() => 0);
      expect(best).toBeLessThan(lifetimeTaxes(household, zeros, refs));
    });

    it(`${name}: is the schedule the minTax strategy runs`, () => {
      expect(buildConversionSchedule(withStrategy(household, "minTax"), refs)).toEqual(
        minTaxSchedule(household, refs),
      );
    });
  }

  it("does not depend on the strategy that's currently selected", () => {
    const household = singleFiler.household as unknown as Household;
    const a = minTaxSchedule(withStrategy(household, "even"), refs);
    const b = minTaxSchedule(
      { ...household, optimizer: { strategy: "immediate", convertAmount: 1 } },
      refs,
    );
    expect(a).toEqual(b);
  });
});

describe("deferredTaxOwed", () => {
  it("is the tax on the tax-deferred balance left at the end", () => {
    const household = singleFiler.household as unknown as Household;
    const zeros = minTaxSchedule(household, refs).map(() => 0);
    const rows = runScenario(household, zeros, "x", refs).rows;
    const last = rows[rows.length - 1];
    expect(last.retirementTotal).toBeGreaterThan(0);
    const owed = deferredTaxOwed(household, last, refs);
    expect(owed).toBeGreaterThan(0);
    expect(owed).toBeLessThan(last.retirementTotal);
    expect(deferredTaxOwed(household, { ...last, retirementTotal: 0 }, refs)).toBe(0);
  });
});
