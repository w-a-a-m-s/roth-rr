import { describe, expect, it } from "vitest";
import {
  UNIFORM_LIFETIME_MAX_AGE,
  UNIFORM_LIFETIME_MIN_AGE,
  uniformLifetimeDenominator,
  uniformLifetimeRate,
} from "@/lib/config/rmdTable";

describe("uniformLifetimeDenominator", () => {
  it("matches the published Table III rows", () => {
    expect(uniformLifetimeDenominator(72)).toBe(27.4);
    expect(uniformLifetimeDenominator(73)).toBe(26.5);
    expect(uniformLifetimeDenominator(75)).toBe(24.6);
    expect(uniformLifetimeDenominator(85)).toBe(16.0);
    expect(uniformLifetimeDenominator(100)).toBe(6.4);
    expect(uniformLifetimeDenominator(119)).toBe(2.3);
  });

  it("covers every age from the first row to the last", () => {
    for (
      let age = UNIFORM_LIFETIME_MIN_AGE;
      age < UNIFORM_LIFETIME_MAX_AGE;
      age++
    ) {
      expect(uniformLifetimeDenominator(age)).toBeGreaterThan(0);
    }
  });

  it("shrinks the denominator as age rises, so the rate only grows", () => {
    for (
      let age = UNIFORM_LIFETIME_MIN_AGE;
      age < UNIFORM_LIFETIME_MAX_AGE;
      age++
    ) {
      expect(uniformLifetimeDenominator(age + 1)).toBeLessThan(
        uniformLifetimeDenominator(age),
      );
    }
  });

  it("uses the '120 and over' row at and past the last age", () => {
    expect(uniformLifetimeDenominator(120)).toBe(2.0);
    expect(uniformLifetimeDenominator(135)).toBe(2.0);
  });

  it("clamps ages below the table and non-finite ages", () => {
    expect(uniformLifetimeDenominator(70)).toBe(27.4);
    expect(uniformLifetimeDenominator(NaN)).toBe(2.0);
  });

  it("reproduces the worked example from Pub. 590-B", () => {
    // "You turn 75 years old in 2026. You use Table III. Your applicable
    // denominator is 24.6. Your required minimum distribution for 2026 would
    // be $4,065 ($100,000 / 24.6)."
    expect(100_000 / uniformLifetimeDenominator(75)).toBeCloseTo(4_065, 0);
  });
});

describe("uniformLifetimeRate", () => {
  it("is about 4.07% at age 75", () => {
    expect(uniformLifetimeRate(75)).toBeCloseTo(0.0407, 4);
  });
});
