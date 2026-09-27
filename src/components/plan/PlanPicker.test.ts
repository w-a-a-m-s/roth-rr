import { describe, expect, it } from "vitest";
import { plansForPicker } from "./PlanPicker";

const plans = [
  { id: "3", name: "something" },
  { id: "1", name: "Garcia workable" },
  { id: "4", name: "asd" },
  { id: "2", name: "Anide Horton" },
  { id: "5", name: "Regev Family" },
];

describe("plansForPicker", () => {
  it("sorts by name ascending, ignoring case", () => {
    expect(plansForPicker(plans, "").map((p) => p.name)).toEqual([
      "Anide Horton",
      "asd",
      "Garcia workable",
      "Regev Family",
      "something",
    ]);
  });

  it("orders numbered names numerically and breaks ties by id", () => {
    const numbered = [
      { id: "b", name: "Plan 10" },
      { id: "a", name: "Plan 2" },
      { id: "d", name: "Same" },
      { id: "c", name: "same" },
    ];
    expect(plansForPicker(numbered, "").map((p) => p.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("filters by a case-insensitive name substring and ignores surrounding spaces", () => {
    expect(plansForPicker(plans, "  GAR ").map((p) => p.name)).toEqual([
      "Garcia workable",
    ]);
    expect(plansForPicker(plans, "zzz")).toEqual([]);
  });
});
