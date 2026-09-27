import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, Expense, IncomeSource, RealEstate } from "@/lib/domain/types";
import { useScenario } from "@/store/useScenario";
import { formatLocalDateHour, formatLocalDateTime } from "@/lib/format";

/**
 * Soft-delete only keeps items that existed on a previously persisted plan.
 * Tests seed that snapshot by hydrating a "server" plan id (non-local) and
 * stubbing a successful PUT so `rememberSavedIds` runs via flushSave — or by
 * calling the same path through a mocked fetch after an edit.
 *
 * Simpler approach: use a non-local plan id and poke the module's remembered
 * ids by successfully flushing once. We stub fetch for that.
 */

function baseHousehold() {
  return {
    filingStatus: "single" as const,
    people: [{ id: "p1", name: "Pat", birthYear: 1960, retirementYear: 2026 }],
    accounts: [
      {
        id: "acc-1",
        label: "IRA",
        ownerId: "p1",
        kind: "retirementTaxable" as const,
        balance: 100_000,
        growthRate: 0.05,
      },
    ],
    incomes: [
      {
        id: "inc-1",
        label: "Pension",
        ownerId: "p1",
        kind: "pension" as const,
        monthlyAmount: 2_000,
        growthRate: 0.02,
        taxability: "full" as const,
      },
    ],
    realEstate: [
      {
        id: "re-1",
        label: "Rental",
        purchaseYear: 2015,
        purchasePrice: 200_000,
        marketValue: 300_000,
        appreciationRate: 0.03,
        depreciationYears: 27.5,
      },
    ],
    expenses: [
      {
        id: "exp-1",
        label: "Groceries",
        amount: 800,
        frequency: "monthly" as const,
        growthRate: 0.02,
      },
    ],
    deletedPeople: [],
    deletedAccounts: [],
    deletedIncomes: [],
    deletedRealEstate: [],
    deletedExpenses: [],
    assumptions: {
      expenseGrowth: 0.02,
      finalAge: 85,
    },
    optimizer: { strategy: "manual" as const },
  };
}

async function resetStoreAsSavedPlan() {
  const household = baseHousehold();
  useScenario.setState({
    configs: [
      {
        id: "plan-saved-1",
        name: "Test",
        createdAt: 0,
        updatedAt: 0,
        household,
        role: "admin",
        isOwner: true,
        shareCount: 1,
      },
    ],
    activeId: "plan-saved-1",
    auth: { status: "authenticated", userId: "u1", impersonating: false },
    loaded: true,
  });

  // Successful autosave records the live ids as "previously saved".
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
  );
  // Trigger flushSave via a no-op rename (schedules save) — wait for debounce.
  useScenario.getState().renameConfig("plan-saved-1", "Test");
  // rename schedules save; call flush by waiting past AUTOSAVE_MS (800).
  // Faster: patch an assumption which also schedules save, then advance timers.
  vi.useFakeTimers();
  useScenario.getState().setAssumptions({ expenseGrowth: 0.02 });
  await vi.advanceTimersByTimeAsync(900);
  vi.useRealTimers();
}

describe("soft-delete and restore", () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    await resetStoreAsSavedPlan();
  });

  it("moves a previously-saved account to deletedAccounts with UTC deletedAt", () => {
    const before = Date.now();
    const { removeAccount } = useScenario.getState();
    removeAccount("acc-1");

    const h = useScenario.getState().configs[0].household;
    expect(h.accounts).toHaveLength(0);
    expect(h.deletedAccounts).toHaveLength(1);
    const entry = h.deletedAccounts![0];
    expect(entry.item.label).toBe("IRA");
    expect(entry.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(entry.deletedAt).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("hard-deletes never-saved draft items (no restore entry)", () => {
    const { addAccount, removeAccount } = useScenario.getState();
    addAccount({
      id: "acc-draft",
      label: "Draft",
      ownerId: "p1",
      kind: "savings",
      balance: 0,
      growthRate: 0.01,
    });
    removeAccount("acc-draft");

    const h = useScenario.getState().configs[0].household;
    expect(h.accounts.find((a) => a.id === "acc-draft")).toBeUndefined();
    expect(
      (h.deletedAccounts ?? []).some((e) => e.item.id === "acc-draft"),
    ).toBe(false);
  });

  it("restores a trash entry back onto the live list", () => {
    const { removeAccount, restoreAccount } = useScenario.getState();
    removeAccount("acc-1");
    restoreAccount("acc-1");

    const h = useScenario.getState().configs[0].household;
    expect(h.accounts).toHaveLength(1);
    expect(h.accounts[0].id).toBe("acc-1");
    expect(h.deletedAccounts).toHaveLength(0);
  });

  it("moves income, real estate, and expenses through trash", () => {
    const {
      removeIncome,
      restoreIncome,
      removeRealEstate,
      restoreRealEstate,
      removeExpense,
      restoreExpense,
    } = useScenario.getState();

    removeIncome("inc-1");
    removeRealEstate("re-1");
    removeExpense("exp-1");

    let h = useScenario.getState().configs[0].household;
    expect(h.incomes).toHaveLength(0);
    expect(h.realEstate).toHaveLength(0);
    expect(h.expenses).toHaveLength(0);
    expect((h.deletedIncomes![0].item as IncomeSource).id).toBe("inc-1");
    expect((h.deletedRealEstate![0].item as RealEstate).id).toBe("re-1");
    expect((h.deletedExpenses![0].item as Expense).id).toBe("exp-1");

    restoreIncome("inc-1");
    restoreRealEstate("re-1");
    restoreExpense("exp-1");

    h = useScenario.getState().configs[0].household;
    expect(h.incomes.map((i) => i.id)).toEqual(["inc-1"]);
    expect(h.realEstate.map((r) => r.id)).toEqual(["re-1"]);
    expect(h.expenses.map((e) => e.id)).toEqual(["exp-1"]);
    expect(h.deletedIncomes).toHaveLength(0);
    expect(h.deletedRealEstate).toHaveLength(0);
    expect(h.deletedExpenses).toHaveLength(0);
  });

  it("preserves the full item payload across delete/restore", () => {
    const { removeAccount, restoreAccount } = useScenario.getState();
    removeAccount("acc-1");
    restoreAccount("acc-1");
    const acc = useScenario.getState().configs[0].household.accounts[0] as Account;
    expect(acc).toMatchObject({
      id: "acc-1",
      label: "IRA",
      balance: 100_000,
      growthRate: 0.05,
      kind: "retirementTaxable",
    });
  });

  it("permanently discards a trash item without restoring it", () => {
    const { removeAccount, discardDeletedAccount } = useScenario.getState();
    removeAccount("acc-1");
    discardDeletedAccount("acc-1");

    const h = useScenario.getState().configs[0].household;
    expect(h.accounts).toHaveLength(0);
    expect(h.deletedAccounts).toHaveLength(0);
  });

  it("soft-deletes a previously-saved person and restores them when room exists", async () => {
    // Seed an MFJ plan with two saved people.
    const household = {
      ...baseHousehold(),
      filingStatus: "mfj" as const,
      people: [
        { id: "p1", name: "Pat", birthYear: 1960, retirementYear: 2026 },
        { id: "p2", name: "Sam", birthYear: 1962, retirementYear: 2028 },
      ],
    };
    useScenario.setState({
      configs: [
        {
          id: "plan-saved-1",
          name: "Test",
          createdAt: 0,
          updatedAt: 0,
          household,
          role: "admin",
          isOwner: true,
          shareCount: 1,
        },
      ],
      activeId: "plan-saved-1",
      auth: { status: "authenticated", userId: "u1", impersonating: false },
      loaded: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    vi.useFakeTimers();
    useScenario.getState().setAssumptions({ expenseGrowth: 0.02 });
    await vi.advanceTimersByTimeAsync(900);
    vi.useRealTimers();

    const { removePerson, restorePerson } = useScenario.getState();
    removePerson("p2");

    let h = useScenario.getState().configs[0].household;
    expect(h.people.map((p) => p.id)).toEqual(["p1"]);
    expect(h.deletedPeople).toHaveLength(1);
    expect(h.deletedPeople![0].item.name).toBe("Sam");

    restorePerson("p2");
    h = useScenario.getState().configs[0].household;
    expect(h.people.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(h.deletedPeople).toHaveLength(0);
  });

  it("soft-deletes a spouse dropped by switching to single filing", async () => {
    const household = {
      ...baseHousehold(),
      filingStatus: "mfj" as const,
      people: [
        { id: "p1", name: "Pat", birthYear: 1960, retirementYear: 2026 },
        { id: "p2", name: "Sam", birthYear: 1962, retirementYear: 2028 },
      ],
    };
    useScenario.setState({
      configs: [
        {
          id: "plan-saved-1",
          name: "Test",
          createdAt: 0,
          updatedAt: 0,
          household,
          role: "admin",
          isOwner: true,
          shareCount: 1,
        },
      ],
      activeId: "plan-saved-1",
      auth: { status: "authenticated", userId: "u1", impersonating: false },
      loaded: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    vi.useFakeTimers();
    useScenario.getState().setAssumptions({ expenseGrowth: 0.02 });
    await vi.advanceTimersByTimeAsync(900);
    vi.useRealTimers();

    useScenario.getState().setFilingStatus("single");
    const h = useScenario.getState().configs[0].household;
    expect(h.people.map((p) => p.id)).toEqual(["p1"]);
    expect(h.deletedPeople![0].item.id).toBe("p2");
  });

  it("soft-deletes a spouse dropped by switching to head of household", async () => {
    const household = {
      ...baseHousehold(),
      filingStatus: "mfj" as const,
      people: [
        { id: "p1", name: "Pat", birthYear: 1960, retirementYear: 2026 },
        { id: "p2", name: "Sam", birthYear: 1962, retirementYear: 2028 },
      ],
    };
    useScenario.setState({
      configs: [
        {
          id: "plan-saved-1",
          name: "Test",
          createdAt: 0,
          updatedAt: 0,
          household,
          role: "admin",
          isOwner: true,
          shareCount: 1,
        },
      ],
      activeId: "plan-saved-1",
      auth: { status: "authenticated", userId: "u1", impersonating: false },
      loaded: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    vi.useFakeTimers();
    useScenario.getState().setAssumptions({ expenseGrowth: 0.02 });
    await vi.advanceTimersByTimeAsync(900);
    vi.useRealTimers();

    useScenario.getState().setFilingStatus("hoh");
    const h = useScenario.getState().configs[0].household;
    expect(h.filingStatus).toBe("hoh");
    expect(h.people.map((p) => p.id)).toEqual(["p1"]);
    expect(h.deletedPeople![0].item.id).toBe("p2");
  });
});

describe("formatLocalDateTime", () => {
  it("formats an ISO UTC timestamp in local time like 'June 5th 4:34pm'", () => {
    // Construct a local Date for June 5 4:34pm, then format its ISO form.
    const local = new Date(2026, 5, 5, 16, 34, 0); // month is 0-indexed
    expect(formatLocalDateTime(local.toISOString())).toBe("June 5th 4:34pm");
  });
});

describe("formatLocalDateHour", () => {
  it("formats like 'July 20th, 8pm'", () => {
    const local = new Date(2026, 6, 20, 20, 12, 0); // month is 0-indexed
    expect(formatLocalDateHour(local.toISOString())).toBe("July 20th, 8pm");
  });
});
