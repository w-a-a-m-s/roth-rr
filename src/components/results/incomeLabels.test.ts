import { describe, expect, it } from "vitest";
import type { Household } from "@/lib/domain/types";
import modernSample from "@/lib/engine/golden/cases/modern-sample.json";
import { hasCareCosts, incomeLabel, lifeProceedsLabel } from "./incomeLabels";

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

  it("names an event's account income by its analysis", () => {
    const h = withSs("Social Security");
    expect(incomeLabel(h, "draw:drop-s1")).toBe("Additional survivorship income · DROP (David)");
    expect(incomeLabel(h, "draw:drop-s1", { longTermCare: true })).toBe(
      "Supplemental LTC income · DROP (David)",
    );
    expect(incomeLabel(h, "draw:gone", { longTermCare: true })).toBe("Supplemental LTC income");
  });

  it("spots a Long-term care run by its care costs", () => {
    expect(hasCareCosts([{ expenseMonthly: { e1: 100 } }])).toBe(false);
    expect(hasCareCosts([{ expenseMonthly: { e1: 100 } }, { expenseMonthly: { "ltc:p1": 5000 } }])).toBe(true);
  });

  it("names insurance benefits by kind and policy (or the insured)", () => {
    const h: Household = {
      ...base,
      insurance: [
        { id: "l1", kind: "life", label: "", insuredId: "p1", policyType: "permanent", faceAmount: 1 },
        { id: "d1", kind: "disability", label: "Group LTD", insuredId: "p1", occupation: "own", monthlyBenefit: 1, waitingDays: 90, benefitPeriod: "age65" },
      ],
    };
    expect(incomeLabel(h, "life:l1")).toBe("Income from life insurance · David");
    expect(lifeProceedsLabel(h, "life:l1")).toBe("Life insurance proceeds · David");
    expect(incomeLabel(h, "di:d1")).toBe("Income from disability insurance · Group LTD");
    expect(incomeLabel(h, "ltci:gone")).toBe("Long-term care insurance");
  });
});
