import { describe, it, expect } from "vitest";
import type { CarDecision, Household } from "@/lib/domain/types";
import {
  carDecisionFor,
  compareCarOptions,
  defaultCarDecision,
  loanPayment,
} from "@/lib/engine/carDecision";

const household = (extra: Partial<Household> = {}) =>
  ({
    people: [],
    accounts: [],
    incomes: [],
    oneTimeDepreciation: [{ id: "d", label: "Car", amount: 60_000, year: 2028 }],
    ...extra,
  }) as unknown as Household;

/** $60k car, 6% tax, 5 years, 15%/yr depreciation, 5% return. */
const DECISION: CarDecision = defaultCarDecision(household());

describe("car analysis: lease, cash or finance", () => {
  it("takes the price from a car in the plan, else a default", () => {
    expect(DECISION.price).toBe(60_000);
    expect(defaultCarDecision(household({ oneTimeDepreciation: [] })).price).toBe(50_000);
  });

  it("heals saved inputs: missing or bad numbers fall back to defaults", () => {
    const h = household({
      carDecision: { ...DECISION, price: 45_000, loanRate: Number.NaN } as CarDecision,
    });
    const d = carDecisionFor(h);
    expect(d.price).toBe(45_000);
    expect(d.loanRate).toBe(DECISION.loanRate);
  });

  it("level loan payment", () => {
    expect(loanPayment(50_000, 0.065, 60)).toBeCloseTo(978.31, 2);
    expect(loanPayment(12_000, 0, 12)).toBe(1_000);
  });

  it("pins cash, finance and lease over 5 years", () => {
    const r = compareCarOptions(DECISION);
    const by = Object.fromEntries(r.options.map((o) => [o.key, o]));
    const endValue = 60_000 * 0.85 ** 5;
    expect(r.endCarValue).toBeCloseTo(endValue, 2);

    // Cash: price + 6% tax up front, the car's value back at the end.
    expect(by.cash.upFront).toBeCloseTo(63_600, 2);
    expect(by.cash.netCost).toBeCloseTo(63_600 - endValue, 2);

    // Finance: $10k down + tax, then 60 payments; paid off at the end.
    expect(by.finance.upFront).toBeCloseTo(13_600, 2);
    expect(by.finance.totalPaid).toBeCloseTo(13_600 + 60 * loanPayment(50_000, 0.065, 60), 2);
    expect(by.finance.endEquity).toBeCloseTo(endValue, 2);

    // Lease: 36 months then a second lease; two signings, one turn-in fee,
    // 60 payments, nothing owned at the end.
    expect(by.lease.totalPaid).toBeCloseTo(2 * 3_000 + 400 + 60 * 650, 2);
    expect(by.lease.endEquity).toBe(0);

    expect(Math.round(by.cash.netCostWithGrowth)).toBe(54_549);
    expect(Math.round(by.finance.netCostWithGrowth)).toBe(57_078);
    expect(Math.round(by.lease.netCostWithGrowth)).toBe(51_656);
    expect(r.best).toBe("lease");
  });

  it("year by year: a financed car carries its loan balance against its value", () => {
    const r = compareCarOptions(DECISION);
    const y1 = r.years[0];
    expect(y1.equity.cash).toBeCloseTo(60_000 * 0.85, 2);
    expect(y1.equity.finance).toBeLessThan(y1.equity.cash);
    expect(y1.netCost.lease).toBeCloseTo(3_000 + 12 * 650, 2);
    expect(r.years.at(-1)!.netCost.cash).toBeCloseTo(
      r.options.find((o) => o.key === "cash")!.netCost,
      2,
    );
  });

  it("with no investment return, lost growth adds nothing", () => {
    const r = compareCarOptions({ ...DECISION, investmentReturn: 0 });
    for (const o of r.options) expect(o.netCostWithGrowth).toBeCloseTo(o.netCost, 2);
  });
});

describe("car analysis: lease mileage", () => {
  it("charges the miles over the allowance at each turn-in, prorated for a lease still running", () => {
    // 15,000 driven on a 12,000 allowance: 3,000 extra miles a year at $0.25.
    const d = { ...DECISION, milesDrivenPerYear: 15_000 };
    const r = compareCarOptions(d);
    const lease = r.options.find((o) => o.key === "lease")!;
    // 5 years: the first 36-month lease owes 3 years, the second 2 years.
    expect(lease.excessMileCharges).toBeCloseTo(5 * 3_000 * 0.25, 2);
    expect(lease.totalPaid).toBeCloseTo(2 * 3_000 + 400 + 60 * 650 + 3_750, 2);
    // Charged at turn-in: year 3 picks up the first lease's 3 years.
    expect(r.years[2].paid.lease - r.years[1].paid.lease).toBeCloseTo(
      3_000 + 12 * 650 + 400 + 3 * 3_000 * 0.25,
      2,
    );
    // Buying doesn't pay it.
    const cash = r.options.find((o) => o.key === "cash")!;
    expect(cash.excessMileCharges).toBe(0);
    expect(cash.totalPaid).toBeCloseTo(63_600, 2);
  });

  it("charges nothing when driving within the allowance", () => {
    const r = compareCarOptions({ ...DECISION, milesDrivenPerYear: 10_000 });
    expect(r.options.find((o) => o.key === "lease")!.excessMileCharges).toBe(0);
  });
});
