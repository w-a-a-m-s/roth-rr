import { describe, expect, it } from "vitest";
import {
  personRmdAge,
  primaryRmdAge,
  rmdStartingAge,
} from "@/lib/domain/rmd";
import type { Household } from "@/lib/domain/types";

describe("rmdStartingAge", () => {
  it("returns 72 for birth years 1950 and earlier", () => {
    expect(rmdStartingAge(1950)).toBe(72);
    expect(rmdStartingAge(1945)).toBe(72);
  });

  it("returns 73 for birth years 1951-1959", () => {
    expect(rmdStartingAge(1951)).toBe(73);
    expect(rmdStartingAge(1959)).toBe(73);
  });

  it("returns 75 for birth years 1960 and later", () => {
    expect(rmdStartingAge(1960)).toBe(75);
    expect(rmdStartingAge(1971)).toBe(75);
  });
});

describe("personRmdAge", () => {
  it("returns undefined when birth year is missing", () => {
    expect(personRmdAge({ birthYear: undefined })).toBeUndefined();
    expect(personRmdAge(undefined)).toBeUndefined();
  });

  it("derives from birth year", () => {
    expect(personRmdAge({ birthYear: 1953 })).toBe(73);
    expect(personRmdAge({ birthYear: 1965 })).toBe(75);
  });
});

describe("primaryRmdAge", () => {
  const base = {
    filingStatus: "single" as const,
    residenceState: "FL" as const,
    accounts: [],
    incomes: [],
    realEstate: [],
    expenses: [],
    assumptions: { expenseGrowth: 0.02, finalAge: 85 },
    optimizer: { strategy: "manual" as const },
  };

  it("uses the main person when set", () => {
    const household: Household = {
      ...base,
      mainPersonId: "p2",
      people: [
        { id: "p1", name: "A", birthYear: 1955, retirementYear: 2026 },
        { id: "p2", name: "B", birthYear: 1962, retirementYear: 2028 },
      ],
    };
    expect(primaryRmdAge(household)).toBe(75);
  });

  it("falls back to the earliest retiree", () => {
    const household: Household = {
      ...base,
      people: [
        { id: "p1", name: "A", birthYear: 1955, retirementYear: 2030 },
        { id: "p2", name: "B", birthYear: 1962, retirementYear: 2026 },
      ],
    };
    expect(primaryRmdAge(household)).toBe(75);
  });
});
