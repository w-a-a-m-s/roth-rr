import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Household } from "@/lib/domain/types";
import { accountReturnSource } from "@/lib/engine/marketHistory";
import { useScenario } from "@/store/useScenario";

function household(): Household {
  return {
    filingStatus: "single",
    residenceState: "FL",
    people: [{ id: "p1", name: "Pat", birthYear: 1960, retirementYear: 2026 }],
    accounts: [
      { id: "ira", label: "IRA", ownerId: "p1", kind: "retirementTaxable", balance: 1, growthRate: 0.05, returnSource: "fixed" },
      { id: "ira2", label: "401(k)", ownerId: "p1", kind: "retirementTaxable", balance: 1, growthRate: 0.05, returnSource: "balanced" },
      { id: "roth", label: "Roth", ownerId: "p1", kind: "rothTaxFree", balance: 1, growthRate: 0.05, returnSource: "fixed" },
      { id: "brk", label: "Brokerage", ownerId: "p1", kind: "investment", balance: 1, growthRate: 0.05, costBasis: 0 },
    ],
    incomes: [],
    realEstate: [],
    expenses: [],
    assumptions: { expenseGrowth: 0.02, finalAge: 85 },
    optimizer: { strategy: "manual" },
  };
}

const active = () => useScenario.getState().configs[0].household;
const source = (id: string) =>
  accountReturnSource(active(), active().accounts.find((a) => a.id === id)!);

describe("Returns by account group", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    useScenario.setState({
      configs: [
        {
          id: "plan-1",
          name: "Test",
          createdAt: 0,
          updatedAt: 0,
          household: household(),
          role: "admin",
          isOwner: true,
          shareCount: 1,
        },
      ],
      activeId: "plan-1",
      loaded: true,
    });
  });

  it("sets one group and resets that group's accounts to follow it", () => {
    useScenario.getState().setReturnMode("retirement", "history");
    expect(active().assumptions.retirementReturnMode).toBe("history");
    expect(source("ira")).toBe("sp500");
    expect(source("ira2")).toBe("sp500");
    // Other groups keep their own choices.
    expect(source("roth")).toBe("fixed");
    expect(source("brk")).toBe("fixed");
  });

  it("lets an account changed afterwards keep its own returns", () => {
    const { setReturnMode, updateAccount } = useScenario.getState();
    setReturnMode("investment", "balanced");
    updateAccount("brk", { returnSource: "fixed" });
    expect(source("brk")).toBe("fixed");
    // Setting the group again replaces it.
    setReturnMode("investment", "history");
    expect(source("brk")).toBe("sp500");
  });

  it("clears the group's assumption on Fixed return", () => {
    const { setReturnMode } = useScenario.getState();
    setReturnMode("roth", "history");
    setReturnMode("roth", "fixed");
    expect(active().assumptions.rothReturnMode).toBeUndefined();
    expect(source("roth")).toBe("fixed");
  });
});

describe("Fixed return by account group", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    useScenario.setState({
      configs: [
        {
          id: "plan-1",
          name: "Test",
          createdAt: 0,
          updatedAt: 0,
          household: household(),
          role: "admin",
          isOwner: true,
          shareCount: 1,
        },
      ],
      activeId: "plan-1",
      loaded: true,
    });
  });

  const rate = (id: string) => active().accounts.find((a) => a.id === id)!.growthRate;

  it("writes the rate onto every account of the group and follows it", () => {
    useScenario.getState().setGroupFixedRate("retirement", 0.07);
    expect(active().assumptions.retirementFixedRate).toBe(0.07);
    expect(rate("ira")).toBe(0.07);
    expect(rate("ira2")).toBe(0.07);
    // The 50/50 tag on the 401(k) is cleared so the fixed rate applies.
    expect(source("ira2")).toBe("fixed");
    // Other groups keep their rates.
    expect(rate("roth")).toBe(0.05);
    expect(rate("brk")).toBe(0.05);
  });

  it("lets an account's rate changed afterwards keep its own", () => {
    const { setGroupFixedRate, updateAccount } = useScenario.getState();
    setGroupFixedRate("roth", 0.06);
    updateAccount("roth", { growthRate: 0.09 });
    expect(rate("roth")).toBe(0.09);
    // Setting the group again replaces it.
    setGroupFixedRate("roth", 0.04);
    expect(rate("roth")).toBe(0.04);
  });
});
