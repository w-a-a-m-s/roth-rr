import { describe, expect, it } from "vitest";
import type { Household } from "@/lib/domain/types";
import modernSample from "@/lib/engine/golden/cases/modern-sample.json";
import { incomeLabel } from "./incomeLabels";

const base = modernSample.household as unknown as Household;
const withSs = (label: string): Household => ({
  ...base,
  incomes: [
    { id: "ss", label, ownerId: "p1", kind: "socialSecurity", monthlyAmount: 1, growthRate: 0, taxability: "full" },
    { id: "pen", label: "Pension", ownerId: "p1", kind: "pension", monthlyAmount: 1, growthRate: 0, taxability: "full" },
  ],
});

describe("incomeLabel", () => {
  it("adds the owner's name to Social Security", () => {
    expect(incomeLabel(withSs("Social Security"), "ss")).toBe("Social Security · David");
  });

  it("doesn't repeat a name the label already has", () => {
    expect(incomeLabel(withSs("Social Security (David)"), "ss")).toBe("Social Security (David)");
  });

  it("leaves other incomes, RMDs and real estate as they were", () => {
    const h = withSs("Social Security");
    expect(incomeLabel(h, "pen")).toBe("Pension");
    expect(incomeLabel(h, "rmd:drop-s1")).toBe("RMD · DROP (David)");
    expect(incomeLabel(h, "nope")).toBe("nope");
  });
});
