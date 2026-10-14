import { describe, expect, it } from "vitest";
import type { Household, MortgageStatement } from "@/lib/domain/types";
import { compareMortgagePayoff, mortgagePayoffSettingsFor } from "@/lib/engine/mortgagePayoff";

// $300,000 at 6.5%, 300 payments left from November 2026: $2,025.62 a month.
const loan: MortgageStatement = {
  id: "m",
  label: "Home",
  principalBalance: 300_000,
  interestRate: 0.065,
  monthlyPayment: 0,
  nextPaymentMonth: 11,
  nextPaymentYear: 2026,
  maturityMonth: 10,
  maturityYear: 2051,
};

describe("compareMortgagePayoff", () => {
  const r = compareMortgagePayoff(loan, { investmentReturn: 0.07, taxRate: 0.15 })!;

  it("compares the two when the mortgage would be paid off", () => {
    expect(r.monthlyPayment).toBe(2025.62);
    expect(r.months).toBe(300);
    expect(r.payoff).toEqual({ month: 10, year: 2051 });
    expect(r.years[r.years.length - 1].keepMortgage).toBe(0);
  });

  it("pays off ahead when the after-tax return is under the mortgage rate", () => {
    // 7% less 15% tax is 5.95%, under the loan's 6.70% compounded monthly.
    expect(r.afterTaxReturn).toBeCloseTo(0.0595, 10);
    expect(r.breakevenReturn).toBeCloseTo(0.0670 / 0.85, 3);
    expect(Math.round(r.payoffEnd)).toBe(1_360_001);
    expect(Math.round(r.keepEnd)).toBe(1_272_463);
    expect(r.years[r.years.length - 1].keepAhead).toBeCloseTo(r.keepEnd - r.payoffEnd, 6);
  });

  it("ends even at the breakeven return", () => {
    const even = compareMortgagePayoff(loan, { investmentReturn: r.breakevenReturn, taxRate: 0.15 })!;
    expect(Math.abs(even.keepEnd - even.payoffEnd)).toBeLessThan(1);
  });

  it("keeps it ahead when investing earns more", () => {
    const more = compareMortgagePayoff(loan, { investmentReturn: 0.1, taxRate: 0.15 })!;
    expect(more.keepEnd).toBeGreaterThan(more.payoffEnd);
  });

  it("skips a loan whose payment doesn't cover the interest", () => {
    expect(compareMortgagePayoff({ ...loan, maturityMonth: undefined, maturityYear: undefined }, { investmentReturn: 0.07, taxRate: 0 })).toBeNull();
  });
});

describe("mortgagePayoffSettingsFor", () => {
  it("fills defaults and keeps the tax rate between 0 and 100%", () => {
    const h = { mortgagePayoff: { investmentReturn: 0.08, taxRate: 2 } } as unknown as Household;
    expect(mortgagePayoffSettingsFor(h)).toEqual({ mortgageId: undefined, investmentReturn: 0.08, taxRate: 1 });
    expect(mortgagePayoffSettingsFor({} as Household)).toEqual({ mortgageId: undefined, investmentReturn: 0.06, taxRate: 0.15 });
  });
});
