import { describe, expect, it } from "vitest";
import type { Household, MortgageStatement } from "@/lib/domain/types";
import { amortize, levelPayment, monthsBetween } from "@/lib/engine/amortization";
import { migrateHousehold } from "@/store/useScenario";

// A textbook 30-year loan: $200,000 at 6%, first payment January 2026.
const loan = (patch: Partial<MortgageStatement> = {}): MortgageStatement => ({
  id: "m1",
  label: "Home",
  principalBalance: 200_000,
  interestRate: 0.06,
  monthlyPayment: 1199.1,
  nextPaymentMonth: 1,
  nextPaymentYear: 2026,
  maturityMonth: 12,
  maturityYear: 2055,
  ...patch,
});

describe("level payment", () => {
  it("matches the standard mortgage formula", () => {
    expect(levelPayment(200_000, 0.06, 360)).toBeCloseTo(1199.1, 2);
    expect(levelPayment(120_000, 0, 120)).toBe(1000);
  });

  it("counts months inclusive of both ends", () => {
    expect(monthsBetween(1, 2026, 12, 2055)).toBe(360);
    expect(monthsBetween(11, 2026, 2, 2027)).toBe(4);
  });
});

describe("amortization from a statement", () => {
  const result = amortize(loan());

  it("splits the first payment into interest (balance x rate / 12) and principal", () => {
    const first = result.rows[0];
    expect(first).toMatchObject({ number: 1, month: 1, year: 2026, interest: 1000, principal: 199.1, endBalance: 199_800.9 });
  });

  it("pays the loan off on the maturity date, folding cent rounding into the last payment", () => {
    expect(result.rows).toHaveLength(360);
    expect(result.payoff).toEqual({ month: 12, year: 2055 });
    expect(result.maturityGap).toBe(0);
    const last = result.rows[result.rows.length - 1];
    expect(last.endBalance).toBe(0);
    expect(last.payment).toBeGreaterThan(1199.1);
    expect(last.payment).toBeLessThan(1250);
  });

  it("adds up to about $231,676 of interest over the life of the loan", () => {
    expect(result.totalInterest).toBeGreaterThan(231_600);
    expect(result.totalInterest).toBeLessThan(231_700);
  });

  it("rolls months into calendar years that match the monthly rows", () => {
    expect(result.years).toHaveLength(30);
    const y = result.years[0];
    const months = result.rows.filter((r) => r.year === 2026);
    expect(y.interest).toBeCloseTo(months.reduce((s, r) => s + r.interest, 0), 2);
    expect(y.endBalance).toBe(months[11].endBalance);
  });

  it("works out the payment from the maturity date when it's left at 0", () => {
    const derived = amortize(loan({ monthlyPayment: 0 }));
    expect(derived.paymentDerived).toBe(true);
    expect(derived.monthlyPayment).toBe(1199.1);
    expect(derived.rows).toHaveLength(360);
  });

  it("flags a payment that lands off the maturity date", () => {
    expect(amortize(loan({ monthlyPayment: 1300 })).maturityGap).toBeLessThan(-12);
  });

  it("shows what extra principal saves", () => {
    const extra = amortize(loan({ extraPrincipal: 200 }));
    expect(extra.extraSavings!.months).toBeGreaterThan(60);
    expect(extra.extraSavings!.interest).toBeGreaterThan(60_000);
    expect(extra.rows[0].extra).toBe(200);
    expect(extra.maturityGap).toBe(0);
  });

  it("pays a lump sum once, with the payment due in its month", () => {
    const lump = amortize(loan({ lumpSum: 20_000, lumpSumMonth: 6, lumpSumYear: 2026 }));
    expect(lump.lumpPaymentNumber).toBe(6);
    expect(lump.rows[5].lump).toBe(20_000);
    expect(lump.rows.filter((r) => r.lump > 0)).toHaveLength(1);
    expect(lump.rows[5].endBalance).toBeCloseTo(lump.rows[5].startBalance - lump.rows[5].principal - 20_000, 2);
    expect(lump.years[0].lump).toBe(20_000);
    expect(lump.extraSavings!.interest).toBeGreaterThan(40_000);
    expect(lump.maturityGap).toBe(0);
    expect(lump.choices.map((c) => c.key)).toEqual(["none", "lump"]);
  });

  it("pays a lump sum with no date (or a past one) with the next payment", () => {
    expect(amortize(loan({ lumpSum: 5_000 })).rows[0].lump).toBe(5_000);
    expect(amortize(loan({ lumpSum: 5_000, lumpSumMonth: 3, lumpSumYear: 2020 })).rows[0].lump).toBe(5_000);
  });

  it("caps a lump sum at what's owed", () => {
    const all = amortize(loan({ lumpSum: 1_000_000 }));
    expect(all.rows).toHaveLength(1);
    expect(all.rows[0].lump).toBe(199_800.9);
    expect(all.payoff).toEqual({ month: 1, year: 2026 });
  });

  it("compares more every month, a lump sum, and both", () => {
    const r = amortize(loan({ extraPrincipal: 200, lumpSum: 20_000 }));
    const by = Object.fromEntries(r.choices.map((c) => [c.key, c]));
    expect(Object.keys(by)).toEqual(["none", "extra", "lump", "both"]);
    expect(by.none.months).toBe(360);
    expect(by.none.interestSaved).toBe(0);
    expect(by.extra.months).toBe(amortize(loan({ extraPrincipal: 200 })).rows.length);
    expect(by.lump.months).toBe(amortize(loan({ lumpSum: 20_000 })).rows.length);
    expect(by.both.months).toBe(r.rows.length);
    expect(by.both.interestSaved).toBeGreaterThan(by.extra.interestSaved);
    expect(by.both.interestSaved).toBeGreaterThan(by.lump.interestSaved);
    // Every choice pays off the same principal: total paid less interest is the balance.
    for (const c of r.choices) expect(c.totalPaid - c.totalInterest).toBeCloseTo(200_000, 0);
  });

  it("carries escrow on every row without amortizing it", () => {
    const withEscrow = amortize(loan({ monthlyEscrow: 450 }));
    expect(withEscrow.rows[0].escrow).toBe(450);
    expect(withEscrow.rows[0].principal).toBe(199.1);
    expect(withEscrow.years[0].escrow).toBe(5400);
  });

  it("stops when the payment doesn't cover the interest", () => {
    const short = amortize(loan({ monthlyPayment: 900 }));
    expect(short.negativeAmortization).toBe(true);
    expect(short.rows).toHaveLength(0);
    expect(short.payoff).toBeNull();
  });
});

describe("saved mortgages", () => {
  it("defaults a plan without mortgages to an empty list and heals bad fields", () => {
    const h = {
      filingStatus: "single",
      residenceState: "FL",
      people: [{ id: "p", name: "P", birthYear: 1960, retirementYear: 2026 }],
      accounts: [],
      incomes: [],
      realEstate: [],
      expenses: [],
      assumptions: { expenseGrowth: 0, finalAge: 90 },
      optimizer: { strategy: "manual" },
    } as unknown as Household;
    expect(migrateHousehold(structuredClone(h)).mortgages).toEqual([]);
    const bad = migrateHousehold({
      ...structuredClone(h),
      mortgages: [
        { id: "m", label: 3, principalBalance: "x", interestRate: 0.05, nextPaymentMonth: 13, nextPaymentYear: 2026, maturityMonth: 5, monthlyPayment: "y" },
        { nope: true },
      ],
    } as unknown as Household).mortgages!;
    expect(bad).toHaveLength(1);
    expect(bad[0].label).toBe("");
    expect(bad[0].principalBalance).toBe(0);
    expect(bad[0].nextPaymentMonth).toBeGreaterThanOrEqual(1);
    expect(bad[0].nextPaymentMonth).toBeLessThanOrEqual(12);
    expect(bad[0].maturityMonth).toBeUndefined();
    expect(bad[0].monthlyPayment).toBeUndefined();
  });
});
