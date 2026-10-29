import { describe, expect, it } from "vitest";
import type { Household, IncomeSource } from "@/lib/domain/types";
import type { ProjectionRow } from "@/lib/engine/types";
import { projectScenario, projectionYears } from "@/lib/engine/project";
import { convertibleTotal } from "@/lib/engine/convertible";

// Andre (born 1964) retires in 2034 at 70 and draws his 403(b) from the
// income table. The account earns 5% on its own, so the table's 8% shows.
function plan(draw: Partial<IncomeSource> = {}): Household {
  return {
    filingStatus: "single",
    residenceState: "FL",
    people: [{ id: "p", name: "Andre", birthYear: 1964, retirementYear: 2034 }],
    accounts: [
      { id: "ira", label: "403(b)", ownerId: "p", kind: "retirementTaxable", balance: 500_000, growthRate: 0.05, retirementType: "403b", growthStart: "planStart" },
    ],
    incomes: [
      {
        id: "draw",
        label: "403(b) draw",
        ownerId: "p",
        kind: "retirementDraw",
        monthlyAmount: 1_000,
        growthRate: 0.02,
        taxability: "full",
        drawsFromAccountId: "ira",
        startYear: 2034,
        amountSource: "incomeTable",
        ...draw,
      },
    ],
    realEstate: [],
    expenses: [],
    assumptions: { expenseGrowth: 0, finalAge: 90 },
    optimizer: { strategy: "manual", manualSchedule: [] },
  };
}

function rows(household: Household): ProjectionRow[] {
  return projectScenario(household, new Array(projectionYears(household)).fill(0));
}

const at = (r: ProjectionRow[], year: number) => r.find((row) => row.calendarYear === year)!;

describe("withdrawals on the income table", () => {
  it("pays the January balance times the age rate, fixed for life", () => {
    const r = rows(plan());
    // Andre is 70 in 2034: 6.3% on the joint life table.
    const income = 500_000 * 0.063;
    expect(at(r, 2034).incomeMonthly.draw * 12).toBeCloseTo(income, 6);
    expect(at(r, 2040).incomeMonthly.draw * 12).toBeCloseTo(income, 6);
  });

  it("grows the account 8% a year instead of its own rate", () => {
    const r = rows(plan());
    const income = 500_000 * 0.063;
    const end2034 = 500_000 * 1.08 - income;
    // No RMD yet at 70 (born 1964: 75), so the balance is growth less the draw.
    expect(at(r, 2034).balances.ira).toBeCloseTo(end2034, 4);
    expect(at(r, 2035).balances.ira).toBeCloseTo(end2034 * 1.08 - income, 4);
  });

  it("keeps the entered amount and the account's rate otherwise", () => {
    const r = rows(plan({ amountSource: undefined }));
    expect(at(r, 2034).incomeMonthly.draw).toBeCloseTo(1_000, 6);
    expect(at(r, 2034).balances.ira).toBeCloseTo(500_000 * 1.05 - 12_000, 4);
  });

  it("starts at the projection start when the income has no start year", () => {
    const h = plan({ startYear: undefined });
    h.assumptions.startYear = 2030;
    const r = rows(h);
    // Andre is 66 in 2030: 5.9%.
    expect(at(r, 2030).incomeMonthly.draw * 12).toBeCloseTo(500_000 * 0.059, 6);
  });

  it("walks the same draw in the convertible total", () => {
    const table = convertibleTotal(plan());
    const entered = convertibleTotal(plan({ amountSource: undefined }));
    expect(table).not.toBeCloseTo(entered, 0);
  });
});
