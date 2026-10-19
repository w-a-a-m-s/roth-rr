import { describe, expect, it } from "vitest";
import { asOfYear, expenseMonthlyForYear, incomeMonthlyForYear } from "@/lib/domain/household";
import { projectScenario, projectionYears } from "@/lib/engine/project";
import { socialSecurityBreakeven } from "@/lib/engine/socialSecurity";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";
import type { Expense, Household, IncomeSource } from "@/lib/domain/types";

const ss = (over: Partial<IncomeSource> = {}): IncomeSource => ({
  id: "ss",
  label: "Social Security",
  ownerId: "a",
  kind: "socialSecurity",
  monthlyAmount: 4_000,
  growthRate: 0.02,
  taxability: "full",
  startYear: 2040,
  ...over,
});

describe("income growth from today or from its start", () => {
  it("keeps the start-year amount by default", () => {
    expect(incomeMonthlyForYear(ss(), 2040, 2040, 2026)).toBe(4_000);
    expect(incomeMonthlyForYear(ss(), 2041, 2040, 2026)).toBeCloseTo(4_080, 6);
  });

  it("grows today's dollars from today when set to Today", () => {
    // 2027 to 2040 is 14 yearly raises.
    const today = ss({ growthFrom: "today" });
    expect(incomeMonthlyForYear(today, 2040, 2040, 2026)).toBeCloseTo(4_000 * 1.02 ** 14, 6);
    // Rita's 2046 claim: 20 raises by then, not 0.
    const rita = ss({ growthFrom: "today", startYear: 2046 });
    expect(incomeMonthlyForYear(rita, 2046, 2040, 2026)).toBeCloseTo(4_000 * 1.02 ** 20, 6);
    expect(incomeMonthlyForYear(rita, 2045, 2040, 2026)).toBe(0);
  });

  it("uses the projection start as today when there's no date", () => {
    const today = ss({ growthFrom: "today", startYear: 2046 });
    expect(incomeMonthlyForYear(today, 2046, 2040)).toBeCloseTo(4_000 * 1.02 ** 6, 6);
  });

  it("still holds the growth delay", () => {
    const delayed = ss({ growthFrom: "today", growthDelayYears: 2 });
    expect(incomeMonthlyForYear(delayed, 2040, 2040, 2026)).toBeCloseTo(4_000 * 1.02 ** 12, 6);
  });

  it("reads the year from the app's date", () => {
    expect(asOfYear("2026-10-18")).toBe(2026);
    expect(asOfYear(undefined)).toBeUndefined();
  });
});

describe("growth from today in the projection", () => {
  const household = (growthFrom?: IncomeSource["growthFrom"]): Household => ({
    filingStatus: "mfj",
    residenceState: "FL",
    people: [
      { id: "a", name: "Ran", birthYear: 1973, retirementYear: 2040 },
      { id: "b", name: "Rita", birthYear: 1979, retirementYear: 2040 },
    ],
    accounts: [],
    incomes: [ss({ growthFrom }), ss({ id: "ss2", ownerId: "b", startYear: 2046, growthFrom })],
    realEstate: [],
    expenses: [],
    assumptions: { expenseGrowth: 0.02, finalAge: 75 },
    optimizer: { strategy: "manual" },
  });
  const refs = { ...FALLBACK_REFERENCE_DATA, asOfDate: "2026-10-18" };
  const at = (h: Household, year: number) =>
    projectScenario(h, new Array(projectionYears(h)).fill(0), refs).find((r) => r.calendarYear === year)!;

  it("pays the grown amount from the first year", () => {
    expect(at(household(), 2040).incomeMonthly.ss).toBe(4_000);
    expect(at(household("today"), 2040).incomeMonthly.ss).toBeCloseTo(4_000 * 1.02 ** 14, 6);
    expect(at(household("today"), 2046).incomeMonthly.ss2).toBeCloseTo(4_000 * 1.02 ** 20, 6);
  });

  it("grows the Social Security analysis's claims from today too", () => {
    const h = household("today");
    h.socialSecurityClaims = [{ id: "c70", personId: "a", age: 70, monthlyAmount: 5_000 }];
    const r = socialSecurityBreakeven(h, "a", "2026-10-18")!;
    expect(r.options[0].monthlyAtClaim).toBeCloseTo(4_000 * 1.02 ** 14, 6);
    // Claiming at 70 is 2043: 17 raises from today.
    expect(r.options[1].monthlyAtClaim).toBeCloseTo(5_000 * 1.02 ** 17, 6);
    // Left on Income start, the analysis uses the amounts as entered.
    const plain = socialSecurityBreakeven(household(), "a", "2026-10-18")!;
    expect(plain.options[0].monthlyAtClaim).toBe(4_000);
  });
});

describe("expense growth from today or from its start", () => {
  const spend = (over: Partial<Expense> = {}): Expense => ({
    id: "exp",
    label: "Living",
    amount: 20_000,
    frequency: "monthly",
    growthRate: 0.02,
    startYear: 2040,
    ...over,
  });

  it("keeps the start-year amount by default", () => {
    expect(expenseMonthlyForYear(spend(), 2040, 2040, 2026)).toBe(20_000);
    expect(expenseMonthlyForYear(spend(), 2041, 2040, 2026)).toBeCloseTo(20_400, 6);
  });

  it("grows today's dollars from today when set to Today", () => {
    const today = spend({ growthFrom: "today" });
    expect(expenseMonthlyForYear(today, 2040, 2040, 2026)).toBeCloseTo(20_000 * 1.02 ** 14, 6);
    expect(expenseMonthlyForYear(today, 2039, 2040, 2026)).toBe(0);
    // Yearly amounts too, spread to monthly.
    const yearly = spend({ growthFrom: "today", frequency: "yearly", amount: 12_000 });
    expect(expenseMonthlyForYear(yearly, 2040, 2040, 2026)).toBeCloseTo(1_000 * 1.02 ** 14, 6);
    // No date: today is the projection start.
    expect(expenseMonthlyForYear(today, 2041, 2040)).toBeCloseTo(20_400, 6);
  });

  it("feeds the projection's expenses", () => {
    const h: Household = {
      filingStatus: "mfj",
      residenceState: "FL",
      people: [{ id: "a", name: "Ran", birthYear: 1973, retirementYear: 2040 }],
      accounts: [],
      incomes: [],
      realEstate: [],
      expenses: [spend({ growthFrom: "today" }), spend({ id: "plain" })],
      assumptions: { expenseGrowth: 0, finalAge: 70 },
      optimizer: { strategy: "manual" },
    };
    const refs = { ...FALLBACK_REFERENCE_DATA, asOfDate: "2026-10-19" };
    const [row] = projectScenario(h, new Array(projectionYears(h)).fill(0), refs);
    expect(row.expenseMonthly.exp).toBeCloseTo(20_000 * 1.02 ** 14, 6);
    expect(row.expenseMonthly.plain).toBe(20_000);
  });
});
