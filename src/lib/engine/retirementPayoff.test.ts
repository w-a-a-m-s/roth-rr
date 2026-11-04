import { describe, expect, it } from "vitest";
import type { Household, MortgageStatement } from "@/lib/domain/types";
import {
  RETIREMENT_PAYOFF_TAX_RATES,
  compareRetirementPayoff,
  retirementPayoffAccounts,
  retirementPayoffSettingsFor,
} from "@/lib/engine/retirementPayoff";

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

const settings = { accountReturn: 0.06, lumpSumTaxRate: 0.32, monthlyTaxRate: 0.22 };

describe("compareRetirementPayoff", () => {
  const r = compareRetirementPayoff(loan, 1_000_000, settings)!;

  it("grosses each withdrawal up for its own tax", () => {
    expect(r.lumpSumWithdrawal).toBeCloseTo(300_000 / 0.68, 6);
    expect(r.lumpSumTax).toBeCloseTo(300_000 / 0.68 - 300_000, 6);
    expect(r.monthlyWithdrawal).toBeCloseTo(2025.62 / 0.78, 6);
    expect(r.keepTax).toBeCloseTo(r.keepWithdrawals * 0.22, 6);
    expect(r.payoff).toEqual({ month: 10, year: 2051 });
    expect(r.years[r.years.length - 1].keepMortgage).toBe(0);
  });

  it("keeps it ahead when the lump sum is taxed well above the monthly draws", () => {
    expect(Math.round(r.payoffEnd)).toBe(2_398_398);
    expect(Math.round(r.keepEnd)).toBe(2_535_581);
    expect(r.years[r.years.length - 1].payoffAhead).toBeCloseTo(r.payoffEnd - r.keepEnd, 4);
    expect(r.lumpSumShort).toBe(false);
    expect(r.breakevenLumpSumRate).toBeCloseTo(0.2669, 4);
    expect(r.keepRunsOutYear).toBeNull();
  });

  it("ends even at the breakeven lump-sum rate", () => {
    const even = compareRetirementPayoff(loan, 1_000_000, {
      ...settings,
      lumpSumTaxRate: r.breakevenLumpSumRate,
    })!;
    expect(Math.abs(even.payoffEnd - even.keepEnd)).toBeLessThan(0.01);
  });

  it("with the same rate both sides, pays off ahead when the account earns under the loan rate", () => {
    const same = { accountReturn: 0.05, lumpSumTaxRate: 0.24, monthlyTaxRate: 0.24 };
    const low = compareRetirementPayoff(loan, 1_000_000, same)!;
    expect(low.payoffEnd).toBeGreaterThan(low.keepEnd);
    const high = compareRetirementPayoff(loan, 1_000_000, { ...same, accountReturn: 0.08 })!;
    expect(high.payoffEnd).toBeLessThan(high.keepEnd);
    const even = compareRetirementPayoff(loan, 1_000_000, { ...same, accountReturn: low.breakevenReturn })!;
    expect(Math.abs(even.payoffEnd - even.keepEnd)).toBeLessThan(1);
  });

  it("fills a grid of every bracket pair that matches a full run", () => {
    expect(r.grid).toHaveLength(RETIREMENT_PAYOFF_TAX_RATES.length ** 2);
    for (const c of r.grid) {
      const run = compareRetirementPayoff(loan, 1_000_000, {
        accountReturn: 0.06,
        lumpSumTaxRate: c.lumpSumTaxRate,
        monthlyTaxRate: c.monthlyTaxRate,
      })!;
      expect(c.payoffAhead).toBeCloseTo(run.payoffEnd - run.keepEnd, 4);
    }
  });

  it("flags an account too small for the lump sum, or one that runs dry", () => {
    const small = compareRetirementPayoff(loan, 200_000, settings)!;
    expect(small.lumpSumShort).toBe(true);
    expect(small.keepRunsOutYear).not.toBeNull();
  });

  it("skips a loan whose payment doesn't cover the interest", () => {
    expect(
      compareRetirementPayoff({ ...loan, maturityMonth: undefined, maturityYear: undefined }, 1_000_000, settings),
    ).toBeNull();
  });
});

describe("retirementPayoffSettingsFor", () => {
  it("fills defaults and keeps rates in range", () => {
    expect(retirementPayoffSettingsFor({} as Household)).toEqual({
      mortgageId: undefined,
      accountId: undefined,
      accountReturn: 0.06,
      lumpSumTaxRate: 0.32,
      monthlyTaxRate: 0.22,
    });
    const h = { retirementPayoff: { accountId: "a", accountReturn: 0.05, lumpSumTaxRate: 3, monthlyTaxRate: -1 } } as unknown as Household;
    expect(retirementPayoffSettingsFor(h)).toMatchObject({ accountId: "a", accountReturn: 0.05, lumpSumTaxRate: 0.99, monthlyTaxRate: 0 });
  });

  it("lists tax-deferred accounts, largest first", () => {
    const h = {
      accounts: [
        { id: "a", kind: "retirementTaxable", balance: 5 },
        { id: "b", kind: "investment", balance: 50 },
        { id: "c", kind: "retirementTaxable", balance: 10 },
      ],
    } as unknown as Household;
    expect(retirementPayoffAccounts(h).map((a) => a.id)).toEqual(["c", "a"]);
  });
});
