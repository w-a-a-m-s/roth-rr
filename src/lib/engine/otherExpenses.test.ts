import { describe, expect, it } from "vitest";
import {
  CAR_EXPENSE_KEY,
  carCostsByYear,
  lifePremiumsForYear,
  premiumExpenseKey,
} from "@/lib/engine/otherExpenses";
import { carCashFlows, carDecisionFor, compareCarOptions } from "@/lib/engine/carDecision";
import { projectScenario, projectionYears } from "@/lib/engine/project";
import { resolveDeath } from "@/lib/domain/survivorship";
import { loanExpenseKey } from "@/lib/domain/propertyLoans";
import type { Household } from "@/lib/domain/types";

function household(extra: Partial<Household> = {}): Household {
  return {
    filingStatus: "mfj",
    residenceState: "FL",
    people: [
      { id: "a", name: "Ran", birthYear: 1973, retirementYear: 2040 },
      { id: "b", name: "Rita", birthYear: 1979, retirementYear: 2040 },
    ],
    accounts: [],
    incomes: [],
    expenses: [],
    realEstate: [
      {
        id: "home",
        label: "Tara",
        use: "homestead",
        purchaseYear: 2015,
        purchasePrice: 700_000,
        marketValue: 1_600_000,
        appreciationRate: 0,
        depreciationYears: 27.5,
        loans: [
          { id: "m", kind: "mortgage", label: "Mortgage", balance: 264_057, rate: 0.0425, monthlyPayment: 2_671 },
        ],
      },
    ],
    insurance: [
      // Term: 2019 to 2038. Permanent: for life. One more paid yearly.
      { id: "term", kind: "life", label: "Augustar", insuredId: "a", policyType: "term", termYears: 20, issueYear: 2019, faceAmount: 2_000_000, premium: 251.28, premiumFrequency: "monthly" },
      { id: "vul", kind: "life", label: "VUL", insuredId: "a", policyType: "permanent", permanentType: "vul", faceAmount: 250_000, premium: 500, premiumFrequency: "monthly" },
      { id: "whole", kind: "life", label: "Mass Mutual", insuredId: "b", policyType: "permanent", permanentType: "whole", faceAmount: 500_000, premium: 8_160, premiumFrequency: "annual" },
    ],
    assumptions: { expenseGrowth: 0, finalAge: 75, startYear: 2027 },
    optimizer: { strategy: "manual" },
    ...extra,
  };
}

describe("lifePremiumsForYear", () => {
  it("pays term premiums through the term and permanent ones for life", () => {
    const h = household();
    expect(lifePremiumsForYear(h, 2038, null)).toEqual({
      term: 251.28 * 12,
      vul: 6_000,
      whole: 8_160,
    });
    // The 20-year term from 2019 ends with 2038.
    expect(lifePremiumsForYear(h, 2039, null)).toEqual({ vul: 6_000, whole: 8_160 });
  });

  it("stops a policy's premiums after its insured passes", () => {
    const h = household();
    const death = resolveDeath(h, { personId: "a", deathAge: 60 }); // 2033
    expect(Object.keys(lifePremiumsForYear(h, 2033, death)).sort()).toEqual(["term", "vul", "whole"]);
    expect(lifePremiumsForYear(h, 2034, death)).toEqual({ whole: 8_160 });
  });
});

describe("car costs", () => {
  it("are nothing until the Car analysis is filled in", () => {
    expect(carCostsByYear(household(), 2027)).toBeNull();
  });

  it("spread the recommended option's payments over the plan's first years", () => {
    const h = household({
      carDecision: { ...carDecisionFor(household()), price: 60_000, years: 5 },
    });
    const decision = carDecisionFor(h);
    const comparison = compareCarOptions(decision);
    const car = carCostsByYear(h, 2027)!;
    expect(car.option).toBe(comparison.best);
    // Same total as the analysis, all inside 2027 to 2031.
    const total = Object.values(car.byYear).reduce((a, b) => a + b, 0);
    const option = comparison.options.find((o) => o.key === comparison.best)!;
    expect(total).toBeCloseTo(option.totalPaid, 6);
    expect(Object.keys(car.byYear).map(Number).every((y) => y >= 2027 && y <= 2031)).toBe(true);
    // Paying cash lands entirely in the first year.
    expect(carCashFlows("cash", decision)[0]).toBeCloseTo(60_000 * 1.06, 6);
  });
});

describe("costs from other steps in the projection", () => {
  const run = (h: Household) => projectScenario(h, new Array(projectionYears(h)).fill(0));

  it("leaves them out while the switch is off", () => {
    const [row] = run(household());
    expect(row.expenseMonthly[premiumExpenseKey("vul")]).toBeUndefined();
    expect(row.expenseMonthly[loanExpenseKey("home")]).toBeUndefined();
    expect(row.monthlyExpenses).toBe(0);
  });

  it("counts premiums, the home's loan payments and the car when it's on", () => {
    const h = household({
      includeOtherExpenses: true,
      carDecision: { ...carDecisionFor(household()), price: 60_000, years: 5 },
    });
    const rows = run(h);
    const first = rows[0];
    expect(first.calendarYear).toBe(2027);
    expect(first.expenseMonthly[premiumExpenseKey("term")]).toBeCloseTo(251.28, 6);
    expect(first.expenseMonthly[premiumExpenseKey("vul")]).toBeCloseTo(500, 6);
    expect(first.expenseMonthly[premiumExpenseKey("whole")]).toBeCloseTo(680, 6);
    // The homestead mortgage's full payment (interest and principal).
    expect(first.expenseMonthly[loanExpenseKey("home")]).toBeCloseTo(2_671, 6);
    const car = carCostsByYear(h, 2027)!;
    expect(first.expenseMonthly[CAR_EXPENSE_KEY]).toBeCloseTo(car.byYear[2027] / 12, 6);
    const sum = Object.values(first.expenseMonthly).reduce((a, b) => a + b, 0);
    expect(first.monthlyExpenses).toBeCloseTo(sum, 6);
    // The term ends with 2038; the car is done after 2031.
    const year = (y: number) => rows.find((r) => r.calendarYear === y)!;
    expect(year(2039).expenseMonthly[premiumExpenseKey("term")]).toBeUndefined();
    expect(year(2032).expenseMonthly[CAR_EXPENSE_KEY]).toBeUndefined();
    // Still no interest deduction for a home: the standard deduction applies.
    expect(first.deductions.depreciation).toBe(0);
  });

  it("stops the home loan payment once it's paid off", () => {
    const rows = run(household({ includeOtherExpenses: true }));
    const paid = rows.find((r) => r.mortgageBalance === 0)!;
    const after = rows.find((r) => r.calendarYear === paid.calendarYear + 1)!;
    expect(after.expenseMonthly[loanExpenseKey("home")]).toBeUndefined();
  });
});
