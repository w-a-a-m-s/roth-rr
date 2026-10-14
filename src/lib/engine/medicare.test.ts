import { describe, expect, it } from "vitest";
import type { Household } from "@/lib/domain/types";
import type { ProjectionRow } from "@/lib/engine/types";
import { FALLBACK_MEDICARE_PART_B } from "@/lib/config/medicare";
import { medicareYears } from "@/lib/engine/medicare";

// Alex (born 1959) and Sam (born 1961), both retired: Alex pays Part B from
// 67 (2026), Sam from 2028. 2026 tiers, joint: $218k, $274k, $342k, ...
const household = {
  filingStatus: "mfj",
  people: [
    { id: "a", name: "Alex", birthYear: 1959, retirementYear: 2020 },
    { id: "b", name: "Sam", birthYear: 1961, retirementYear: 2020 },
  ],
} as unknown as Household;

function row(calendarYear: number, ordinary: number, gains = 0): ProjectionRow {
  return {
    calendarYear,
    ages: { a: calendarYear - 1959, b: calendarYear - 1961 },
    livingIds: ["a", "b"],
    filingStatus: "mfj",
    grossTaxableIncome: ordinary,
    capitalGainsIncome: gains,
  } as unknown as ProjectionRow;
}

// A $300k conversion year in 2027 lands two years later, in 2029.
const rows = [
  row(2026, 150_000),
  row(2027, 290_000, 10_000),
  row(2028, 150_000),
  row(2029, 150_000),
  row(2030, 150_000),
];
const result = medicareYears(household, rows, FALLBACK_MEDICARE_PART_B);
const at = (year: number) => result.years.find((y) => y.calendarYear === year)!;

describe("medicareYears", () => {
  it("prices each year off the MAGI from two years earlier", () => {
    expect(at(2029).lookbackYear).toBe(2027);
    expect(at(2029).lookbackMagi).toBe(300_000);
    expect(at(2029).tier).toBe(2);
    expect(at(2029).monthlyPremium).toBe(405.8);
    expect(at(2029).annualPremium).toBeCloseTo(2 * 405.8 * 12, 6);
    expect(at(2029).irmaaSurcharge).toBeCloseTo(2 * (405.8 - 202.9) * 12, 6);
  });

  it("counts only the people old enough and retired", () => {
    expect(at(2026).enrolled).toBe(1);
    expect(at(2027).enrolled).toBe(1);
    expect(at(2028).enrolled).toBe(2);
    expect(at(2028).tier).toBe(0);
    expect(at(2028).annualPremium).toBeCloseTo(2 * 202.9 * 12, 6);
  });

  it("shows the room left before the next tier and what crossing it costs", () => {
    // 2026's $150k leaves $68k before $218k; crossing it in 2028 costs both
    // spouses $81.20 a month.
    expect(at(2026).roomToNextTier).toBe(68_000);
    expect(at(2026).nextTierCost).toBeCloseTo(2 * (284.1 - 202.9) * 12, 6);
    // 2027 is already in the $274k tier: $42k before $342k.
    expect(at(2027).roomToNextTier).toBe(42_000);
    // The projection ends before 2029's MAGI would matter.
    expect(at(2029).roomToNextTier).toBeNull();
  });

  it("adds up to the totals the comparison uses", () => {
    const sum = result.years.reduce((s, y) => s + y.annualPremium, 0);
    expect(result.totalPremiums).toBeCloseTo(sum, 6);
    expect(result.irmaaYears).toBe(1);
    expect(result.totalIrmaa).toBeCloseTo(at(2029).irmaaSurcharge, 6);
  });
});
