import { describe, expect, it } from "vitest";
import type { Household, LongTermCareSettings } from "@/lib/domain/types";
import { projectScenario, projectionYears } from "@/lib/engine/project";
import { calculate } from "@/lib/calculate";
import {
  careExpenseShare,
  careForYear,
  carePeriodFor,
  defaultCareYears,
  longTermCareSettings,
  resolveLongTermCare,
} from "@/lib/domain/longTermCare";

// Alex (man, born 1950) and Sam (woman, born 1952). Plan starts in 2026.
function couple(): Household {
  return {
    filingStatus: "mfj",
    residenceState: "FL",
    people: [
      { id: "a", name: "Alex", birthYear: 1950, retirementYear: 2026, sex: "male" },
      { id: "b", name: "Sam", birthYear: 1952, retirementYear: 2026, sex: "female" },
    ],
    mainPersonId: "a",
    accounts: [
      { id: "ira", label: "IRA", ownerId: "a", kind: "retirementTaxable", balance: 400_000, growthRate: 0.05, retirementType: "ira" },
    ],
    incomes: [
      { id: "ss", label: "SS", ownerId: "a", kind: "socialSecurity", monthlyAmount: 4000, growthRate: 0, taxability: "full" },
    ],
    realEstate: [],
    expenses: [
      { id: "living", label: "Living", amount: 5000, frequency: "monthly", growthRate: 0 },
    ],
    assumptions: { expenseGrowth: 0, finalAge: 95 },
    optimizer: { strategy: "manual", manualSchedule: [] },
  };
}

const settings = (patch: Partial<LongTermCareSettings>): LongTermCareSettings => ({
  who: "one",
  personId: "a",
  careType: "home",
  inflation: 0.03,
  periods: [],
  ...patch,
});

function rows(h: Household, care?: LongTermCareSettings) {
  return projectScenario(h, new Array(projectionYears(h)).fill(0), undefined, care ? { longTermCare: care } : {});
}
const at = (r: ReturnType<typeof rows>, y: number) => r.find((x) => x.calendarYear === y)!;

describe("long-term care defaults", () => {
  it("lasts 3 years for men, 5 for women, 3 when not set", () => {
    expect(defaultCareYears({ sex: "male" })).toBe(3);
    expect(defaultCareYears({ sex: "female" })).toBe(5);
    expect(defaultCareYears({})).toBe(3);
  });

  it("starts at 80 unless the plan says otherwise", () => {
    const h = couple();
    expect(carePeriodFor(h, settings({}), "b")).toEqual({
      personId: "b",
      startAge: 80,
      years: 5,
      careType: "home",
    });
    expect(
      carePeriodFor(h, settings({ periods: [{ personId: "b", startAge: 84, years: 2 }] }), "b"),
    ).toEqual({ personId: "b", startAge: 84, years: 2, careType: "home" });
  });

  it("heals saved settings against the people in the plan", () => {
    const h = { ...couple(), longTermCare: settings({ personId: "gone", who: "both" }) };
    const s = longTermCareSettings(h)!;
    expect(s.personId).toBe("a");
    expect(s.who).toBe("both");
    expect(longTermCareSettings({ ...h, people: [h.people[0]] })!.who).toBe("one");
  });
});

describe("one spouse in care", () => {
  const h = couple();
  // Alex in home care from 80 (2030) for 3 years: 2030 to 2032.
  const care = rows(h, settings({}));

  it("adds home care at $6,000 a month grown 3% a year from the plan start", () => {
    expect(at(care, 2029).expenseMonthly["ltc:a"]).toBeUndefined();
    expect(at(care, 2030).expenseMonthly["ltc:a"]).toBeCloseTo(6000 * 1.03 ** 4, 6);
    expect(at(care, 2032).expenseMonthly["ltc:a"]).toBeCloseTo(6000 * 1.03 ** 6, 6);
    expect(at(care, 2033).expenseMonthly["ltc:a"]).toBeUndefined();
  });

  it("drops other expenses to 75% while one spouse is in home care, then back to normal", () => {
    expect(at(care, 2029).expenseMonthly.living).toBe(5000);
    expect(at(care, 2030).expenseMonthly.living).toBeCloseTo(3750, 6);
    expect(at(care, 2033).expenseMonthly.living).toBe(5000);
    expect(at(care, 2030).monthlyExpenses).toBeCloseTo(3750 + 6000 * 1.03 ** 4, 6);
  });

  it("uses $10,000 a month and 60% of other expenses for a nursing home", () => {
    const nursing = rows(h, settings({ careType: "nursing", inflation: 0 }));
    expect(at(nursing, 2030).expenseMonthly["ltc:a"]).toBe(10000);
    expect(at(nursing, 2030).expenseMonthly.living).toBeCloseTo(3000, 6);
  });
});

describe("both spouses in care", () => {
  const h = couple();
  // Alex 2030 to 2032 (3 years), Sam from 80 (2032) for 5 years: 2032 to 2036.
  const care = rows(h, settings({ who: "both", inflation: 0 }));

  it("keeps 75% of expenses while only one is in home care", () => {
    expect(at(care, 2031).expenseMonthly.living).toBeCloseTo(3750, 6);
    expect(at(care, 2033).expenseMonthly.living).toBeCloseTo(3750, 6);
  });

  it("keeps 55% of expenses while both are in home care, plus both care costs", () => {
    const y = at(care, 2032);
    expect(y.expenseMonthly.living).toBeCloseTo(2750, 6);
    expect(y.monthlyExpenses).toBeCloseTo(2750 + 12000, 6);
  });

  it("drops other expenses to zero while both are in a nursing home", () => {
    const nursing = rows(h, settings({ who: "both", careType: "nursing", inflation: 0 }));
    const y = at(nursing, 2032);
    expect(y.expenseMonthly.living).toBe(0);
    expect(y.monthlyExpenses).toBe(20000);
    expect(at(nursing, 2033).expenseMonthly.living).toBeCloseTo(3000, 6);
  });

  it("is back to normal after both stays end", () => {
    expect(at(care, 2037).monthlyExpenses).toBe(5000);
  });
});

describe("each spouse's own care", () => {
  it("prices home care for one spouse and a nursing home for the other", () => {
    const h = couple();
    const care = rows(
      h,
      settings({
        who: "both",
        inflation: 0,
        periods: [
          { personId: "a", startAge: 80, years: 3, careType: "home" },
          { personId: "b", startAge: 80, years: 5, careType: "nursing" },
        ],
      }),
    );
    const y = at(care, 2032);
    expect(y.expenseMonthly["ltc:a"]).toBe(6000);
    expect(y.expenseMonthly["ltc:b"]).toBe(10000);
    // One at home, one in a nursing home: 50% of other expenses.
    expect(y.expenseMonthly.living).toBeCloseTo(2500, 6);
    expect(y.monthlyExpenses).toBeCloseTo(2500 + 16000, 6);
    expect(at(care, 2034).expenseMonthly["ltc:b"]).toBe(10000);
    expect(at(care, 2034).expenseMonthly.living).toBeCloseTo(3000, 6);
  });

  it("falls back to the plan-wide care type for older settings", () => {
    const h = couple();
    const care = rows(
      h,
      settings({ careType: "nursing", inflation: 0, periods: [{ personId: "a", startAge: 80, years: 3 }] }),
    );
    expect(at(care, 2030).expenseMonthly["ltc:a"]).toBe(10000);
  });
});

describe("careExpenseShare", () => {
  it("follows the table by each spouse's care, in either order", () => {
    expect(careExpenseShare([])).toBe(1);
    expect(careExpenseShare(["home"])).toBe(0.75);
    expect(careExpenseShare(["nursing"])).toBe(0.6);
    expect(careExpenseShare(["home", "home"])).toBe(0.55);
    expect(careExpenseShare(["nursing", "home"])).toBe(0.5);
    expect(careExpenseShare(["home", "nursing"])).toBe(0.5);
    expect(careExpenseShare(["nursing", "nursing"])).toBe(0);
  });

  it("uses the individual table for a one-person household", () => {
    expect(careExpenseShare([], true)).toBe(1);
    expect(careExpenseShare(["home"], true)).toBe(0.7);
    expect(careExpenseShare(["nursing"], true)).toBe(0);
  });
});

describe("a single person in care", () => {
  // Alex alone, in care from 80 (2030) for 3 years: 2030 to 2032.
  const h: Household = { ...couple(), filingStatus: "single", people: [couple().people[0]] };

  it("keeps 70% of other expenses in home care", () => {
    const care = rows(h, settings({ inflation: 0 }));
    expect(at(care, 2030).expenseMonthly.living).toBeCloseTo(3500, 6);
    expect(at(care, 2030).monthlyExpenses).toBeCloseTo(3500 + 6000, 6);
    expect(at(care, 2033).expenseMonthly.living).toBe(5000);
  });

  it("drops other expenses to zero in a nursing home, leaving only the care", () => {
    const care = rows(h, settings({ careType: "nursing", inflation: 0 }));
    expect(at(care, 2029).expenseMonthly.living).toBe(5000);
    expect(at(care, 2030).expenseMonthly.living).toBe(0);
    expect(at(care, 2030).monthlyExpenses).toBe(10000);
    expect(at(care, 2033).expenseMonthly.living).toBe(5000);
  });
});

describe("careForYear", () => {
  it("is a no-op without care", () => {
    expect(careForYear(null, 2030, 2026)).toEqual({ costMonthlyById: {}, expenseShare: 1 });
  });

  it("needs a birth year to place a stay", () => {
    const h = couple();
    h.people = h.people.map((p) => ({ ...p, birthYear: undefined }));
    expect(resolveLongTermCare(h, settings({}))).toBeNull();
  });
});

it("changes nothing in the Retirement analysis", () => {
  const h = { ...couple(), longTermCare: settings({ who: "both" }) };
  expect(calculate(h)).toEqual(calculate({ ...h, longTermCare: undefined }));
});
