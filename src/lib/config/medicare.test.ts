import { describe, expect, it } from "vitest";
import type { Household } from "@/lib/domain/types";
import {
  FALLBACK_MEDICARE_PART_B,
  medicarePartBMonthlyPremium,
  paysMedicarePartB,
} from "@/lib/config/medicare";
import { calculate } from "@/lib/calculate";

describe("when Part B premiums start", () => {
  it("starts at 65 for someone already retired", () => {
    const person = { birthYear: 1960, retirementYear: 2020 };
    expect(paysMedicarePartB(person, 2024)).toBe(false); // 64
    expect(paysMedicarePartB(person, 2025)).toBe(true); // 65
  });

  it("waits for the retirement year when that's later", () => {
    const person = { birthYear: 1960, retirementYear: 2030 };
    expect(paysMedicarePartB(person, 2029)).toBe(false); // 69, still working
    expect(paysMedicarePartB(person, 2030)).toBe(true);
  });

  it("goes by 65 alone without a retirement year, and never without a birth year", () => {
    expect(paysMedicarePartB({ birthYear: 1960 }, 2025)).toBe(true);
    expect(paysMedicarePartB({ birthYear: 1960 }, 2024)).toBe(false);
    expect(paysMedicarePartB({ retirementYear: 2020 }, 2040)).toBe(false);
  });
});

describe("Medicare in the totals", () => {
  // Alex retires at 60 (2026); Sam keeps working until 70 (2036). Both on the
  // base premium (no income), through Alex's 70th year.
  const household: Household = {
    filingStatus: "mfj",
    residenceState: "FL",
    people: [
      { id: "a", name: "Alex", birthYear: 1966, retirementYear: 2026 },
      { id: "b", name: "Sam", birthYear: 1966, retirementYear: 2036 },
    ],
    mainPersonId: "a",
    accounts: [],
    incomes: [],
    realEstate: [],
    expenses: [],
    assumptions: { expenseGrowth: 0, finalAge: 70 },
    optimizer: { strategy: "manual", manualSchedule: [] },
  };

  it("counts Alex from 65 (2031) and Sam from retiring (2036)", () => {
    const base = medicarePartBMonthlyPremium(0, "mfj", FALLBACK_MEDICARE_PART_B);
    // Alex: 2031 to 2036 is 6 years; Sam: 2036 only.
    expect(calculate(household).baseline.totals.medicareTotal).toBeCloseTo(base * 12 * 7, 6);
  });
});

describe("IRMAA from conversions before 65", () => {
  // Born 1965, retired 2028 at 63, converts $250k in 2028 and 2029. Part B
  // starts at 65 (2030), and 2030 and 2031 look back to those conversion
  // years, so both pay the first IRMAA tier; 2032 looks back to 2030 and
  // drops to the standard premium.
  const household: Household = {
    filingStatus: "mfj",
    residenceState: "FL",
    people: [{ id: "m", name: "Mark", birthYear: 1965, retirementYear: 2028 }],
    mainPersonId: "m",
    accounts: [
      {
        id: "ira",
        label: "403(b)",
        ownerId: "m",
        kind: "retirementTaxable",
        balance: 600000,
        growthRate: 0,
        retirementType: "403b",
        deposits: [],
      },
    ],
    incomes: [],
    realEstate: [],
    expenses: [],
    includeMedicarePremiums: true,
    assumptions: { expenseGrowth: 0, finalAge: 70 },
    optimizer: { strategy: "manual", manualSchedule: [250000, 250000] },
  };

  it("charges the higher premium in the two years after the threshold is crossed", () => {
    const rows = calculate(household).roth.rows;
    const premium = (year: number) =>
      rows.find((r) => r.calendarYear === year)?.expenseMonthly["medicare:m"];
    const base = medicarePartBMonthlyPremium(0, "mfj", FALLBACK_MEDICARE_PART_B);
    const tier1 = medicarePartBMonthlyPremium(220000, "mfj", FALLBACK_MEDICARE_PART_B);
    expect(premium(2029)).toBeUndefined(); // 64, not on Medicare yet
    expect(premium(2030)).toBe(tier1);
    expect(premium(2031)).toBe(tier1);
    expect(premium(2032)).toBe(base);
  });

  it("counts only the surcharge when the plan picks IRMAA extra only", () => {
    const rows = calculate({ ...household, medicareExpense: "irmaaOnly" }).roth.rows;
    const premium = (year: number) =>
      rows.find((r) => r.calendarYear === year)?.expenseMonthly["medicare:m"];
    const base = medicarePartBMonthlyPremium(0, "mfj", FALLBACK_MEDICARE_PART_B);
    const tier1 = medicarePartBMonthlyPremium(220000, "mfj", FALLBACK_MEDICARE_PART_B);
    expect(premium(2030)).toBeCloseTo(tier1 - base, 6);
    expect(premium(2031)).toBeCloseTo(tier1 - base, 6);
    expect(premium(2032)).toBeUndefined(); // standard premium: nothing extra
  });
});
