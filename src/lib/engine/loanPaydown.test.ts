import { describe, expect, it } from "vitest";
import { balanceAtStart, loanTerms } from "@/lib/engine/loanPaydown";
import { levelPayment } from "@/lib/engine/amortization";
import { projectScenario, projectionYears } from "@/lib/engine/project";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";
import type { Household, PropertyLoan } from "@/lib/domain/types";

/** Pay `balance` down for `months` months by hand. */
function paid(balance: number, rate: number, payment: number, months: number): number {
  let b = balance;
  for (let m = 0; m < months && b > 0; m++) b -= Math.min(b, payment - b * (rate / 12));
  return Math.max(0, b);
}

const mortgage: PropertyLoan = {
  id: "m1",
  kind: "mortgage",
  label: "Mortgage",
  balance: 191_490,
  rate: 0.04,
  monthlyPayment: 1_236,
};
const heloc: PropertyLoan = {
  id: "loc",
  kind: "lineOfCredit",
  label: "Line of credit",
  balance: 162_952,
  rate: 0.0574,
  drawEndYear: 2029,
  repaymentYears: 20,
};

function household(loans: PropertyLoan[], extra: Partial<Household> = {}): Household {
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
        id: "re",
        label: "Aventura",
        purchaseYear: 2015,
        purchasePrice: 250_000,
        marketValue: 500_000,
        appreciationRate: 0,
        depreciationYears: 27.5,
        activeParticipation: true,
        monthlyRent: 2_500,
        monthlyOperatingExpenses: 1_600,
        loans,
      },
    ],
    assumptions: { expenseGrowth: 0, finalAge: 70 },
    optimizer: { strategy: "manual" },
    ...extra,
  };
}

describe("loanTerms", () => {
  it("owes a loan from the month after today", () => {
    const t = loanTerms(household([mortgage]), "2026-10-18").m1;
    expect(t.firstPayment).toEqual({ month: 11, year: 2026 });
    expect(t.balance).toBe(191_490);
    expect(t.extraPrincipal).toBe(0);
    expect(loanTerms(household([mortgage]), "2026-12-05").m1.firstPayment).toEqual({
      month: 1,
      year: 2027,
    });
    expect(loanTerms(household([mortgage])).m1.firstPayment).toBeNull();
  });

  it("uses the Mortgage analysis statement when the loan has one", () => {
    const h = household([mortgage], {
      mortgages: [
        {
          id: "mtg-m1",
          label: "Aventura · Mortgage",
          loanId: "m1",
          principalBalance: 190_000,
          interestRate: 0.0375,
          monthlyPayment: 1_300,
          nextPaymentMonth: 1,
          nextPaymentYear: 2027,
          extraPrincipal: 500,
        },
      ],
    });
    const t = loanTerms(h, "2026-10-18").m1;
    expect(t).toMatchObject({
      balance: 190_000,
      rate: 0.0375,
      monthlyPayment: 1_300,
      extraPrincipal: 500,
      firstPayment: { month: 1, year: 2027 },
    });
  });
});

describe("balanceAtStart", () => {
  it("pays a mortgage down from today to January 1 of the start year", () => {
    const t = loanTerms(household([mortgage]), "2026-10-18").m1;
    // November 2026 through December 2039: 158 payments.
    const { balance } = balanceAtStart(t, 2040);
    expect(balance).toBeCloseTo(paid(191_490, 0.04, 1_236, 158), 6);
    expect(balance).toBeGreaterThan(60_000);
    expect(balance).toBeLessThan(70_000);
  });

  it("pays extra principal every month and stops at zero", () => {
    const t = { ...loanTerms(household([mortgage]), "2026-10-18").m1, extraPrincipal: 500 };
    expect(balanceAtStart(t, 2032).balance).toBeCloseTo(paid(191_490, 0.04, 1_736, 62), 6);
    expect(balanceAtStart(t, 2040).balance).toBe(0);
  });

  it("keeps a line of credit interest only, then fixes the level payment", () => {
    const t = loanTerms(household([heloc]), "2026-10-18").loc;
    // Interest only through 2029: still the full balance on January 1, 2030.
    expect(balanceAtStart(t, 2030)).toEqual({ balance: 162_952, lineOfCreditPayment: null });
    // Repayment starts January 2030 on the full balance over 20 years.
    const pay = levelPayment(162_952, 0.0574, 240);
    const at2040 = balanceAtStart(t, 2040);
    expect(at2040.lineOfCreditPayment).toBeCloseTo(pay, 6);
    expect(at2040.balance).toBeCloseTo(paid(162_952, 0.0574, pay, 120), 6);
  });

  it("does nothing when the first payment is in the start year or unknown", () => {
    const t = loanTerms(household([mortgage]), "2026-10-18").m1;
    expect(balanceAtStart(t, 2026).balance).toBe(191_490);
    expect(balanceAtStart({ ...t, firstPayment: null }, 2040).balance).toBe(191_490);
  });
});

describe("loan pay-down in the projection", () => {
  const refs = { ...FALLBACK_REFERENCE_DATA, asOfDate: "2026-10-18" };
  const run = (h: Household) => projectScenario(h, new Array(projectionYears(h)).fill(0), refs);

  it("opens a 2040 plan with the loans paid down since today", () => {
    const rows = run(household([mortgage, heloc]));
    expect(rows[0].calendarYear).toBe(2040);
    // The mortgage's 2040 payments then run on the paid-down balance.
    const mortgageStart = paid(191_490, 0.04, 1_236, 158);
    const locPay = levelPayment(162_952, 0.0574, 240);
    const locStart = paid(162_952, 0.0574, locPay, 120);
    const expected = paid(mortgageStart, 0.04, 1_236, 12) + paid(locStart, 0.0574, locPay, 12);
    expect(rows[0].mortgageBalance).toBeCloseTo(expected, 4);
    // The line of credit keeps the level payment fixed in 2030.
    expect(rows[0].expenseMonthly["loan:re"]).toBeGreaterThan(1_236 + locPay - 0.01);
  });

  it("stops the investment property's payment once the mortgage is paid off", () => {
    const rows = run(household([mortgage], { assumptions: { expenseGrowth: 0, finalAge: 80 } }));
    const payoff = rows.findIndex((r) => r.mortgageBalance === 0);
    // About 18 years from late 2026: paid off in the mid 2040s, not 2058.
    expect(rows[payoff].calendarYear).toBeGreaterThan(2042);
    expect(rows[payoff].calendarYear).toBeLessThan(2047);
    expect(rows[payoff + 1].expenseMonthly["loan:re"]).toBeUndefined();
  });

  it("pays the statement's extra principal in the projection years too", () => {
    const withExtra = household([mortgage], {
      assumptions: { expenseGrowth: 0, finalAge: 70, startYear: 2027 },
      mortgages: [
        {
          id: "mtg-m1",
          label: "Aventura · Mortgage",
          loanId: "m1",
          principalBalance: 191_490,
          interestRate: 0.04,
          monthlyPayment: 1_236,
          nextPaymentMonth: 1,
          nextPaymentYear: 2027,
          extraPrincipal: 500,
        },
      ],
    });
    const [first] = run(withExtra);
    expect(first.calendarYear).toBe(2027);
    expect(first.mortgageBalance).toBeCloseTo(paid(191_490, 0.04, 1_736, 12), 4);
    expect(first.expenseMonthly["loan:re"]).toBeCloseTo(1_736, 6);
  });
});
