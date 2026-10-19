import { describe, expect, it } from "vitest";
import { calculate } from "@/lib/calculate";
import { uniformLifetimeDenominator } from "@/lib/config/rmdTable";
import type { ConversionStrategy, Household } from "@/lib/domain/types";
import type { ProjectionRow } from "@/lib/engine/types";

/**
 * Pat (born 1960, RMD age 75) works through 2029 on a $60k salary, retires
 * in 2030 on a $30k pension, and reaches RMD age in 2035. The projection
 * starts in 2026, so all three stretches are in the plan: working years
 * 2026-2029, retirement years 2030-2034, RMD years 2035-2040.
 */
function plan(strategy: ConversionStrategy, working: boolean, rmd: boolean): Household {
  return {
    filingStatus: "single",
    residenceState: "FL",
    people: [{ id: "p", name: "Pat", birthYear: 1960, retirementYear: 2030 }],
    accounts: [
      { id: "ira", label: "IRA", ownerId: "p", kind: "retirementTaxable", balance: 1_500_000, growthRate: 0.05 },
      { id: "roth", label: "Roth", ownerId: "p", kind: "rothTaxFree", balance: 0, growthRate: 0.05 },
    ],
    incomes: [
      { id: "salary", label: "Salary", ownerId: "p", kind: "salary", monthlyAmount: 5_000, growthRate: 0, taxability: "full", endYear: 2029 },
      { id: "pension", label: "Pension", ownerId: "p", kind: "pension", monthlyAmount: 2_500, growthRate: 0, taxability: "full", startYear: 2030 },
    ],
    realEstate: [],
    expenses: [],
    assumptions: { expenseGrowth: 0, finalAge: 80, startYear: 2026 },
    optimizer: {
      strategy,
      targetBracketRate: 0.24,
      ...(working ? { allowConversionsInWorkingYears: true } : {}),
      ...(rmd ? { allowConversionsInRmdYears: true } : {}),
    },
  };
}

const STRATEGIES: ConversionStrategy[] = [
  "manual",
  "even",
  "immediate",
  "fillBracket",
  "irmaa",
  "depleteByRmd",
  "minTax",
];
const CASES = [
  { working: false, rmd: false },
  { working: true, rmd: false },
  { working: false, rmd: true },
  { working: true, rmd: true },
];
const isWorking = (r: ProjectionRow) => r.calendarYear < 2030;
const isRmd = (r: ProjectionRow) => r.calendarYear >= 2035;
const convertedIn = (rows: ProjectionRow[], test: (r: ProjectionRow) => boolean) =>
  rows.filter(test).reduce((sum, r) => sum + r.conversion, 0);

describe("every strategy across working, retirement and RMD years", () => {
  for (const strategy of STRATEGIES) {
    for (const { working, rmd } of CASES) {
      const name = `${strategy}: working ${working ? "on" : "off"}, RMD ${rmd ? "on" : "off"}`;
      it(name, () => {
        const rows = calculate(plan(strategy, working, rmd)).roth.rows;
        expect(rows[0].calendarYear).toBe(2026);

        // Off means off: nothing converts in a stretch that isn't switched on.
        if (!working) expect(convertedIn(rows, isWorking)).toBe(0);
        if (!rmd) expect(convertedIn(rows, isRmd)).toBe(0);

        // Every RMD comes out in full, whatever converts around it.
        rows.forEach((row, i) => {
          if (!isRmd(row)) return;
          const prior = rows[i - 1].balances.ira;
          expect((row.incomeMonthly["rmd:ira"] ?? 0) * 12).toBeCloseTo(
            Math.min(prior, prior / uniformLifetimeDenominator(row.ages.p)),
            4,
          );
        });

        // A stretch that's switched on is used by the strategies that spread
        // across their window (immediate converts once, in the first year;
        // minimum taxes converts wherever it pays least).
        const spreads = ["manual", "even", "fillBracket", "depleteByRmd"].includes(strategy);
        if (working && (spreads || strategy === "immediate")) {
          expect(convertedIn(rows, isWorking)).toBeGreaterThan(0);
        }
        if (rmd && ["manual", "even", "depleteByRmd"].includes(strategy)) {
          expect(convertedIn(rows, isRmd)).toBeGreaterThan(0);
        }
        if (strategy === "immediate") {
          const first = rows.find((r) => r.conversion > 0);
          expect(first?.calendarYear).toBe(working ? 2026 : 2030);
        }
      });
    }
  }

  it("spreads Even level through the RMD years, emptying the IRA by the end", () => {
    const rows = calculate(plan("even", false, true)).roth.rows;
    const converting = rows.filter((r) => r.calendarYear >= 2030 && r.conversion > 0);
    // 2030 through 2040, every year, the same amount until the last one.
    expect(converting.map((r) => r.calendarYear)).toEqual(
      Array.from({ length: 11 }, (_, i) => 2030 + i),
    );
    const level = converting[0].conversion;
    for (const r of converting.slice(0, -1)) expect(r.conversion).toBeCloseTo(level, 0);
    expect(rows[rows.length - 1].retirementTotal).toBeLessThan(5);
  });

  it("empties the IRA by the last year with Empty by RMD and RMD years on", () => {
    const rows = calculate(plan("depleteByRmd", false, true)).roth.rows;
    expect(rows[rows.length - 1].retirementTotal).toBeLessThan(5);
    expect(convertedIn(rows, isRmd)).toBeGreaterThan(0);
  });
});
