import { describe, expect, it } from "vitest";
import type { Household, LongTermCareSettings } from "@/lib/domain/types";
import { projectScenario, projectionYears } from "@/lib/engine/project";
import { resolveLongTermCare } from "@/lib/domain/longTermCare";
import { longTermCareAssetImpact, rowTotalAssets } from "@/lib/engine/longTermCareImpact";

// Alex (born 1950) with an IRA and Social Security. Plan starts in 2026.
function single(): Household {
  return {
    filingStatus: "single",
    residenceState: "FL",
    people: [{ id: "a", name: "Alex", birthYear: 1950, retirementYear: 2026, sex: "male" }],
    mainPersonId: "a",
    accounts: [
      { id: "ira", label: "IRA", ownerId: "a", kind: "retirementTaxable", balance: 400_000, growthRate: 0.05, retirementType: "ira" },
    ],
    incomes: [
      { id: "ss", label: "SS", ownerId: "a", kind: "socialSecurity", monthlyAmount: 4000, growthRate: 0, taxability: "full" },
    ],
    realEstate: [],
    expenses: [{ id: "living", label: "Living", amount: 4000, frequency: "monthly", growthRate: 0 }],
    assumptions: { expenseGrowth: 0, finalAge: 95 },
    optimizer: { strategy: "manual", manualSchedule: [] },
  };
}

// Care from 80 (2030) for 3 years, home care at $6,000 a month.
const care: LongTermCareSettings = {
  who: "one",
  personId: "a",
  careType: "home",
  inflation: 0,
  periods: [{ personId: "a", startAge: 80, years: 3, careType: "home" }],
};

const rows = (h: Household, c?: LongTermCareSettings) =>
  projectScenario(h, new Array(projectionYears(h)).fill(0), undefined, c ? { longTermCare: c } : {});

describe("long-term care asset impact", () => {
  it("measures the drop over the care years and the gap to the plan without care", () => {
    const h = single();
    const careRows = rows(h, care);
    const noCareRows = rows(h);
    const impact = longTermCareAssetImpact(careRows, noCareRows, resolveLongTermCare(h, care))!;
    const total = (r: typeof careRows, y: number) => rowTotalAssets(r.find((x) => x.calendarYear === y)!);

    expect(impact.firstYear).toBe(2030);
    expect(impact.lastYear).toBe(2032);
    expect(impact.before).toBeCloseTo(total(careRows, 2029), 6);
    expect(impact.after).toBeCloseTo(total(careRows, 2032), 6);
    expect(impact.drop).toBeCloseTo(impact.before - impact.after, 6);
    expect(impact.withoutCare).toBeCloseTo(total(noCareRows, 2032), 6);
    expect(impact.shortfall).toBeCloseTo(impact.withoutCare - impact.after, 6);
    // Care costs come out of the IRA: assets fall during care and end below
    // the plan without care.
    expect(impact.drop).toBeGreaterThan(0);
    expect(impact.shortfall).toBeGreaterThan(0);
  });

  it("uses the first year's end when care starts in the first projection year", () => {
    const h = single();
    const early: LongTermCareSettings = { ...care, periods: [{ personId: "a", startAge: 76, years: 2, careType: "home" }] };
    const careRows = rows(h, early);
    const impact = longTermCareAssetImpact(careRows, rows(h), resolveLongTermCare(h, early))!;
    expect(impact.firstYear).toBe(2026);
    expect(impact.before).toBeCloseTo(rowTotalAssets(careRows[0]), 6);
  });

  it("flags care years the income can't cover and what the accounts paid", () => {
    const h = single();
    const careRows = rows(h, care);
    const impact = longTermCareAssetImpact(careRows, rows(h), resolveLongTermCare(h, care))!;
    // $4,000 of Social Security doesn't pay for $6,000 of home care plus the
    // rest of the spending, so every care year draws on the IRA.
    expect(impact.cashFlow.years).toBe(3);
    expect(impact.cashFlow.shortYears).toEqual([2030, 2031, 2032]);
    const topUps = careRows
      .filter((r) => r.calendarYear >= 2030 && r.calendarYear <= 2032)
      .reduce((sum, r) => sum + (r.incomeMonthly["topup:ira"] ?? 0) * 12, 0);
    expect(impact.cashFlow.fromAccounts).toBeCloseTo(topUps, 6);
    expect(impact.cashFlow.fromAccounts).toBeGreaterThan(0);
    expect(impact.cashFlow.unpaidYears).toEqual([]);
    expect(impact.cashFlow.uncovered).toBe(0);
    expect(impact.cashFlow.savingsRunOutYear).toBeNull();
    expect(impact.cashFlow.planEndYear).toBe(careRows[careRows.length - 1].calendarYear);
  });

  it("finds savings running out after care ends", () => {
    // Enough to get through care, then spending above income drains the rest.
    const h = single();
    h.accounts[0].balance = 275_000;
    h.expenses[0].amount = 6_000;
    const careRows = rows(h, care);
    const impact = longTermCareAssetImpact(careRows, rows(h), resolveLongTermCare(h, care))!;
    const firstUnpaid = careRows.find((r) => r.calendarYear >= 2030 && r.surplus * 12 <= -0.5)!.calendarYear;
    expect(impact.cashFlow.unpaidYears).toEqual([]);
    expect(firstUnpaid).toBeGreaterThan(2032);
    expect(impact.cashFlow.savingsRunOutYear).toBe(firstUnpaid);
  });

  it("leaves spending unpaid once the accounts run dry", () => {
    const h = single();
    h.accounts[0].balance = 20_000;
    const careRows = rows(h, care);
    const impact = longTermCareAssetImpact(careRows, rows(h), resolveLongTermCare(h, care))!;
    const unpaid = careRows
      .filter((r) => r.calendarYear >= 2030 && r.calendarYear <= 2032 && r.surplus < 0)
      .map((r) => r.calendarYear);
    expect(unpaid.length).toBeGreaterThan(0);
    expect(impact.cashFlow.unpaidYears).toEqual(unpaid);
    expect(impact.cashFlow.uncovered).toBeGreaterThan(0);
    expect(impact.cashFlow.savingsRunOutYear).toBe(unpaid[0]);
  });

  it("calls the cash flow sufficient when income covers care", () => {
    const h = single();
    h.incomes[0].monthlyAmount = 20_000;
    const impact = longTermCareAssetImpact(rows(h, care), rows(h), resolveLongTermCare(h, care))!;
    expect(impact.cashFlow.shortYears).toEqual([]);
    expect(impact.cashFlow.fromAccounts).toBe(0);
  });

  it("is null without care", () => {
    const h = single();
    expect(longTermCareAssetImpact(rows(h), rows(h), null)).toBeNull();
  });
});
