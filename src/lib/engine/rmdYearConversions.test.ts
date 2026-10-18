import { describe, expect, it } from "vitest";
import { projectScenario, projectionYears } from "@/lib/engine/project";
import { conversionYears, convertibleTotal } from "@/lib/engine/convertible";
import { uniformLifetimeDenominator } from "@/lib/config/rmdTable";
import type { Household } from "@/lib/domain/types";

/** One owner already at 75 (born 1951: RMD age 73) with a $1M IRA. */
function plan(allow?: boolean, growthRate = 0): Household {
  return {
    filingStatus: "single",
    residenceState: "FL",
    people: [{ id: "p", name: "Pat", birthYear: 1951, retirementYear: 2026 }],
    accounts: [
      { id: "ira", label: "IRA", ownerId: "p", kind: "retirementTaxable", balance: 1_000_000, growthRate },
      { id: "roth", label: "Roth", ownerId: "p", kind: "rothTaxFree", balance: 0, growthRate: 0 },
    ],
    incomes: [],
    realEstate: [],
    expenses: [],
    assumptions: { expenseGrowth: 0, finalAge: 77 },
    optimizer: { strategy: "manual", ...(allow ? { allowConversionsInRmdYears: true } : {}) },
  };
}
const run = (h: Household, schedule: number[]) => projectScenario(h, schedule);

describe("conversions in RMD years", () => {
  it("are blocked while the switch is off", () => {
    const rows = run(plan(), [100_000, 100_000, 100_000]);
    expect(rows.every((r) => r.conversion === 0)).toBe(true);
  });

  it("convert after the year's RMD when it's on, leaving the RMD as it was", () => {
    const off = run(plan(), [0, 0, 0]);
    const on = run(plan(true), [100_000, 100_000, 100_000]);
    // Year 0 (age 75): RMD = $1M / 24.6 either way.
    const rmd0 = 1_000_000 / uniformLifetimeDenominator(75);
    expect(off[0].incomeMonthly["rmd:ira"] * 12).toBeCloseTo(rmd0, 6);
    expect(on[0].incomeMonthly["rmd:ira"] * 12).toBeCloseTo(rmd0, 6);
    expect(on[0].conversion).toBe(100_000);
    expect(on[0].balances.ira).toBeCloseTo(1_000_000 - rmd0 - 100_000, 6);
    expect(on[0].balances.roth).toBeCloseTo(100_000, 6);
    // Year 1's RMD is the prior December 31 balance over 23.7, so it's lower
    // after a conversion, as the law works.
    expect(on[1].incomeMonthly["rmd:ira"] * 12).toBeCloseTo(
      on[0].balances.ira / uniformLifetimeDenominator(76),
      6,
    );
  });

  it("never converts the RMD itself, even when asked for everything", () => {
    const [row] = run(plan(true), [5_000_000, 0, 0]);
    const rmd = 1_000_000 / uniformLifetimeDenominator(75);
    expect(row.conversion).toBeCloseTo(1_000_000 - rmd, 6);
    expect(row.incomeMonthly["rmd:ira"] * 12).toBeCloseTo(rmd, 6);
    expect(row.balances.ira).toBeCloseTo(0, 6);
  });

  it("opens the conversion window to every projection year", () => {
    expect(conversionYears(plan())).toBe(0);
    expect(conversionYears(plan(true))).toBe(projectionYears(plan(true)));
  });

  it("estimates the convertible total net of the RMDs along the way", () => {
    // No growth: three RMDs come out (ages 75, 76, 77), what's left is banked.
    let balance = 1_000_000;
    for (const age of [75, 76, 77]) balance -= balance / uniformLifetimeDenominator(age);
    expect(convertibleTotal(plan(true))).toBeCloseTo(balance, 6);
    expect(convertibleTotal(plan())).toBe(0);
  });
});

describe("strategies and the RMD-year switch", () => {
  // A $3M IRA at 75 growing 6% to age 95: RMDs climb into high brackets,
  // so converting some in the early RMD years lowers lifetime tax.
  const big = (allow?: boolean): Household => {
    const h = plan(allow, 0.06);
    h.accounts[0].balance = 3_000_000;
    h.accounts[1].growthRate = 0.06;
    h.assumptions.finalAge = 95;
    h.optimizer.strategy = "minTax";
    return h;
  };

  it("re-runs the minimum-tax search when the switch changes", async () => {
    const { minTaxSchedule } = await import("@/lib/optimizer/strategies/minTax");
    // Off first, so a cache keyed without the switch would answer "on" with
    // this all-zero schedule.
    const off = minTaxSchedule(big());
    const on = minTaxSchedule(big(true));
    expect(off.every((v) => v === 0)).toBe(true);
    expect(on.some((v) => v > 0)).toBe(true);
    // Whatever it converts, each year's RMD still comes out in full.
    const rows = projectScenario(big(true), on);
    for (const row of rows) {
      const prior = rows[row.yearIndex - 1]?.balances.ira ?? 3_000_000;
      expect(row.incomeMonthly["rmd:ira"] * 12).toBeCloseTo(
        prior / uniformLifetimeDenominator(row.ages.p),
        4,
      );
    }
  });
});
