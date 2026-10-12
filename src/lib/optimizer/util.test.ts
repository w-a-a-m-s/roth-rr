import { describe, expect, it } from "vitest";
import type { Household } from "@/lib/domain/types";
import { convertibleTotal } from "@/lib/engine/convertible";
import {
  defaultConversionSchedule,
  hasManualConversionSchedule,
  roundCents,
  spreadConversionEvenly,
} from "@/lib/optimizer/util";
import { manualSchedule } from "@/lib/optimizer/strategies/manual";

describe("roundCents", () => {
  it("rounds to 2 decimal places", () => {
    expect(roundCents(33333.333333)).toBe(33333.33);
    expect(roundCents(33333.335)).toBe(33333.34);
    expect(roundCents(10)).toBe(10);
  });
});

describe("spreadConversionEvenly", () => {
  it("splits evenly when the total divides cleanly", () => {
    expect(spreadConversionEvenly(100_000, 4, 200_000)).toEqual([
      25_000, 25_000, 25_000, 25_000,
    ]);
  });

  it("rounds each year to cents and puts leftover cents on the last year", () => {
    const schedule = spreadConversionEvenly(100_000, 3, 200_000);
    expect(schedule).toEqual([33333.33, 33333.33, 33333.34]);
    expect(schedule.reduce((sum, v) => sum + v, 0)).toBe(100_000);
    for (const amount of schedule) {
      expect(amount).toBe(roundCents(amount));
    }
  });

  it("caps at the convertible total", () => {
    expect(spreadConversionEvenly(500_000, 2, 100_000)).toEqual([
      50_000, 50_000,
    ]);
  });

  it("does not cap when the convertible argument is at least the total", () => {
    expect(spreadConversionEvenly(500_000, 2, 500_000)).toEqual([
      250_000, 250_000,
    ]);
  });

  it("returns an empty schedule when there are no years", () => {
    expect(spreadConversionEvenly(100_000, 0, 200_000)).toEqual([]);
  });
});

function householdWithConvertible(balance: number): Household {
  return {
    filingStatus: "single",
    residenceState: "FL",
    people: [
      {
        id: "p1",
        name: "Pat",
        birthYear: 1960,
        retirementYear: 2026,
      },
    ],
    accounts: [
      {
        id: "ret",
        label: "IRA",
        ownerId: "p1",
        kind: "retirementTaxable",
        balance,
        growthRate: 0,
      },
    ],
    incomes: [],
    realEstate: [],
    expenses: [],
    assumptions: {
      expenseGrowth: 0,
      finalAge: 76,
    },
    optimizer: { strategy: "manual" },
  };
}

describe("default conversion when amount is unset", () => {
  it("treats a missing schedule as unset", () => {
    expect(hasManualConversionSchedule(householdWithConvertible(90_000))).toBe(
      false,
    );
  });

  it("treats an explicit empty array as unset", () => {
    const h = householdWithConvertible(90_000);
    h.optimizer.manualSchedule = [];
    expect(hasManualConversionSchedule(h)).toBe(false);
  });

  it("treats an explicit all-zero schedule as set", () => {
    const h = householdWithConvertible(90_000);
    h.optimizer.manualSchedule = [0, 0, 0];
    expect(hasManualConversionSchedule(h)).toBe(true);
  });

  it("defaults to the full convertible total spread evenly", () => {
    const h = householdWithConvertible(100_000);
    // Born 1960 → RMD at 75. Ages 66..74 → 9 conversion years.
    // growthRate 0 → convertible total equals the starting balance.
    expect(convertibleTotal(h)).toBe(100_000);
    expect(defaultConversionSchedule(h)).toEqual(
      spreadConversionEvenly(100_000, 9, 100_000),
    );
    expect(manualSchedule(h).slice(0, 9)).toEqual(defaultConversionSchedule(h));
  });

  it("defaults using the progressive convertible total when accounts grow", () => {
    const h = householdWithConvertible(100_000);
    h.accounts[0].growthRate = 0.05;
    const convertible = convertibleTotal(h);
    expect(convertible).toBeGreaterThan(100_000);
    expect(defaultConversionSchedule(h)).toEqual(
      spreadConversionEvenly(convertible, 9, convertible),
    );
  });

  it("keeps an explicit schedule, including zeros", () => {
    const h = householdWithConvertible(100_000);
    h.optimizer.manualSchedule = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(manualSchedule(h).slice(0, 9)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
