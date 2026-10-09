import { describe, expect, it } from "vitest";
import type { Household } from "@/lib/domain/types";
import { projectScenario } from "@/lib/engine/project";
import { FALLBACK_REFERENCE_DATA as refs } from "@/lib/externalData/fallback";
import { buildConversionSchedule } from "@/lib/optimizer";
import { capConversionsToShortfall } from "@/lib/optimizer/shortfall";

// Single FL retiree with a pension and Social Security who spends most of it,
// so converting the whole 403b evenly leaves several thousand a month short.
const retiree = {
  filingStatus: "single",
  residenceState: "FL",
  expenses: [{ id: "e", label: "All", amount: 8000, frequency: "monthly", growthRate: 0.02 }],
  people: [{ id: "p", name: "Owner", birthYear: 1961, retirementYear: 2026 }],
  accounts: [
    { id: "a", label: "403b", ownerId: "p", kind: "retirementTaxable", balance: 900000, growthRate: 0.05, retirementType: "403b", deposits: [] },
  ],
  incomes: [
    { id: "i1", label: "Pension", ownerId: "p", kind: "pension", monthlyAmount: 6452, growthRate: 0.02, taxability: "full" },
    { id: "i2", label: "Social Security", ownerId: "p", kind: "socialSecurity", monthlyAmount: 3014, growthRate: 0.02, taxability: "full" },
  ],
  realEstate: [],
  assumptions: { expenseGrowth: 0.02, finalAge: 85 },
  optimizer: { strategy: "even" },
} as unknown as Household;

const capped = (h: Household): Household => ({
  ...h,
  optimizer: { ...h.optimizer, maxMonthlyShortfall: 1000 },
});

describe("maxMonthlyShortfall", () => {
  const uncapped = buildConversionSchedule(retiree, refs);
  const schedule = buildConversionSchedule(capped(retiree), refs);
  const rows = projectScenario(retiree, schedule, refs);

  it("the uncapped plan runs more than $1,000 a month short", () => {
    const worst = Math.min(...projectScenario(retiree, uncapped, refs).map((r) => r.surplus));
    expect(worst).toBeLessThan(-1000);
  });

  it("keeps every conversion year's shortfall at $1,000 or less", () => {
    schedule.forEach((amount, i) => {
      if (amount <= 0) return;
      expect(rows[i].surplus).toBeGreaterThanOrEqual(-1000);
    });
  });

  it("only lowers amounts, and converts as much as the limit allows", () => {
    let lowered = 0;
    schedule.forEach((amount, i) => {
      expect(amount).toBeLessThanOrEqual(uncapped[i]);
      if (amount === uncapped[i]) return;
      lowered++;
      const more = schedule.slice();
      more[i] = amount + 50;
      expect(projectScenario(retiree, more, refs)[i].surplus).toBeLessThan(-1000);
    });
    expect(lowered).toBeGreaterThan(0);
  });

  it("converts nothing in a year that's already short by more than the limit", () => {
    const tight = { ...retiree, expenses: [{ ...retiree.expenses[0], amount: 12000 }] };
    const zeros = uncapped.map(() => 0);
    expect(projectScenario(tight, zeros, refs)[0].surplus).toBeLessThan(-1000);
    expect(capConversionsToShortfall(tight, uncapped, 1000, refs)[0]).toBe(0);
  });

  it("changes nothing when it's off", () => {
    expect(buildConversionSchedule({ ...retiree }, refs)).toEqual(uncapped);
  });
});
