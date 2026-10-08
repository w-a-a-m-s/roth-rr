import { describe, expect, it } from "vitest";
import type { ConversionStrategy, Household } from "@/lib/domain/types";
import { runScenario } from "@/lib/engine/runScenario";
import { FILL_BRACKET_RATES } from "@/lib/domain/types";
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
      expect(best).toBeLessThanOrEqual(lifetimeTaxes(household, zeros, refs));
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

// Single FL retiree whose pension, Social Security, and interest already sit
// in the 24% bracket, with RMDs at 75 and the plan ending at 85. Counting the
// tax on the leftover deferred balance used to make minTax convert everything
// and show more lifetime tax than no conversion or filling the 24% bracket.
const pensioner = {
  filingStatus: "single",
  residenceState: "FL",
  expenses: [{ id: "e", label: "All", amount: 4167, frequency: "monthly", growthRate: 0.02 }],
  people: [{ id: "p", name: "Owner", birthYear: 1961, retirementYear: 2026 }],
  accounts: [
    { id: "a1", label: "403b", ownerId: "p", kind: "retirementTaxable", balance: 351000, growthRate: 0.05, retirementType: "403b", deposits: [] },
    { id: "a2", label: "DROP", ownerId: "p", kind: "retirementTaxable", balance: 635570, growthRate: 0.05, retirementType: "drop", deposits: [] },
  ],
  incomes: [
    { id: "i1", label: "Pension", ownerId: "p", kind: "pension", monthlyAmount: 6452, growthRate: 0.02, taxability: "full" },
    { id: "i2", label: "Social Security", ownerId: "p", kind: "socialSecurity", monthlyAmount: 3014, growthRate: 0.02, taxability: "full" },
    { id: "i3", label: "DROP draw", ownerId: "p", kind: "retirementDraw", monthlyAmount: 1667, growthRate: 0, taxability: "full", startYear: 2026, endYear: 2035, drawsFromAccountId: "a2" },
    { id: "i4", label: "Interest", ownerId: "p", kind: "other", monthlyAmount: 1000, growthRate: 0, taxability: "full" },
  ],
  realEstate: [],
  assumptions: { expenseGrowth: 0.02, finalAge: 85 },
  optimizer: { strategy: "minTax" },
} as unknown as Household;

describe("minTaxSchedule targets the lifetime taxes the results show", () => {
  const taxesTotal = (schedule: number[]) =>
    runScenario(pensioner, schedule, "x", refs).totals.taxesTotal;
  const best = taxesTotal(minTaxSchedule(pensioner, refs));

  it("pays no more than no conversion", () => {
    const zeros = minTaxSchedule(pensioner, refs).map(() => 0);
    expect(best).toBeLessThanOrEqual(taxesTotal(zeros));
  });

  it("pays no more than any fill-bracket rate", () => {
    for (const targetBracketRate of FILL_BRACKET_RATES) {
      const schedule = buildConversionSchedule(
        { ...pensioner, optimizer: { strategy: "fillBracket", targetBracketRate } },
        refs,
      );
      expect(best).toBeLessThanOrEqual(taxesTotal(schedule));
    }
  });
});
