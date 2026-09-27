import { describe, expect, it } from "vitest";
import type { Household } from "@/lib/domain/types";
import {
  diagnoseConversionEmpty,
  isConversionEmpty,
} from "@/lib/engine/conversionEmpty";

function household(overrides: {
  birthYear?: number;
  retirementYear?: number;
  balance?: number;
  accounts?: Household["accounts"];
}): Household {
  return {
    filingStatus: "single",
    residenceState: "FL",
    people: [
      {
        id: "p1",
        name: "Pat",
        birthYear: overrides.birthYear ?? 1960,
        retirementYear: overrides.retirementYear ?? 2033,
      },
    ],
    accounts:
      overrides.accounts ??
      (overrides.balance === 0
        ? []
        : [
            {
              id: "ret",
              label: "IRA",
              ownerId: "p1",
              kind: "retirementTaxable",
              balance: overrides.balance ?? 100_000,
              growthRate: 0,
            },
          ]),
    incomes: [],
    realEstate: [],
    expenses: [],
    assumptions: {
      expenseGrowth: 0,
      finalAge: 85,
    },
    optimizer: { strategy: "manual" },
  };
}

describe("isConversionEmpty", () => {
  it("is false when there is a window and a balance", () => {
    expect(isConversionEmpty(household({}))).toBe(false);
  });

  it("is true when retirement is at or after RMD", () => {
    // Born 1960 → RMD age 75 → RMD year 2035. Retire 2035 → no window.
    expect(
      isConversionEmpty(household({ retirementYear: 2035 })),
    ).toBe(true);
  });

  it("is true when there are no taxable retirement accounts", () => {
    expect(isConversionEmpty(household({ balance: 0 }))).toBe(true);
  });
});

describe("diagnoseConversionEmpty", () => {
  it("includes retirement, RMD year, and account balance", () => {
    const d = diagnoseConversionEmpty(
      household({ retirementYear: 2035, accounts: [] }),
    );
    expect(d.empty).toBe(true);
    expect(d.facts.some((f) => f.detail.includes("Retires in 2035"))).toBe(
      true,
    );
    expect(d.facts.some((f) => f.detail.includes("RMD starts in 2035"))).toBe(
      true,
    );
    expect(
      d.facts.some((f) => f.detail.includes("No taxable retirement accounts")),
    ).toBe(true);
  });

  it("reports a usable window when balances are just zero", () => {
    const d = diagnoseConversionEmpty(
      household({
        accounts: [
          {
            id: "ret",
            label: "IRA",
            ownerId: "p1",
            kind: "retirementTaxable",
            balance: 0,
            growthRate: 0,
          },
        ],
      }),
    );
    expect(d.empty).toBe(true);
    expect(d.facts.some((f) => f.detail.includes("Can convert"))).toBe(true);
    expect(d.facts.some((f) => f.detail.includes("IRA $0.00"))).toBe(true);
  });
});
