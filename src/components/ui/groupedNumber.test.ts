import { describe, expect, it } from "vitest";
import { caretAfterGrouping, formatGrouped, groupTyped } from "./groupedNumber";

describe("groupTyped", () => {
  it("adds thousands separators as you type", () => {
    expect(groupTyped("1000")).toEqual({ text: "1,000", value: 1000 });
    expect(groupTyped("2000000")).toEqual({ text: "2,000,000", value: 2_000_000 });
    expect(groupTyped("1,0000")).toEqual({ text: "10,000", value: 10_000 });
  });

  it("ignores letters, signs and leading zeros", () => {
    expect(groupTyped("$1a2b3")).toEqual({ text: "123", value: 123 });
    expect(groupTyped("-500")).toEqual({ text: "500", value: 500 });
    expect(groupTyped("0005")).toEqual({ text: "5", value: 5 });
  });

  it("drops cents unless they're allowed, then keeps two places", () => {
    expect(groupTyped("1234.56")).toEqual({ text: "1,234", value: 1234 });
    expect(groupTyped("1234.567", 2)).toEqual({ text: "1,234.56", value: 1234.56 });
    expect(groupTyped("1234.", 2)).toEqual({ text: "1,234.", value: 1234 });
  });

  it("reads an empty field as no value", () => {
    expect(groupTyped("")).toEqual({ text: "", value: undefined });
    expect(groupTyped(",")).toEqual({ text: "", value: undefined });
  });
});

describe("formatGrouped", () => {
  it("shows a stored number with commas", () => {
    expect(formatGrouped(1000)).toBe("1,000");
    expect(formatGrouped(0)).toBe("0");
    expect(formatGrouped(1234.5, 2)).toBe("1,234.50");
    expect(formatGrouped(undefined)).toBe("");
  });
});

describe("caretAfterGrouping", () => {
  it("keeps the caret after the same digits when a comma appears", () => {
    // Typed the 4th digit at the end: "1000|" becomes "1,000|".
    expect(caretAfterGrouping("1000", 4, "1,000")).toBe(5);
    // Caret after the first digit of "1|0000" stays after that digit in "10,000".
    expect(caretAfterGrouping("10000", 1, "10,000")).toBe(1);
    expect(caretAfterGrouping("10000", 3, "10,000")).toBe(4);
  });
});
