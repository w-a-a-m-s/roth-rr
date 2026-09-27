import { describe, expect, it } from "vitest";
import { isPlanNameTaken, normalizePlanName } from "@/lib/planName";

describe("normalizePlanName", () => {
  it("trims and lowercases", () => {
    expect(normalizePlanName("  Garcia Family  ")).toBe("garcia family");
  });
});

describe("isPlanNameTaken", () => {
  const configs = [
    { id: "a", name: "Garcia family" },
    { id: "b", name: "Retirement" },
  ];

  it("returns false for an unused name", () => {
    expect(isPlanNameTaken(configs, "New plan")).toBe(false);
  });

  it("detects an exact match", () => {
    expect(isPlanNameTaken(configs, "Retirement")).toBe(true);
  });

  it("is case-insensitive and ignores surrounding whitespace", () => {
    expect(isPlanNameTaken(configs, "  garcia FAMILY ")).toBe(true);
  });

  it("ignores the excluded plan id (rename to same name)", () => {
    expect(isPlanNameTaken(configs, "Garcia family", "a")).toBe(false);
  });

  it("still flags a collision when excluding a different plan", () => {
    expect(isPlanNameTaken(configs, "Garcia family", "b")).toBe(true);
  });

  it("returns false for empty / whitespace names", () => {
    expect(isPlanNameTaken(configs, "   ")).toBe(false);
  });
});
