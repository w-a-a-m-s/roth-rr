import { describe, expect, it } from "vitest";
import type { Household } from "@/lib/domain/types";
import { buildTimeline } from "@/lib/timeline";

function baseHousehold(overrides: Partial<Household> = {}): Household {
  return {
    filingStatus: "mfj",
    residenceState: "FL",
    people: [
      {
        id: "p1",
        name: "David",
        birthYear: 1965,
        retirementYear: 2030,
      },
      {
        id: "p2",
        name: "Batsheva",
        birthYear: 1967,
        retirementYear: 2032,
      },
    ],
    accounts: [],
    incomes: [],
    realEstate: [],
    expenses: [],
    assumptions: {
      expenseGrowth: 0.02,
      finalAge: 85,
    },
    optimizer: { strategy: "manual", manualSchedule: [] },
    ...overrides,
  };
}

describe("buildTimeline", () => {
  it("includes retirement, conversion window, Medicare, RMD, and projection end", () => {
    const timeline = buildTimeline(baseHousehold());
    const byYear = Object.fromEntries(timeline.map((e) => [e.year, e.label]));

    expect(byYear[2030]).toBe(
      "David retires · Roth conversion window opens · David - Medicare enrollment (65)",
    );
    expect(byYear[2032]).toBe(
      "Batsheva retires · Batsheva - Medicare enrollment (65)",
    );
    expect(byYear[2039]).toBe("Roth conversion window closes");
    expect(byYear[2040]).toBe("David reaches RMD age (75)");
    expect(byYear[2042]).toBe("Batsheva reaches RMD age (75)");
    expect(byYear[2050]).toBe("Projection ends - David turns 85");
  });

  it("merges same-year retirements into one label", () => {
    const timeline = buildTimeline(
      baseHousehold({
        people: [
          { id: "p1", name: "Maggie", birthYear: 1960, retirementYear: 2028 },
          { id: "p2", name: "Jorge", birthYear: 1962, retirementYear: 2028 },
        ],
      }),
    );
    const retirement = timeline.find((e) => e.year === 2028);
    expect(retirement?.label).toContain("Maggie & Jorge retire");
  });

  it("skips people missing birthYear or retirementYear where needed", () => {
    const timeline = buildTimeline(
      baseHousehold({
        people: [{ id: "p1", name: "Alex", retirementYear: 2035 }],
      }),
    );
    expect(timeline.some((e) => e.label.includes("Medicare"))).toBe(false);
    expect(timeline.some((e) => e.label.includes("RMD"))).toBe(false);
    expect(timeline.some((e) => e.label.includes("Alex retires"))).toBe(true);
  });
});
