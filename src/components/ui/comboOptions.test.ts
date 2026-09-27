import { describe, expect, it } from "vitest";
import { filterComboOptions } from "./comboOptions";

describe("filterComboOptions", () => {
  const options = ["Groceries", "Gas/Transportation", "Entertainment"];

  it("returns nothing for an empty or whitespace query", () => {
    expect(filterComboOptions(options, "")).toEqual([]);
    expect(filterComboOptions(options, "   ")).toEqual([]);
  });

  it("matches case-insensitively by substring", () => {
    expect(filterComboOptions(options, "gro")).toEqual(["Groceries"]);
    expect(filterComboOptions(options, "GAS")).toEqual(["Gas/Transportation"]);
    expect(filterComboOptions(options, "tain")).toEqual(["Entertainment"]);
  });
});
