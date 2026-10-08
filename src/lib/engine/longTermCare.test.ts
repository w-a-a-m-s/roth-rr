import { describe, expect, it } from "vitest";
import type { Household, LongTermCareSettings } from "@/lib/domain/types";
import { projectScenario, projectionYears } from "@/lib/engine/project";
import { calculate } from "@/lib/calculate";
import {
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

  it("drops other expenses to 70% while in care, then back to normal", () => {
    expect(at(care, 2029).expenseMonthly.living).toBe(5000);
    expect(at(care, 2030).expenseMonthly.living).toBeCloseTo(3500, 6);
    expect(at(care, 2033).expenseMonthly.living).toBe(5000);
    expect(at(care, 2030).monthlyExpenses).toBeCloseTo(3500 + 6000 * 1.03 ** 4, 6);
  });

  it("uses $10,000 a month for a nursing home", () => {
    const nursing = rows(h, settings({ careType: "nursing", inflation: 0 }));
    expect(at(nursing, 2030).expenseMonthly["ltc:a"]).toBe(10000);
  });
});

describe("both spouses in care", () => {
  const h = couple();
  // Alex 2030 to 2032 (3 years), Sam from 80 (2032) for 5 years: 2032 to 2036.
  const care = rows(h, settings({ who: "both", inflation: 0 }));

  it("keeps 70% of expenses while only one is in care", () => {
    expect(at(care, 2031).expenseMonthly.living).toBeCloseTo(3500, 6);
    expect(at(care, 2033).expenseMonthly.living).toBeCloseTo(3500, 6);
  });

  it("counts only the care costs while both are in care", () => {
    const y = at(care, 2032);
    expect(y.expenseMonthly.living).toBe(0);
    expect(y.monthlyExpenses).toBe(12000);
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
    expect(y.monthlyExpenses).toBe(16000);
    expect(at(care, 2034).expenseMonthly["ltc:b"]).toBe(10000);
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
