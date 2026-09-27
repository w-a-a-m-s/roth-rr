import { describe, it, expect } from "vitest";
import type {
  Account,
  Deposit,
  Expense,
  Household,
  IncomeSource,
} from "@/lib/domain/types";
import { migrateHousehold } from "@/store/useScenario";

function account(partial: Partial<Account> & Pick<Account, "id" | "kind">): Account {
  return {
    label: partial.id,
    ownerId: "p1",
    balance: 100000,
    growthRate: 0.05,
    ...partial,
  };
}

function income(
  partial: Partial<IncomeSource> & Pick<IncomeSource, "id" | "kind">,
): IncomeSource {
  return {
    label: partial.id,
    ownerId: "p1",
    monthlyAmount: 1000,
    growthRate: 0,
    taxability: "full",
    ...partial,
  };
}

function household(accounts: Account[], incomes: IncomeSource[]): Household {
  return {
    filingStatus: "single",
    people: [{ id: "p1", name: "P", birthYear: 1960, retirementYear: 2026 }],
    accounts,
    incomes,
    realEstate: [],
    expenses: [],
    assumptions: { expenseGrowth: 0.02, finalAge: 85 },
    optimizer: { strategy: "manual" },
  };
}

describe("migrateHousehold: strip legacy RMD assumptions", () => {
  it("removes rmdAge from assumptions", () => {
    const h = household([], []);
    (h.assumptions as { rmdAge?: number }).rmdAge = 73;
    const out = migrateHousehold(h);
    expect(out.assumptions).not.toHaveProperty("rmdAge");
    expect(out.assumptions.finalAge).toBe(85);
  });

  it("removes rmdRate now that the IRS table sets the amount", () => {
    const h = household([], []);
    (h.assumptions as { rmdRate?: number }).rmdRate = 0.05;
    const out = migrateHousehold(h);
    expect(out.assumptions).not.toHaveProperty("rmdRate");
    expect(out.assumptions.expenseGrowth).toBe(0.02);
    expect(out.assumptions.finalAge).toBe(85);
  });

  it("is idempotent on a plan that never had either field", () => {
    const out = migrateHousehold(migrateHousehold(household([], [])));
    expect(out.assumptions).not.toHaveProperty("rmdAge");
    expect(out.assumptions).not.toHaveProperty("rmdRate");
    expect(out.assumptions.finalAge).toBe(85);
  });
});

describe("migrateHousehold: soft-delete trash arrays", () => {
  it("defaults missing deleted* arrays to empty lists", () => {
    const h = household([], []);
    // Simulate a plan saved before soft-delete existed.
    delete (h as { deletedPeople?: unknown }).deletedPeople;
    delete (h as { deletedAccounts?: unknown }).deletedAccounts;
    delete (h as { deletedIncomes?: unknown }).deletedIncomes;
    delete (h as { deletedRealEstate?: unknown }).deletedRealEstate;
    delete (h as { deletedExpenses?: unknown }).deletedExpenses;

    const out = migrateHousehold(h);
    expect(out.deletedPeople).toEqual([]);
    expect(out.deletedAccounts).toEqual([]);
    expect(out.deletedIncomes).toEqual([]);
    expect(out.deletedRealEstate).toEqual([]);
    expect(out.deletedExpenses).toEqual([]);
  });

  it("wraps legacy bare deleted items as { item, deletedAt }", () => {
    const h = household([], []);
    const bare = account({ id: "old", kind: "retirementTaxable", label: "Old IRA" });
    (h as { deletedAccounts: unknown }).deletedAccounts = [bare];

    const out = migrateHousehold(h);
    expect(out.deletedAccounts).toHaveLength(1);
    expect(out.deletedAccounts![0].item).toMatchObject({ id: "old", label: "Old IRA" });
    expect(out.deletedAccounts![0].deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("migrateHousehold: heal sourceless withdrawal incomes", () => {
  it("backfills drawsFromAccountId when exactly one eligible account exists", () => {
    const h = household(
      [account({ id: "ret", kind: "retirementTaxable" })],
      [income({ id: "draw", kind: "retirementDraw" })],
    );
    const out = migrateHousehold(h);
    expect(out.incomes[0].drawsFromAccountId).toBe("ret");
  });

  it("leaves it unset when multiple eligible accounts exist (ambiguous)", () => {
    const h = household(
      [
        account({ id: "ret-a", kind: "retirementTaxable" }),
        account({ id: "ret-b", kind: "retirementTaxable" }),
      ],
      [income({ id: "draw", kind: "retirementDraw" })],
    );
    const out = migrateHousehold(h);
    expect(out.incomes[0].drawsFromAccountId).toBeUndefined();
  });

  it("leaves it unset when no eligible account exists", () => {
    const h = household(
      [account({ id: "roth", kind: "rothTaxFree" })],
      [income({ id: "draw", kind: "retirementDraw" })],
    );
    const out = migrateHousehold(h);
    expect(out.incomes[0].drawsFromAccountId).toBeUndefined();
  });

  it("does not match a withdrawal to the wrong account kind", () => {
    // A rothWithdrawal must only link to a rothTaxFree account, never the IRA.
    const h = household(
      [
        account({ id: "ret", kind: "retirementTaxable" }),
        account({ id: "roth", kind: "rothTaxFree" }),
      ],
      [income({ id: "rdraw", kind: "rothWithdrawal", taxability: "taxFree" })],
    );
    const out = migrateHousehold(h);
    expect(out.incomes[0].drawsFromAccountId).toBe("roth");
  });

  it("preserves an existing valid link", () => {
    const h = household(
      [
        account({ id: "ret-a", kind: "retirementTaxable" }),
        account({ id: "ret-b", kind: "retirementTaxable" }),
      ],
      [income({ id: "draw", kind: "retirementDraw", drawsFromAccountId: "ret-b" })],
    );
    const out = migrateHousehold(h);
    expect(out.incomes[0].drawsFromAccountId).toBe("ret-b");
  });
});

describe("migrateHousehold: account deposits", () => {
  it("defaults a missing deposits list to an empty array", () => {
    const h = household([account({ id: "ret", kind: "retirementTaxable" })], []);
    expect(h.accounts[0]).not.toHaveProperty("deposits");
    const out = migrateHousehold(h);
    expect(out.accounts[0].deposits).toEqual([]);
  });

  it("drops deposits the engine could not place in time or size", () => {
    const h = household([account({ id: "ret", kind: "retirementTaxable" })], []);
    h.accounts[0].deposits = [
      {
        id: "good",
        label: "Contribution",
        amount: 500,
        frequency: "monthly",
        startYear: 2026,
      },
      // No start year and no amount: unplaceable, so both are dropped.
      {
        id: "no-year",
        label: "Broken",
        amount: 500,
        frequency: "monthly",
      } as unknown as Deposit,
      {
        id: "no-amount",
        label: "Broken",
        frequency: "monthly",
        startYear: 2026,
      } as unknown as Deposit,
    ];
    const out = migrateHousehold(h);
    expect(out.accounts[0].deposits?.map((d) => d.id)).toEqual(["good"]);
  });

  it("heals a deposit missing its frequency", () => {
    const h = household([account({ id: "ret", kind: "retirementTaxable" })], []);
    h.accounts[0].deposits = [
      {
        id: "dep",
        label: "Contribution",
        amount: 500,
        startYear: 2026,
      } as unknown as Deposit,
    ];
    const out = migrateHousehold(h);
    expect(out.accounts[0].deposits?.[0].frequency).toBe("monthly");
  });

  it("drops the growth rate deposits used to escalate by", () => {
    const h = household([account({ id: "ret", kind: "retirementTaxable" })], []);
    h.accounts[0].deposits = [
      {
        id: "dep",
        label: "Contribution",
        amount: 500,
        frequency: "monthly",
        growthRate: 0.03,
        startYear: 2026,
      } as unknown as Deposit,
    ];
    const out = migrateHousehold(h);
    expect(out.accounts[0].deposits?.[0]).not.toHaveProperty("growthRate");
    expect(out.accounts[0].deposits?.[0].amount).toBe(500);
  });

  it("is idempotent", () => {
    const h = household([account({ id: "ret", kind: "retirementTaxable" })], []);
    h.accounts[0].deposits = [
      {
        id: "dep",
        label: "Contribution",
        amount: 500,
        frequency: "yearly",
        startYear: 2026,
        endYear: 2030,
      },
    ];
    const once = migrateHousehold(h);
    const twice = migrateHousehold(once);
    expect(twice.accounts[0].deposits).toEqual(once.accounts[0].deposits);
    expect(twice.accounts[0].deposits?.[0].endYear).toBe(2030);
  });
});

describe("migrateHousehold: joint after-tax accounts", () => {
  it("strips joint from a single-filer plan", () => {
    const h = household(
      [account({ id: "brokerage", kind: "investment", joint: true })],
      [],
    );
    const out = migrateHousehold(h);
    expect(out.accounts[0].joint).toBeUndefined();
  });

  it("strips joint from a retirement account even when MFJ", () => {
    const h = household(
      [account({ id: "ira", kind: "retirementTaxable", joint: true })],
      [],
    );
    h.filingStatus = "mfj";
    h.people = [
      ...h.people,
      { id: "p2", name: "Q", birthYear: 1962, retirementYear: 2028 },
    ];
    const out = migrateHousehold(h);
    expect(out.accounts[0].joint).toBeUndefined();
  });

  it("keeps joint on an after-tax account in an MFJ plan", () => {
    const h = household(
      [account({ id: "brokerage", kind: "investment", joint: true })],
      [],
    );
    h.filingStatus = "mfj";
    h.people = [
      ...h.people,
      { id: "p2", name: "Q", birthYear: 1962, retirementYear: 2028 },
    ];
    const out = migrateHousehold(h);
    expect(out.accounts[0].joint).toBe(true);
  });

  it("strips joint from a deleted account that cannot be joint", () => {
    const h = household([], []);
    h.deletedAccounts = [
      {
        item: account({ id: "ira", kind: "retirementTaxable", joint: true }),
        deletedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const out = migrateHousehold(h);
    expect(out.deletedAccounts?.[0].item.joint).toBeUndefined();
  });
});

describe("migrateHousehold: filing status", () => {
  it("heals an unrecognized filing status to single", () => {
    const h = household([], []);
    (h as { filingStatus: string }).filingStatus = "mfs";
    const out = migrateHousehold(h);
    expect(out.filingStatus).toBe("single");
  });

  it("keeps a stored hoh status", () => {
    const h = household([], []);
    h.filingStatus = "hoh";
    const out = migrateHousehold(migrateHousehold(h));
    expect(out.filingStatus).toBe("hoh");
  });
});

describe("migrateHousehold: rental passive-loss flags", () => {
  it("defaults missing activeParticipation to true and realEstateProfessional to false", () => {
    const h = household([], []);
    h.realEstate = [
      {
        id: "re1",
        label: "Rental",
        purchaseYear: 2010,
        purchasePrice: 300_000,
        marketValue: 400_000,
        appreciationRate: 0.03,
        depreciationYears: 27.5,
      },
    ];
    expect(h.realEstate[0]).not.toHaveProperty("activeParticipation");
    expect(h).not.toHaveProperty("realEstateProfessional");
    const out = migrateHousehold(h);
    expect(out.realEstate[0].activeParticipation).toBe(true);
    expect(out.realEstateProfessional).toBe(false);
  });

  it("preserves explicit flags and is idempotent", () => {
    const h = household([], []);
    h.realEstateProfessional = true;
    h.realEstate = [
      {
        id: "re1",
        label: "Rental",
        purchaseYear: 2010,
        purchasePrice: 300_000,
        marketValue: 400_000,
        appreciationRate: 0.03,
        depreciationYears: 27.5,
        activeParticipation: false,
      },
    ];
    const once = migrateHousehold(h);
    const twice = migrateHousehold(once);
    expect(twice.realEstateProfessional).toBe(true);
    expect(twice.realEstate[0].activeParticipation).toBe(false);
  });

  it("defaults activeParticipation on a deleted property", () => {
    const h = household([], []);
    h.deletedRealEstate = [
      {
        item: {
          id: "re-old",
          label: "Old rental",
          purchaseYear: 2000,
          purchasePrice: 200_000,
          marketValue: 250_000,
          appreciationRate: 0.03,
          depreciationYears: 27.5,
        },
        deletedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const out = migrateHousehold(h);
    expect(out.deletedRealEstate?.[0].item.activeParticipation).toBe(true);
  });
});

describe("migrateHousehold: allowOverConvertible default", () => {
  it("defaults missing allowOverConvertible to false", () => {
    const h = household([], []);
    expect(h.optimizer).not.toHaveProperty("allowOverConvertible");
    const out = migrateHousehold(h);
    expect(out.optimizer.allowOverConvertible).toBe(false);
  });

  it("preserves an explicit true value", () => {
    const h = household([], []);
    h.optimizer.allowOverConvertible = true;
    const out = migrateHousehold(h);
    expect(out.optimizer.allowOverConvertible).toBe(true);
  });
});

describe("migrateHousehold: conversion strategy", () => {
  it("defaults a missing optimizer to manual", () => {
    const h = household([], []);
    delete (h as { optimizer?: unknown }).optimizer;
    const out = migrateHousehold(h);
    expect(out.optimizer.strategy).toBe("manual");
    expect(out.optimizer.allowOverConvertible).toBe(false);
  });

  it("keeps manual with no schedule as manual", () => {
    const h = household([], []);
    h.optimizer = { strategy: "manual" };
    expect(migrateHousehold(h).optimizer.strategy).toBe("manual");
  });

  it("keeps an explicit manual schedule", () => {
    const h = household([], []);
    h.optimizer = { strategy: "manual", manualSchedule: [10_000, 20_000] };
    const out = migrateHousehold(h);
    expect(out.optimizer.strategy).toBe("manual");
    expect(out.optimizer.manualSchedule).toEqual([10_000, 20_000]);
  });

  it("falls back from an unknown strategy to manual", () => {
    const h = household([], []);
    h.optimizer = { strategy: "maxInheritance" as never };
    expect(migrateHousehold(h).optimizer.strategy).toBe("manual");
  });

  it("defaults a missing fill-bracket rate to 22%", () => {
    const h = household([], []);
    h.optimizer = { strategy: "fillBracket" };
    expect(migrateHousehold(h).optimizer.targetBracketRate).toBe(0.22);
  });
});

describe("migrateHousehold: retirement account type", () => {
  it("defaults a missing taxable-retirement type to DROP", () => {
    const h = household([account({ id: "ira", kind: "retirementTaxable" })], []);
    const out = migrateHousehold(h);
    expect(out.accounts[0].retirementType).toBe("drop");
  });

  it("keeps an explicit type", () => {
    const h = household(
      [account({ id: "ira", kind: "retirementTaxable", retirementType: "ira" })],
      [],
    );
    const out = migrateHousehold(h);
    expect(out.accounts[0].retirementType).toBe("ira");
  });

  it("rewrites an unknown type to DROP", () => {
    const h = household(
      [
        account({
          id: "ira",
          kind: "retirementTaxable",
          retirementType: "sep" as never,
        }),
      ],
      [],
    );
    const out = migrateHousehold(h);
    expect(out.accounts[0].retirementType).toBe("drop");
  });

  it("strips retirementType from a non-retirement account", () => {
    const h = household(
      [
        account({
          id: "brokerage",
          kind: "investment",
          retirementType: "ira",
        }),
      ],
      [],
    );
    const out = migrateHousehold(h);
    expect(out.accounts[0].retirementType).toBeUndefined();
  });

  it("heals deleted taxable-retirement accounts too", () => {
    const h = household([], []);
    h.deletedAccounts = [
      {
        item: account({ id: "old", kind: "retirementTaxable", label: "Old IRA" }),
        deletedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const out = migrateHousehold(h);
    expect(out.deletedAccounts?.[0].item.retirementType).toBe("drop");
  });

  it("is idempotent", () => {
    const h = household([account({ id: "ira", kind: "retirementTaxable" })], []);
    const once = migrateHousehold(h);
    const twice = migrateHousehold(once);
    expect(twice.accounts[0].retirementType).toBe("drop");
  });
});

describe("migrateHousehold: expense date range", () => {
  it("leaves open-ended expenses unchanged", () => {
    const h = household([], []);
    h.expenses = [
      {
        id: "living",
        label: "Living",
        amount: 3_000,
        frequency: "monthly",
        growthRate: 0.02,
      },
    ];
    const out = migrateHousehold(h);
    expect(out.expenses[0]).toEqual({
      id: "living",
      label: "Living",
      amount: 3_000,
      frequency: "monthly",
      growthRate: 0.02,
    });
    expect(out.expenses[0]).not.toHaveProperty("startYear");
    expect(out.expenses[0]).not.toHaveProperty("endYear");
  });

  it("keeps a valid from/to window", () => {
    const h = household([], []);
    h.expenses = [
      {
        id: "college",
        label: "College",
        amount: 2_000,
        frequency: "monthly",
        growthRate: 0,
        startYear: 2028,
        endYear: 2032,
      },
    ];
    const out = migrateHousehold(h);
    expect(out.expenses[0].startYear).toBe(2028);
    expect(out.expenses[0].endYear).toBe(2032);
  });

  it("strips non-finite start and end years", () => {
    const h = household([], []);
    h.expenses = [
      {
        id: "bad",
        label: "Bad",
        amount: 500,
        frequency: "monthly",
        growthRate: 0,
        startYear: Number.NaN,
        endYear: Number.POSITIVE_INFINITY,
      } as Expense,
    ];
    const out = migrateHousehold(h);
    expect(out.expenses[0]).not.toHaveProperty("startYear");
    expect(out.expenses[0]).not.toHaveProperty("endYear");
  });

  it("heals years on a deleted expense after wrapping legacy trash", () => {
    const h = household([], []);
    const bare = {
      id: "old",
      label: "Old",
      amount: 100,
      frequency: "monthly" as const,
      growthRate: 0,
      startYear: Number.NaN,
    };
    (h as { deletedExpenses: unknown }).deletedExpenses = [bare];
    const out = migrateHousehold(h);
    expect(out.deletedExpenses?.[0].item).not.toHaveProperty("startYear");
  });
});
