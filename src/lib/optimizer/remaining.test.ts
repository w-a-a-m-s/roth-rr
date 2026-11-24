import { describe, expect, it } from "vitest";
import type { Household } from "@/lib/domain/types";
import { buildConversionSchedule } from "@/lib/optimizer";
import { convertibleLeft } from "@/lib/optimizer/remaining";
import { convertibleTotal } from "@/lib/optimizer/util";

// A couple retiring in 2028 with about $370k in a DROP and two 403(b)s.
// Filling the 24% bracket converts it all in 2028, which used to leave the
// Conversion step showing about $384k "still available to convert": the
// convertible total grows every balance untouched to 2042.
const couple = {
  filingStatus: "mfj",
  residenceState: "FL",
  people: [
    { id: "a", name: "A", birthYear: 1965, retirementYear: 2028 },
    { id: "b", name: "B", birthYear: 1968, retirementYear: 2028 },
  ],
  accounts: [
    { id: "drop", label: "DROP", ownerId: "a", kind: "retirementTaxable", balance: 67_712, growthRate: 0.06, retirementType: "drop", deposits: [] },
    {
      id: "a403", label: "403(b) A", ownerId: "a", kind: "retirementTaxable", balance: 100_000, growthRate: 0.06, retirementType: "403b",
      deposits: [{ id: "d1", label: "", amount: 1_600, frequency: "monthly", startYear: 2026, endYear: 2028 }],
    },
    {
      id: "b403", label: "403(b) B", ownerId: "b", kind: "retirementTaxable", balance: 100_000, growthRate: 0.06, retirementType: "403b",
      deposits: [{ id: "d2", label: "", amount: 1_600, frequency: "monthly", startYear: 2026, endYear: 2028 }],
    },
  ],
  incomes: [
    { id: "p1", label: "Pension A", ownerId: "a", kind: "pension", monthlyAmount: 2_175, growthRate: 0.02, taxability: "full", startYear: 2028 },
    { id: "p2", label: "Pension B", ownerId: "b", kind: "pension", monthlyAmount: 2_900, growthRate: 0.02, taxability: "full", startYear: 2028 },
    { id: "s1", label: "SS A", ownerId: "a", kind: "socialSecurity", monthlyAmount: 1_702, growthRate: 0.02, taxability: "full", startYear: 2028 },
    { id: "s2", label: "SS B", ownerId: "b", kind: "socialSecurity", monthlyAmount: 1_765, growthRate: 0.02, taxability: "full", startYear: 2030 },
  ],
  realEstate: [],
  expenses: [{ id: "e", label: "All", amount: 2_000, frequency: "monthly", growthRate: 0.02 }],
  assumptions: { expenseGrowth: 0.02, finalAge: 90 },
  optimizer: { strategy: "fillBracket", targetBracketRate: 0.24, allowOverConvertible: false },
} as unknown as Household;

const total = (schedule: number[]) => schedule.reduce((sum, v) => sum + v, 0);

describe("convertibleLeft", () => {
  it("is 0 once the schedule empties the accounts in its first year", () => {
    const schedule = buildConversionSchedule(couple);
    expect(schedule[0]).toBeGreaterThan(300_000);
    expect(schedule.slice(1).every((v) => v === 0)).toBe(true);
    expect(convertibleTotal(couple) - total(schedule)).toBeGreaterThan(300_000);
    expect(convertibleLeft(couple, schedule, total(schedule))).toBe(0);
  });

  it("is the whole convertible total with nothing scheduled", () => {
    expect(convertibleLeft(couple, [], 0)).toBeCloseTo(convertibleTotal(couple), 2);
  });

  it("is what's left at the window's end after a partial schedule", () => {
    const schedule = [50_000];
    const left = convertibleLeft(couple, schedule, 50_000);
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(convertibleTotal(couple) - 50_000);
  });
});
