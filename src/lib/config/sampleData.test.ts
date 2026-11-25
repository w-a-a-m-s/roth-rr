import { describe, expect, it } from "vitest";
import { createBlankHousehold } from "@/lib/config/sampleData";

describe("createBlankHousehold", () => {
  it("saves leftover money in a money market by default", () => {
    expect(createBlankHousehold().assumptions.leftoverInvestment).toBe("moneyMarket");
  });

  it("counts the IRMAA surcharge on Medicare Part B as an expense", () => {
    expect(createBlankHousehold().includeMedicarePremiums).toBe(true);
    expect(createBlankHousehold().medicareExpense).toBe("irmaaOnly");
  });
});
