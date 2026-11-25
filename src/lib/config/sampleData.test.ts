import { describe, expect, it } from "vitest";
import { createBlankHousehold } from "@/lib/config/sampleData";

describe("createBlankHousehold", () => {
  it("saves leftover money in a money market by default", () => {
    expect(createBlankHousehold().assumptions.leftoverInvestment).toBe("moneyMarket");
  });
});
