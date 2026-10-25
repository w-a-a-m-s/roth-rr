import { describe, expect, it } from "vitest";
import { indexedFederalTax } from "@/lib/engine/taxIndexing";
import type { Household } from "@/lib/domain/types";
import { buildConversionSchedule } from "@/lib/optimizer";
import { FALLBACK_FEDERAL_TAX } from "@/lib/config/federalTax";
import { FALLBACK_MEDICARE_PART_B } from "@/lib/config/medicare";
import { forFiling } from "@/lib/config/filingStatus";
import { projectScenario } from "@/lib/engine/project";
import { evenSchedule } from "@/lib/optimizer/strategies/even";
import {
  bracketFillCeiling,
  fillBracketSchedule,
} from "@/lib/optimizer/strategies/fillBracket";
import { immediateSchedule } from "@/lib/optimizer/strategies/immediate";
import {
  irmaaHeadroom,
  irmaaSchedule,
} from "@/lib/optimizer/strategies/irmaa";
import { depleteByRmdSchedule } from "@/lib/optimizer/strategies/depleteByRmd";
import {
  conversionYears,
  convertibleTotal,
  padToProjection,
  roundCents,
  spreadConversionEvenly,
} from "@/lib/optimizer/util";

function householdWithConvertible(balance: number): Household {
  return {
    filingStatus: "single",
    residenceState: "FL",
    people: [
      {
        id: "p1",
        name: "Pat",
        birthYear: 1960,
        retirementYear: 2026,
      },
    ],
    accounts: [
      {
        id: "ret",
        label: "IRA",
        ownerId: "p1",
        kind: "retirementTaxable",
        balance,
        growthRate: 0,
      },
    ],
    incomes: [],
    realEstate: [],
    expenses: [],
    assumptions: {
      expenseGrowth: 0,
      finalAge: 76,
    },
    optimizer: { strategy: "even" },
  };
}

describe("evenSchedule", () => {
  it("converts one level amount that empties the IRA by the window's end", () => {
    // No growth: $100k over the window's 9 years is $11,111.11 a year.
    const h = householdWithConvertible(100_000);
    const years = conversionYears(h);
    const schedule = evenSchedule(h);
    for (const amount of schedule.slice(0, years)) expect(amount).toBeCloseTo(100_000 / years, 1);
    expect(schedule.slice(years).every((v) => v === 0)).toBe(true);
    // With growth the level amount is higher, and still empties it on time.
    h.accounts[0].growthRate = 0.05;
    const grown = evenSchedule(h);
    const level = grown[0];
    expect(level).toBeGreaterThan(100_000 / years);
    for (const amount of grown.slice(0, years)) expect(amount).toBe(level);
    const rows = projectScenario(h, grown);
    expect(rows[years - 1].retirementTotal).toBeLessThan(1.01);
    expect(rows[years - 2].retirementTotal).toBeGreaterThan(level / 2);
  });

  it("honors convertAmount when set", () => {
    const h = householdWithConvertible(100_000);
    h.optimizer.convertAmount = 45_000;
    const years = conversionYears(h);
    expect(evenSchedule(h).slice(0, years)).toEqual(
      spreadConversionEvenly(45_000, years, 100_000),
    );
  });
});

describe("immediateSchedule", () => {
  it("puts the target in year 1 and zeros after", () => {
    const h = householdWithConvertible(100_000);
    const schedule = immediateSchedule(h);
    expect(schedule[0]).toBe(100_000);
    expect(schedule.slice(1).every((v) => v === 0)).toBe(true);
    expect(schedule.length).toBeGreaterThan(1);
  });
});

describe("fillBracketSchedule", () => {
  /** Each conversion year's taxable income and its 22% ceiling, with the schedule. */
  function filledYears(h: Household) {
    const schedule = fillBracketSchedule(h);
    const rows = projectScenario(h, schedule);
    return rows.slice(0, conversionYears(h)).map((row) => {
      // Each year's own brackets, indexed 2% a year from the 2026 table.
      const brackets = forFiling(
        indexedFederalTax(FALLBACK_FEDERAL_TAX, row.calendarYear, 0.02).brackets,
        "single",
        "federal brackets",
      );
      return {
        conversion: row.conversion,
        taxableIncome: row.taxableIncome,
        topRate: row.federalTaxByBracket.filter((b) => b.tax > 0).at(-1)?.rate,
        ceiling: bracketFillCeiling(brackets, 0.22),
      };
    });
  }

  it("fills each year up to the next bracket floor, past unused deductions", () => {
    const h = householdWithConvertible(2_000_000);
    h.optimizer.strategy = "fillBracket";
    h.optimizer.targetBracketRate = 0.22;
    for (const year of filledYears(h)) {
      expect(year.taxableIncome).toBeLessThan(year.ceiling);
      expect(year.taxableIncome).toBeGreaterThan(year.ceiling - 1);
      // With no other income the deductions take the first dollars, so the
      // conversion is more than the bracket's floor.
      expect(year.conversion).toBeGreaterThan(year.ceiling);
    }
  });

  it("never spills into the next bracket when the conversion phases out the senior deduction", () => {
    const h = householdWithConvertible(2_000_000);
    h.optimizer.strategy = "fillBracket";
    h.optimizer.targetBracketRate = 0.22;
    // $30k of pension: the no-conversion MAGI keeps the full $6,000 senior
    // deduction, and the conversion takes MAGI well past its phase-out.
    h.incomes = [
      {
        id: "pen",
        label: "Pension",
        ownerId: "p1",
        kind: "pension",
        monthlyAmount: 2_500,
        growthRate: 0,
        taxability: "full",
      },
    ];
    const zeros = projectScenario(h, padToProjection(h, []));
    expect(zeros[0].deductions.senior).toBe(6_000);
    for (const year of filledYears(h)) {
      expect(year.topRate).toBe(0.22);
      expect(year.taxableIncome).toBeLessThan(year.ceiling);
      expect(year.taxableIncome).toBeGreaterThan(year.ceiling - 1);
    }
  });

  it("converts nothing when income already exceeds the target bracket", () => {
    const h = householdWithConvertible(100_000);
    h.optimizer.strategy = "fillBracket";
    h.optimizer.targetBracketRate = 0.12;
    h.incomes = [
      {
        id: "pen",
        label: "Pension",
        ownerId: "p1",
        kind: "pension",
        monthlyAmount: 20_000,
        growthRate: 0,
        taxability: "full",
      },
    ];
    const schedule = fillBracketSchedule(h);
    expect(schedule.every((v) => v === 0)).toBe(true);
  });
});

describe("irmaaSchedule", () => {
  it("stays under the next IRMAA MAGI floor", () => {
    const h = householdWithConvertible(400_000);
    h.optimizer.strategy = "irmaa";
    const zeros = padToProjection(h, []);
    const rows = projectScenario(h, zeros);
    const tiers = forFiling(
      FALLBACK_MEDICARE_PART_B.tiers,
      "single",
      "medicare IRMAA tiers",
    );
    const years = conversionYears(h);
    const schedule = irmaaSchedule(h);
    for (let i = 0; i < years; i++) {
      const magi = rows[i].grossTaxableIncome + rows[i].capitalGainsIncome;
      const room = irmaaHeadroom(magi, tiers);
      const expected = Number.isFinite(room)
        ? roundCents(Math.max(0, room - 0.01))
        : convertibleTotal(h);
      expect(schedule[i]).toBe(expected);
    }
  });

  it("reports infinite headroom in the top IRMAA tier", () => {
    const tiers = forFiling(
      FALLBACK_MEDICARE_PART_B.tiers,
      "single",
      "medicare IRMAA tiers",
    );
    expect(irmaaHeadroom(1_000_000, tiers)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("depleteByRmdSchedule", () => {
  it("matches even dollars when growth is zero", () => {
    const h = householdWithConvertible(90_000);
    const years = conversionYears(h);
    const even = evenSchedule(h).slice(0, years);
    const deplete = depleteByRmdSchedule(h).slice(0, years);
    deplete.forEach((amount, i) => expect(amount).toBeCloseTo(even[i], 1));
  });

  it("converts remaining over years left after growth", () => {
    const h = householdWithConvertible(100_000);
    h.accounts[0].growthRate = 0.05;
    const schedule = depleteByRmdSchedule(h);
    const years = conversionYears(h);
    expect(schedule[0]).toBe(roundCents((100_000 * 1.05) / years));
    expect(schedule.slice(0, years).every((v) => v > 0)).toBe(true);
  });
});

describe("years before retirement are manual only", () => {
  // Projection starts two years before the only person retires.
  const early: Household = {
    filingStatus: "single",
    residenceState: "FL",
    people: [{ id: "p", name: "P", birthYear: 1968, retirementYear: 2030 }],
    accounts: [
      { id: "ira", label: "IRA", ownerId: "p", kind: "retirementTaxable", balance: 800_000, growthRate: 0.05 },
      { id: "roth", label: "Roth", ownerId: "p", kind: "rothTaxFree", balance: 0, growthRate: 0.05 },
    ],
    incomes: [
      { id: "sal", label: "Salary", ownerId: "p", kind: "salary", monthlyAmount: 6000, growthRate: 0, taxability: "full", endYear: 2029 },
    ],
    realEstate: [],
    expenses: [],
    assumptions: { expenseGrowth: 0.02, finalAge: 90, startYear: 2028 },
    optimizer: { strategy: "even" },
  } as Household;

  it("no strategy converts before the first retirement year", () => {
    const strategies = [
      "even",
      "immediate",
      "fillBracket",
      "irmaa",
      "depleteByRmd",
      "minTax",
    ] as const;
    for (const strategy of strategies) {
      const h = { ...early, optimizer: { strategy, targetBracketRate: 0.24 as const } };
      const schedule = buildConversionSchedule(h);
      expect(schedule.slice(0, 2), strategy).toEqual([0, 0]);
      expect(schedule.slice(2).some((v) => v > 0), strategy).toBe(true);
    }
  });

  it("the default even split starts at retirement", () => {
    const h: Household = { ...early, optimizer: { strategy: "manual" } };
    const schedule = buildConversionSchedule(h);
    expect(schedule.slice(0, 2)).toEqual([0, 0]);
    expect(schedule[2]).toBeGreaterThan(0);
  });

  it("a manual schedule keeps what the user typed before retirement", () => {
    const h: Household = {
      ...early,
      optimizer: { strategy: "manual", manualSchedule: [10_000, 20_000, 30_000] },
    };
    expect(buildConversionSchedule(h).slice(0, 3)).toEqual([10_000, 20_000, 30_000]);
  });
});

describe("typed pre-retirement conversions over the convertible total", () => {
  const early: Household = {
    filingStatus: "single",
    residenceState: "FL",
    people: [{ id: "p", name: "P", birthYear: 1968, retirementYear: 2030 }],
    accounts: [
      { id: "ira", label: "IRA", ownerId: "p", kind: "retirementTaxable", balance: 800_000, growthRate: 0.05 },
      { id: "roth", label: "Roth", ownerId: "p", kind: "rothTaxFree", balance: 0, growthRate: 0.05 },
    ],
    incomes: [],
    realEstate: [],
    expenses: [],
    // The plan starts in 2028; the strategy starts at retirement (2030).
    assumptions: { expenseGrowth: 0.02, finalAge: 90, startYear: 2028 },
    optimizer: { strategy: "even" },
  } as Household;
  const typed = [
    { year: 2027, amount: 300_000 },
    { year: 2028, amount: 200_000 },
  ];

  for (const strategy of ["even", "fillBracket", "irmaa", "depleteByRmd", "immediate"] as const) {
    it(`${strategy}: keeps the typed years and trims from the latest year`, () => {
      const plain: Household = {
        ...early,
        optimizer: { strategy, targetBracketRate: 0.24 },
      };
      const withTyped: Household = {
        ...plain,
        optimizer: { ...plain.optimizer, earlyConversions: typed },
      };
      const before = buildConversionSchedule(plain);
      const after = buildConversionSchedule(withTyped);
      // 2028 is index 0 of the plan; 2027 is before the plan starts.
      expect(after[0]).toBe(200_000);
      expect(after[1]).toBe(0);
      const convertible = convertibleTotal(withTyped);
      const total = 300_000 + after.reduce((sum, v) => sum + v, 0);
      expect(total).toBeLessThanOrEqual(convertible + 0.01);
      // Never above the strategy's own amount for a year (its limit).
      for (let i = 2; i < after.length; i++) {
        expect(after[i]).toBeLessThanOrEqual(before[i] + 0.001);
      }
      // Trimmed from the end: once a year is cut, every later year is 0.
      const firstCut = after.findIndex((v, i) => i >= 2 && v < before[i] - 0.001);
      if (firstCut >= 0) {
        expect(after.slice(firstCut + 1).every((v) => v === 0)).toBe(true);
      }
      // Even converts the whole convertible total, so it must be trimmed to
      // exactly fit.
      if (strategy === "even") {
        expect(firstCut).toBeGreaterThanOrEqual(2);
        expect(total).toBeCloseTo(convertible, 1);
      }
    });
  }

  it("leaves a manual schedule and over-convertible plans as entered", () => {
    const manual: Household = {
      ...early,
      optimizer: { strategy: "manual", manualSchedule: [0, 0, 900_000], earlyConversions: typed },
    };
    expect(buildConversionSchedule(manual).slice(0, 3)).toEqual([200_000, 0, 900_000]);
    const over: Household = {
      ...early,
      optimizer: { strategy: "even", allowOverConvertible: true, earlyConversions: typed },
    };
    const plainOver = buildConversionSchedule({ ...over, optimizer: { strategy: "even", allowOverConvertible: true } });
    expect(buildConversionSchedule(over).slice(2)).toEqual(plainOver.slice(2));
  });
});
