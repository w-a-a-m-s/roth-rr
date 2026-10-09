import { describe, expect, it } from "vitest";
import type { Household } from "@/lib/domain/types";
import { conversionYears, convertibleTotal } from "@/lib/engine/convertible";

/** Two conversion years: retires at 73, RMD at 75 (born 1960). */
function baseHousehold(overrides?: {
  balance?: number;
  growthRate?: number;
  monthlyWithdrawal?: number;
}): Household {
  const balance = overrides?.balance ?? 100_000;
  const growthRate = overrides?.growthRate ?? 0.05;
  const monthlyWithdrawal = overrides?.monthlyWithdrawal ?? 0;
  return {
    filingStatus: "single",
    residenceState: "FL",
    people: [
      {
        id: "p1",
        name: "Pat",
        birthYear: 1960,
        retirementYear: 2033,
      },
    ],
    accounts: [
      {
        id: "ret",
        label: "IRA",
        ownerId: "p1",
        kind: "retirementTaxable",
        retirementType: "ira",
        balance,
        growthRate,
      },
    ],
    incomes:
      monthlyWithdrawal > 0
        ? [
            {
              id: "draw",
              label: "Retirement withdrawal",
              ownerId: "p1",
              kind: "retirementDraw",
              monthlyAmount: monthlyWithdrawal,
              growthRate: 0,
              taxability: "full",
              drawsFromAccountId: "ret",
            },
          ]
        : [],
    realEstate: [],
    expenses: [],
    assumptions: {
      expenseGrowth: 0,
      finalAge: 85,
    },
    optimizer: { strategy: "manual" },
  };
}

describe("conversionYears", () => {
  it("counts pre-RMD years from retirement", () => {
    // Ages 73 and 74 before RMD at 75.
    expect(conversionYears(baseHousehold())).toBe(2);
  });
});

describe("convertibleTotal", () => {
  it("equals the starting balance when growth and withdrawals are zero", () => {
    const h = baseHousehold({ growthRate: 0 });
    expect(convertibleTotal(h)).toBe(100_000);
  });

  it("adds yearly growth across the conversion window", () => {
    // Year 0: 100_000 * 1.05 = 105_000. Year 1: 105_000 * 1.05 = 110_250.
    const h = baseHousehold({ growthRate: 0.05 });
    expect(convertibleTotal(h)).toBe(110_250);
  });

  it("subtracts retirement withdrawals from the progressive total", () => {
    // Year 0: 100_000 * 1.05 - 12_000 = 93_000.
    // Year 1: 93_000 * 1.05 - 12_000 = 85_650.
    const h = baseHousehold({ growthRate: 0.05, monthlyWithdrawal: 1_000 });
    expect(convertibleTotal(h)).toBe(85_650);
  });

  it("excludes accounts whose owner is already at RMD at the start", () => {
    const h = baseHousehold({ balance: 50_000, growthRate: 0.05 });
    // Spouse already at RMD age 75 in 2033 (born 1958 → RMD 73, age 75).
    h.filingStatus = "mfj";
    h.people.push({
      id: "p2",
      name: "Sam",
      birthYear: 1958,
      retirementYear: 2033,
    });
    h.accounts.push({
      id: "ret2",
      label: "IRA (Sam)",
      ownerId: "p2",
      kind: "retirementTaxable",
      retirementType: "ira",
      balance: 200_000,
      growthRate: 0.05,
    });
    // Only Pat's account is convertible: 50_000 * 1.05^2 over 2 years.
    expect(convertibleTotal(h)).toBe(55_125);
  });

  it("grows a DROP from the retirement year", () => {
    const h = baseHousehold({ growthRate: 0.05 });
    h.accounts[0].retirementType = "drop";
    // The owner retires in 2033, so 2033 and 2034 both grow 5%.
    expect(convertibleTotal(h)).toBeCloseTo(110_250, 2);
  });

  it("compounds a plan-start balance from the as-of date to the plan start", () => {
    const h = baseHousehold({ growthRate: 0.05 });
    // 2032-01-01 leaves a full year before the 2033 start, then two more.
    expect(convertibleTotal(h, "2032-01-01")).toBeCloseTo(
      convertibleTotal(h) * 1.05,
      2,
    );
  });
});
