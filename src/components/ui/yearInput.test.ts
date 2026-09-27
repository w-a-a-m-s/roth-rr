import { describe, expect, it } from "vitest";
import {
  digitsOnly,
  parseYearInput,
  yearBounds,
  yearOutOfRangeMessage,
} from "./yearInput";

describe("digitsOnly", () => {
  it("strips everything that is not a digit and caps at four", () => {
    expect(digitsOnly("")).toBe("");
    expect(digitsOnly("19ab 9-0")).toBe("1990");
    expect(digitsOnly("e2026")).toBe("2026");
    expect(digitsOnly("20261")).toBe("2026");
  });
});

describe("yearBounds", () => {
  it("uses the same defaults the old year dropdown used", () => {
    expect(yearBounds(undefined, undefined, 2026)).toEqual({
      min: 1956,
      max: 2086,
    });
    expect(yearBounds(1930, 2026, 2026)).toEqual({ min: 1930, max: 2026 });
  });
});

describe("parseYearInput", () => {
  const min = 1930;
  const max = 2026;

  it("accepts a year in range", () => {
    expect(parseYearInput("1990", min, max, true)).toEqual({
      value: 1990,
      error: null,
    });
    expect(parseYearInput("1930", min, max, false)).toEqual({
      value: 1930,
      error: null,
    });
    expect(parseYearInput("2026", min, max, false)).toEqual({
      value: 2026,
      error: null,
    });
  });

  it("clears an optional empty field", () => {
    expect(parseYearInput("", min, max, true)).toEqual({
      value: undefined,
      error: null,
    });
    expect(parseYearInput("abc", min, max, true)).toEqual({
      value: undefined,
      error: null,
    });
  });

  it("rejects empty when the year is required", () => {
    expect(parseYearInput("", min, max, false)).toEqual({
      value: undefined,
      error: yearOutOfRangeMessage(min, max),
    });
  });

  it("rejects years outside the old dropdown min and max", () => {
    const error = yearOutOfRangeMessage(min, max);
    expect(parseYearInput("1929", min, max, true)).toEqual({
      value: undefined,
      error,
    });
    expect(parseYearInput("2027", min, max, false)).toEqual({
      value: undefined,
      error,
    });
    expect(parseYearInput("19", min, max, true)).toEqual({
      value: undefined,
      error,
    });
  });
});
