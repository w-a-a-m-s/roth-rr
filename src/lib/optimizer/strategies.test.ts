import { describe, expect, it } from "vitest";
import type { Household } from "@/lib/domain/types";
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
  it("spreads the full convertible total across the window", () => {
    const h = householdWithConvertible(100_000);
    const years = conversionYears(h);
    expect(evenSchedule(h)).toEqual(
      padToProjection(
        h,
        spreadConversionEvenly(100_000, years, 100_000),
      ),
    );
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
  it("fills room up to the next bracket floor", () => {
    const h = householdWithConvertible(500_000);
    h.optimizer.strategy = "fillBracket";
    h.optimizer.targetBracketRate = 0.22;
    const zeros = padToProjection(h, []);
    const rows = projectScenario(h, zeros);
    const brackets = forFiling(
      FALLBACK_FEDERAL_TAX.brackets,
      "single",
      "federal brackets",
    );
    const ceiling = bracketFillCeiling(brackets, 0.22);
    const years = conversionYears(h);
    const schedule = fillBracketSchedule(h);
    for (let i = 0; i < years; i++) {
      expect(schedule[i]).toBe(
        roundCents(Math.max(0, ceiling - rows[i].taxableIncome - 0.01)),
      );
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
    expect(deplete).toEqual(even);
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
