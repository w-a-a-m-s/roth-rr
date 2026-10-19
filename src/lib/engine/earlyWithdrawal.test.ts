import { describe, expect, it } from "vitest";
import type { Account, Household, Person } from "@/lib/domain/types";
import {
  EARLY_WITHDRAWAL_PENALTY_RATE,
  allowsEarlyWithdrawals,
  owesEarlyWithdrawalPenalty,
} from "@/lib/engine/earlyWithdrawal";
import { projectScenario, projectionYears } from "@/lib/engine/project";
import { spendingCapacity } from "@/lib/engine/spendingCapacity";

const pat: Person = { id: "p", name: "Pat", birthYear: 1972, retirementYear: 2026 };
const ira: Account = { id: "ira", label: "IRA", ownerId: "p", kind: "retirementTaxable", balance: 500_000, growthRate: 0, retirementType: "ira" };
const roth: Account = { id: "roth", label: "Roth", ownerId: "p", kind: "rothTaxFree", balance: 100_000, growthRate: 0 };
const brk: Account = { id: "brk", label: "Brokerage", ownerId: "p", kind: "investment", balance: 20_000, costBasis: 20_000, growthRate: 0 };

describe("who owes the 10% penalty", () => {
  const owes = (acc: Account, year: number, person: Person = pat) =>
    owesEarlyWithdrawalPenalty(acc, [person], year);

  it("charges IRA and Roth draws until the year the owner turns 60", () => {
    expect(owes(ira, 2026)).toBe(true); // 54
    expect(owes(ira, 2031)).toBe(true); // 59: maybe not 59½ yet
    expect(owes(ira, 2032)).toBe(false); // 60
    expect(owes(roth, 2031)).toBe(true);
    expect(owes(roth, 2032)).toBe(false);
  });

  it("never charges after-tax accounts", () => {
    expect(owes(brk, 2026)).toBe(false);
  });

  it("lets employer plans go penalty-free after leaving work at 55 or later", () => {
    const k401: Account = { ...ira, retirementType: "401k" };
    const at55 = { ...pat, retirementYear: 2027 }; // turns 55 in 2027
    expect(owes(k401, 2026, at55)).toBe(true); // still working
    expect(owes(k401, 2027, at55)).toBe(false);
    // Left at 54: the Rule of 55 doesn't apply.
    expect(owes(k401, 2027, pat)).toBe(true);
    // Never for an IRA.
    expect(owes(ira, 2027, at55)).toBe(true);
  });

  it("never charges a 457(b), an heir or a disabled owner", () => {
    expect(owes({ ...ira, retirementType: "457b" }, 2026)).toBe(false);
    const death = { personId: "p", year: 2027, survivorId: null };
    expect(owesEarlyWithdrawalPenalty(ira, [pat], 2028, { death })).toBe(false);
    const disability = { personId: "p", year: 2028 };
    expect(owesEarlyWithdrawalPenalty(ira, [pat], 2027, { disability })).toBe(true);
    expect(owesEarlyWithdrawalPenalty(ira, [pat], 2028, { disability })).toBe(false);
  });

  it("is off unless the plan allows it", () => {
    expect(allowsEarlyWithdrawals({ assumptions: { expenseGrowth: 0, finalAge: 90 } })).toBe(false);
    expect(
      allowsEarlyWithdrawals({ assumptions: { expenseGrowth: 0, finalAge: 90, allowEarlyWithdrawals: true } }),
    ).toBe(true);
  });
});

function plan(allow: boolean, extra: Partial<Household> = {}): Household {
  return {
    filingStatus: "single",
    residenceState: "FL",
    people: [pat],
    accounts: [ira, roth, brk],
    incomes: [
      {
        id: "draw",
        label: "IRA draw",
        ownerId: "p",
        kind: "retirementDraw",
        monthlyAmount: 2_000,
        growthRate: 0,
        taxability: "full",
        drawsFromAccountId: "ira",
      },
    ],
    realEstate: [],
    expenses: [],
    assumptions: { expenseGrowth: 0, finalAge: 62, taxIndexing: 0, allowEarlyWithdrawals: allow || undefined },
    optimizer: { strategy: "manual" },
    ...extra,
  };
}

const run = (h: Household, coverShortfalls = false) =>
  projectScenario(h, new Array(projectionYears(h)).fill(0), undefined, { coverShortfalls });

describe("scheduled draws before 59½", () => {
  it("skips the draw when early withdrawals aren't allowed", () => {
    const rows = run(plan(false));
    const at = (y: number) => rows.find((r) => r.calendarYear === y)!;
    expect(at(2026).incomeMonthly.draw ?? 0).toBe(0);
    expect(at(2026).balances.ira).toBe(500_000);
    expect(at(2031).incomeMonthly.draw ?? 0).toBe(0);
    // From the year Pat turns 60 the draw is taken, with no penalty.
    expect(at(2032).incomeMonthly.draw).toBe(2_000);
    expect(at(2032).earlyWithdrawalPenalty).toBe(0);
  });

  it("takes it and adds 10% of it to the federal tax when allowed", () => {
    const allowed = run(plan(true));
    const blocked = run(plan(false));
    const r = allowed[0];
    expect(r.incomeMonthly.draw).toBe(2_000);
    expect(r.earlyDistributions).toBe(24_000);
    expect(r.earlyWithdrawalPenalty).toBeCloseTo(24_000 * EARLY_WITHDRAWAL_PENALTY_RATE, 6);
    // The draw is taxed as income too; the penalty sits on top of that tax.
    expect(r.federalAnnualTax).toBeCloseTo(
      r.federalOrdinaryTax + r.federalCapitalGainsTax + r.netInvestmentIncomeTax + r.employmentTax.total + 2_400,
      6,
    );
    expect(blocked[0].federalAnnualTax).toBe(0);
    // Past 59½ there's nothing to charge.
    expect(allowed.find((x) => x.calendarYear === 2032)!.earlyWithdrawalPenalty).toBe(0);
  });
});

describe("covering a short year before 59½", () => {
  const spender = (allow: boolean) =>
    plan(allow, {
      incomes: [],
      expenses: [{ id: "e", label: "Living", amount: 5_000, frequency: "monthly", growthRate: 0 }],
    });

  it("only spends the after-tax money, and leaves the year short, when not allowed", () => {
    const rows = run(spender(false), true);
    const r = rows[0];
    expect(r.balances.brk).toBe(0);
    expect(r.balances.ira).toBe(500_000);
    expect(r.balances.roth).toBe(100_000);
    expect(r.surplus).toBeLessThan(-1);
    expect(r.earlyWithdrawalPenalty).toBe(0);
  });

  it("draws the IRA with the penalty grossed up when allowed", () => {
    const r = run(spender(true), true)[0];
    expect(r.balances.brk).toBe(0);
    expect(r.balances.ira).toBeLessThan(500_000);
    expect(r.earlyDistributions).toBeCloseTo(500_000 - r.balances.ira, 6);
    expect(r.earlyWithdrawalPenalty).toBeCloseTo(0.1 * r.earlyDistributions, 6);
    expect(r.surplus).toBeGreaterThan(-1);
  });

  it("lowers spending capacity when the IRA can't be touched early", () => {
    const blocked = spendingCapacity(spender(false), []).baseline.capacityMonthly;
    const allowed = spendingCapacity(spender(true), []).baseline.capacityMonthly;
    expect(blocked).toBeLessThan(allowed);
    expect(blocked).toBeGreaterThan(0);
  });
});
