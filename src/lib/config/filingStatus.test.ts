import { describe, expect, it } from "vitest";
import { forFiling, type FilingTable } from "@/lib/config/filingStatus";

describe("forFiling", () => {
  it("returns the status's own key when present", () => {
    const table: FilingTable<number> = { single: 1, mfj: 2, hoh: 3 };
    expect(forFiling(table, "hoh")).toBe(3);
    expect(forFiling(table, "single")).toBe(1);
    expect(forFiling(table, "mfj")).toBe(2);
  });

  it("aliases hoh to single when hoh is omitted", () => {
    const table: FilingTable<number> = { single: 10, mfj: 20 };
    expect(forFiling(table, "hoh")).toBe(10);
  });

  it("throws when neither the status nor its fallback exists", () => {
    const table = { mfj: 2 } as FilingTable<number>;
    expect(() => forFiling(table, "hoh", "medicare IRMAA tiers")).toThrow(
      /medicare IRMAA tiers: no hoh entry \(and no single fallback\)/,
    );
  });
});
