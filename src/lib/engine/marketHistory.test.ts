import { describe, expect, it } from "vitest";
import {
  accountGrowthForYear,
  accountReturnSource,
  historyStartYear,
  historyYearFor,
  usesMarketHistory,
} from "@/lib/engine/marketHistory";
import {
  SP500_FIRST_YEAR,
  SP500_LAST_YEAR,
  balancedReturn,
  sp500Return,
  sp500Years,
  treasury10yReturn,
} from "@/lib/config/marketHistory";
import { projectScenario, projectionYears } from "@/lib/engine/project";
import type { Account, Household } from "@/lib/domain/types";

const ira: Account = { id: "ira", label: "IRA", ownerId: "p", kind: "retirementTaxable", balance: 1_000_000, growthRate: 0.05 };
const roth: Account = { id: "roth", label: "Roth", ownerId: "p", kind: "rothTaxFree", balance: 100_000, growthRate: 0.1 };
const cd: Account = { id: "cd", label: "CD", ownerId: "p", kind: "cd", balance: 50_000, growthRate: 0.03 };

function plan(history?: number): Household {
  return {
    filingStatus: "single",
    residenceState: "FL",
    people: [{ id: "p", name: "Pat", birthYear: 1951, retirementYear: 2026 }],
    accounts: [ira, roth, cd],
    incomes: [],
    realEstate: [],
    expenses: [],
    assumptions: {
      expenseGrowth: 0,
      finalAge: 80,
      ...(history != null ? { returnMode: "history" as const, historyStartYear: history } : {}),
    },
    optimizer: { strategy: "manual" },
  };
}

describe("S&P 500 returns data", () => {
  it("covers every year from 1950 to 2025, matching the source's known years", () => {
    expect(SP500_FIRST_YEAR).toBe(1950);
    expect(SP500_LAST_YEAR).toBe(2025);
    expect(sp500Years()).toHaveLength(76);
    // Spot checks against Damodaran's histretSP (S&P 500 includes dividends).
    expect(sp500Return(1954)).toBeCloseTo(0.5256, 6);
    expect(sp500Return(1974)).toBeCloseTo(-0.259, 6);
    expect(sp500Return(1989)).toBeCloseTo(0.3148, 6);
    expect(sp500Return(2008)).toBeCloseTo(-0.3655, 6);
    expect(sp500Return(2022)).toBeCloseTo(-0.1804, 6);
    expect(sp500Return(2025)).toBeCloseTo(0.1778, 6);
  });
});

describe("market history years", () => {
  it("starts at the chosen year and steps one year per plan year", () => {
    const h = plan(1989);
    expect(usesMarketHistory(h)).toBe(true);
    expect(historyYearFor(h, 0)).toBe(1989);
    expect(historyYearFor(h, 1)).toBe(1990);
    expect(historyYearFor(h, 2)).toBe(1991);
  });

  it("wraps back to 1950 after the last year", () => {
    const h = plan(2024);
    expect(historyYearFor(h, 1)).toBe(2025);
    expect(historyYearFor(h, 2)).toBe(1950);
    expect(historyYearFor(h, 3)).toBe(1951);
  });

  it("defaults to 1950 and keeps the start inside the data", () => {
    expect(historyStartYear(plan())).toBe(1950);
    expect(historyStartYear(plan(1900))).toBe(1950);
    expect(historyStartYear(plan(2100))).toBe(2025);
  });

  it("gives market accounts the S&P year and leaves the rest on their own rate", () => {
    const h = plan(2008);
    expect(accountGrowthForYear(h, ira, 0)).toBeCloseTo(-0.3655, 6);
    expect(accountGrowthForYear(h, roth, 0)).toBeCloseTo(-0.3655, 6);
    expect(accountGrowthForYear(h, cd, 0)).toBe(0.03);
    // Before the plan starts, and in Fixed mode, the account's own rate.
    expect(accountGrowthForYear(h, ira, -1)).toBe(0.05);
    expect(accountGrowthForYear(plan(), ira, 0)).toBe(0.05);
  });
});

describe("market history in the projection", () => {
  const run = (h: Household) => projectScenario(h, new Array(projectionYears(h)).fill(0));

  it("grows the IRA and the Roth by the same S&P years, in order", () => {
    const rows = run(plan(1989));
    // 1989 (+31.48%), then 1990 (-3.06%), on the Roth (no withdrawals).
    expect(rows[0].balances.roth).toBeCloseTo(100_000 * 1.3148, 4);
    expect(rows[1].balances.roth).toBeCloseTo(100_000 * 1.3148 * 0.9694, 4);
    // The CD keeps its 3%.
    expect(rows[1].balances.cd).toBeCloseTo(50_000 * 1.03 ** 2, 4);
    // The IRA gets the same 31.48% before its RMD comes out.
    const rmd0 = rows[0].incomeMonthly["rmd:ira"] * 12;
    expect(rows[0].balances.ira).toBeCloseTo(1_000_000 * 1.3148 - rmd0, 4);
  });

  it("compounds the S&P years in order, and leaves Fixed mode alone", () => {
    // Starting in 2008: the crash year, then the 2009 recovery.
    const crashFirst = run(plan(2008));
    const h = plan(2009);
    const rows = run(h);
    const roth2 = (r: typeof rows) => r[1].balances.roth;
    const crashThenRecover = 100_000 * (1 + sp500Return(2008)!) * (1 + sp500Return(2009)!);
    expect(roth2(crashFirst)).toBeCloseTo(crashThenRecover, 4);
    expect(rows[0].balances.roth).toBeCloseTo(100_000 * (1 + sp500Return(2009)!), 4);
    // Fixed mode is unchanged by any of this.
    expect(run(plan())[0].balances.roth).toBeCloseTo(110_000, 4);
  });
});

describe("50% S&P 500 / 50% 10-year Treasury history", () => {
  const run = (h: Household) => projectScenario(h, new Array(projectionYears(h)).fill(0));

  it("has a Treasury return for every S&P year, matching the source's known years", () => {
    expect(sp500Years().every((y) => y.treasury != null && y.balanced != null)).toBe(true);
    expect(treasury10yReturn(1950)).toBeCloseTo(0.0043, 6);
    expect(treasury10yReturn(2008)).toBeCloseTo(0.201, 6);
    expect(treasury10yReturn(2022)).toBeCloseTo(-0.1783, 6);
    expect(treasury10yReturn(2025)).toBeCloseTo(0.078, 6);
    // 2008: stocks -36.55%, bonds +20.10%, rebalanced 50 / 50.
    expect(balancedReturn(2008)).toBeCloseTo((-0.3655 + 0.201) / 2, 6);
  });

  it("grows the plan's market accounts by the mix in 50 / 50 mode, CDs stay fixed", () => {
    const h = plan(2008);
    h.assumptions.returnMode = "balanced";
    expect(usesMarketHistory(h)).toBe(true);
    const rows = run(h);
    expect(rows[0].balances.roth).toBeCloseTo(100_000 * (1 + balancedReturn(2008)!), 4);
    expect(rows[1].balances.roth).toBeCloseTo(
      100_000 * (1 + balancedReturn(2008)!) * (1 + balancedReturn(2009)!),
      4,
    );
    expect(rows[0].balances.cd).toBeCloseTo(50_000 * 1.03, 4);
  });

  it("lets each account pick its own returns over the plan's", () => {
    // The plan is on fixed returns; each account follows its own tag.
    const h = plan();
    h.assumptions.historyStartYear = 2008;
    h.accounts = [
      { ...roth, id: "fixed", returnSource: "fixed" },
      { ...roth, id: "stocks", returnSource: "sp500" },
      { ...roth, id: "mix", returnSource: "balanced" },
      { ...roth, id: "plan" },
      { ...cd, returnSource: "sp500" },
    ];
    const year0 = run(h)[0].balances;
    expect(year0.fixed).toBeCloseTo(110_000, 4);
    expect(year0.stocks).toBeCloseTo(100_000 * (1 + sp500Return(2008)!), 4);
    expect(year0.mix).toBeCloseTo(100_000 * (1 + balancedReturn(2008)!), 4);
    // No tag: the plan's fixed returns.
    expect(year0.plan).toBeCloseTo(110_000, 4);
    // Any account can be tagged, a CD too.
    expect(year0.cd).toBeCloseTo(50_000 * (1 + sp500Return(2008)!), 4);
    // A fixed tag holds even when the plan is on history.
    h.assumptions.returnMode = "history";
    const history0 = run(h)[0].balances;
    expect(history0.fixed).toBeCloseTo(110_000, 4);
    expect(history0.plan).toBeCloseTo(100_000 * (1 + sp500Return(2008)!), 4);
    expect(accountReturnSource(h, { kind: "cd" })).toBe("fixed");
  });
});
