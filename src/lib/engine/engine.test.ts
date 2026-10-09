import { describe, it, expect } from "vitest";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";
import { SAMPLE_HOUSEHOLD } from "@/lib/config/sampleData";
import { primaryRmdAge } from "@/lib/domain/rmd";
import {
  primaryPersonId,
  projectScenario,
  projectionYears,
  projectionStartYear,
} from "@/lib/engine/project";
import type { Deposit, Household } from "@/lib/domain/types";
import { afterTaxAssets, runScenario } from "@/lib/engine/runScenario";
import {
  capitalGainsTaxByBracket,
  capitalGainsTaxStacked,
  progressiveTax,
  progressiveTaxByBracket,
} from "@/lib/engine/tax";
import { manualSchedule } from "@/lib/optimizer/strategies/manual";
import {
  FALLBACK_FEDERAL_TAX,
  RENTAL_LOSS_SPECIAL_ALLOWANCE,
} from "@/lib/config/federalTax";

const zeros = (n: number) => new Array(n).fill(0);

describe("progressive tax (MFJ brackets)", () => {
  const brackets = FALLBACK_FEDERAL_TAX.brackets.mfj;

  it("matches the spreadsheet's first-year taxable income within rounding", () => {
    // Spreadsheet taxable income (std deduction only) = 263,920.
    // Standard progressive math = 48,536.80; the spreadsheet's off-by-one
    // bracket bounds give 48,536.22. They agree to well under a dollar.
    expect(progressiveTax(263_920, brackets)).toBeCloseTo(48_536.8, 1);
  });

  it("is zero for non-positive income", () => {
    expect(progressiveTax(0, brackets)).toBe(0);
    expect(progressiveTax(-1000, brackets)).toBe(0);
  });
});

describe("head of household federal tax", () => {
  it("applies the HOH standard deduction and brackets", () => {
    const household: Household = {
      filingStatus: "hoh",
      residenceState: "FL",
      people: [
        { id: "p1", name: "Pat", birthYear: 1970, retirementYear: 2026 },
      ],
      accounts: [],
      incomes: [
        {
          id: "pen",
          label: "Pension",
          ownerId: "p1",
          kind: "pension",
          monthlyAmount: 10_000,
          growthRate: 0,
          taxability: "full",
        },
      ],
      realEstate: [],
      expenses: [],
      assumptions: { expenseGrowth: 0, finalAge: 57 },
      optimizer: { strategy: "manual", manualSchedule: [0] },
    };
    const rows = projectScenario(household, zeros(projectionYears(household)));
    expect(rows[0].deductions.standard).toBe(
      FALLBACK_FEDERAL_TAX.standardDeduction.hoh,
    );
    const taxable = 120_000 - FALLBACK_FEDERAL_TAX.standardDeduction.hoh;
    expect(rows[0].taxableIncome).toBeCloseTo(taxable, 2);
    expect(rows[0].federalOrdinaryTax).toBeCloseTo(
      progressiveTax(taxable, FALLBACK_FEDERAL_TAX.brackets.hoh),
      2,
    );
  });
});

describe("per-bracket tax breakdown", () => {
  const brackets = FALLBACK_FEDERAL_TAX.brackets.mfj;

  it("splits tax across brackets and sums to progressiveTax", () => {
    // Taxable income 70,596 (the Margarita sheet's year-1 figure) fills the 10%
    // bracket (0-24,800) and part of the 12% bracket.
    const byBracket = progressiveTaxByBracket(70_596, brackets);
    expect(byBracket).toHaveLength(brackets.length);
    expect(byBracket[0]).toBeCloseTo(24_800 * 0.1, 2); // 2,480
    expect(byBracket[1]).toBeCloseTo((70_596 - 24_800) * 0.12, 2); // 5,495.52
    expect(byBracket.slice(2).every((t) => t === 0)).toBe(true);
    expect(byBracket.reduce((s, t) => s + t, 0)).toBeCloseTo(
      progressiveTax(70_596, brackets),
      6,
    );
  });

  it("returns all-zero entries for non-positive income", () => {
    expect(progressiveTaxByBracket(0, brackets)).toEqual(brackets.map(() => 0));
    expect(progressiveTaxByBracket(-5, brackets)).toEqual(brackets.map(() => 0));
  });

  it("projection rows expose federalTaxByBracket that sums to federalOrdinaryTax", () => {
    const rows = projectScenario(SAMPLE_HOUSEHOLD, zeros(projectionYears(SAMPLE_HOUSEHOLD)));
    for (const row of rows) {
      const sum = row.federalTaxByBracket.reduce((s, b) => s + b.tax, 0);
      expect(sum).toBeCloseTo(row.federalOrdinaryTax, 4);
      const brackets = row.federalTaxByBracket;
      brackets.forEach((b, i) => {
        expect(b.ceiling).toBe(brackets[i + 1]?.floor ?? null);
        if (b.ceiling == null) return;
        expect(b.tax).toBeLessThanOrEqual((b.ceiling - b.floor) * b.rate + 1e-6);
      });
      expect(row.annualTax).toBeCloseTo(
        row.federalAnnualTax + row.stateAnnualTax,
        4,
      );
    }
  });
});

describe("capital gains tax by bracket", () => {
  const ltcg = FALLBACK_FEDERAL_TAX.longTermCapitalGains.mfj;

  it("sums to capitalGainsTaxStacked and is zero when there are no gains", () => {
    const ordinary = 87_800;
    const gains = 94_577;
    const byBracket = capitalGainsTaxByBracket(ordinary, gains, ltcg);
    expect(byBracket).toHaveLength(ltcg.length);
    expect(byBracket.reduce((s, t) => s + t, 0)).toBeCloseTo(
      capitalGainsTaxStacked(ordinary, gains, ltcg),
      6,
    );
    expect(capitalGainsTaxByBracket(ordinary, 0, ltcg)).toEqual(ltcg.map(() => 0));
  });
});

describe("state income tax and capital gains", () => {
  it("Florida residence yields $0 state tax on ordinary income", () => {
    const h = structuredClone(SAMPLE_HOUSEHOLD);
    h.residenceState = "FL";
    const rows = projectScenario(h, zeros(projectionYears(h)));
    expect(rows[0].stateAnnualTax).toBe(0);
    expect(rows[0].federalAnnualTax).toBeGreaterThan(0);
    expect(rows[0].stateGrossTaxableIncome).toBe(0);
    expect(rows[0].stateDeductions.total).toBe(0);
    expect(rows[0].stateTaxableIncome).toBe(0);
  });

  it("California residence taxes ordinary income at state rates", () => {
    const h = structuredClone(SAMPLE_HOUSEHOLD);
    h.residenceState = "CA";
    const rows = projectScenario(h, zeros(projectionYears(h)));
    expect(rows[0].stateAnnualTax).toBeGreaterThan(0);
    expect(rows[0].annualTax).toBeGreaterThan(rows[0].federalAnnualTax);
    expect(rows[0].stateDeductions.standard).toBe(11_080);
    expect(rows[0].stateDeductions.personalExemption).toBe(0);
    expect(rows[0].stateDeductions.total).toBe(11_080);
    expect(rows[0].stateTaxableIncome).toBeCloseTo(
      Math.max(0, rows[0].stateGrossTaxableIncome - rows[0].stateDeductions.total),
      4,
    );
  });

  it("Alabama residence exposes standard deduction and personal exemption", () => {
    const h = structuredClone(SAMPLE_HOUSEHOLD);
    h.residenceState = "AL";
    const rows = projectScenario(h, zeros(projectionYears(h)));
    expect(rows[0].stateDeductions.standard).toBe(8_500);
    expect(rows[0].stateDeductions.personalExemption).toBe(3_000);
    expect(rows[0].stateDeductions.total).toBe(11_500);
    expect(rows[0].stateTaxableIncome).toBeCloseTo(
      Math.max(0, rows[0].stateGrossTaxableIncome - 11_500),
      4,
    );
    expect(rows[0].stateAnnualTax).toBeGreaterThan(0);
  });

  it("after-tax withdrawal realizes proportional capital gains", () => {
    const h = structuredClone(SAMPLE_HOUSEHOLD);
    h.residenceState = "FL";
    h.accounts = [
      {
        id: "brk",
        label: "Brokerage",
        ownerId: "p1",
        kind: "investment",
        balance: 200_000,
        costBasis: 100_000,
        growthRate: 0,
      },
    ];
    h.incomes = [
      {
        id: "wd",
        label: "Brokerage draw",
        ownerId: "p1",
        kind: "afterTaxWithdrawal",
        monthlyAmount: 10_000 / 12,
        growthRate: 0,
        taxability: "taxFree",
        drawsFromAccountId: "brk",
      },
    ];
    h.realEstate = [];
    h.expenses = [];
    const rows = projectScenario(h, zeros(projectionYears(h)));
    // $10k withdrawal from 50% basis → $5k gain; with no ordinary income the
    // gain sits entirely in the federal 0% LTCG bracket for MFJ.
    expect(rows[0].capitalGainsIncome).toBeCloseTo(5_000, 2);
    expect(rows[0].federalCapitalGainsTax).toBe(0);
    expect(rows[0].stateAnnualTax).toBe(0);

    // Push ordinary income above the 0% LTCG ceiling so gains are taxed at 15%.
    h.incomes.push({
      id: "pension",
      label: "Pension",
      ownerId: "p1",
      kind: "pension",
      monthlyAmount: 20_000,
      growthRate: 0,
      taxability: "full",
    });
    const rows2 = projectScenario(h, zeros(projectionYears(h)));
    expect(rows2[0].capitalGainsIncome).toBeCloseTo(5_000, 2);
    expect(rows2[0].federalCapitalGainsTax).toBeCloseTo(5_000 * 0.15, 0);
    // Gains are not ordinary income; they stack on the LTCG schedule instead.
    expect(rows2[0].grossTaxableIncome).toBeCloseTo(20_000 * 12, 2);
  });

  it("grows the after-tax account before withdrawing, then taxes the gain as LTCG", () => {
    // $2M @ 8.8% earns $176k; a $175k withdrawal should leave the account
    // about $1k higher, not shrink it. Cost basis $1M, so only the embedded
    // gain (not the returned basis) is taxable, at long-term rates stacked
    // on ordinary income.
    const h: Household = {
      filingStatus: "mfj",
      residenceState: "FL",
      people: [
        {
          id: "p1",
          name: "Pat",
          birthYear: 1966,
          retirementYear: 2028,
        },
      ],
      accounts: [
        {
          id: "brk",
          label: "After tax investments",
          ownerId: "p1",
          kind: "investment",
          balance: 2_000_000,
          costBasis: 1_000_000,
          growthRate: 0.088,
        },
      ],
      incomes: [
        {
          id: "wd",
          label: "Income from after tax account",
          ownerId: "p1",
          kind: "afterTaxWithdrawal",
          monthlyAmount: 175_000 / 12,
          growthRate: 0,
          taxability: "taxFree",
          drawsFromAccountId: "brk",
        },
        {
          id: "pension",
          label: "Pension",
          ownerId: "p1",
          kind: "pension",
          monthlyAmount: 10_000,
          growthRate: 0,
          taxability: "full",
        },
      ],
      realEstate: [],
      expenses: [],
      assumptions: { expenseGrowth: 0, finalAge: 70 },
      optimizer: { strategy: "manual", manualSchedule: [0, 0, 0] },
    };
    const rows = projectScenario(h, zeros(projectionYears(h)));
    const grown = 2_000_000 * 1.088;
    const withdraw = 175_000;
    expect(rows[0].balances.brk).toBeCloseTo(grown - withdraw, 2);
    expect(rows[0].afterTaxTotal).toBeCloseTo(2_001_000, 2);

    const gainFrac = 1 - 1_000_000 / grown;
    const gains = withdraw * gainFrac;
    expect(rows[0].capitalGainsIncome).toBeCloseTo(gains, 2);
    expect(rows[0].grossTaxableIncome).toBeCloseTo(120_000, 2);

    const ordinaryTaxable = Math.max(0, 120_000 - rows[0].deductions.total);
    expect(rows[0].taxableIncome).toBeCloseTo(ordinaryTaxable, 2);
    expect(rows[0].federalCapitalGainsTax).toBeCloseTo(
      capitalGainsTaxStacked(
        ordinaryTaxable,
        gains,
        FALLBACK_FEDERAL_TAX.longTermCapitalGains.mfj,
      ),
      2,
    );
    expect(rows[0].federalCapitalGainsTax).toBeGreaterThan(0);
    const ltcgByBracket = rows[0].federalCapitalGainsTaxByBracket;
    expect(ltcgByBracket.reduce((s, b) => s + b.tax, 0)).toBeCloseTo(
      rows[0].federalCapitalGainsTax,
      4,
    );
    // Ordinary income already fills the 0% LTCG room, so the tax sits in 15%.
    const tax15 = ltcgByBracket.find((b) => b.rate === 0.15)?.tax ?? 0;
    expect(tax15).toBeCloseTo(rows[0].federalCapitalGainsTax, 4);
    expect(ltcgByBracket.find((b) => b.rate === 0)?.tax ?? 0).toBe(0);
    expect(ltcgByBracket.find((b) => b.rate === 0.2)?.tax ?? 0).toBe(0);
  });
});

describe("baseline projection vs spreadsheet", () => {
  const household = SAMPLE_HOUSEHOLD;
  const n = projectionYears(household);
  const rows = projectScenario(household, zeros(n));

  it("runs for 21 years (age 65 to 85)", () => {
    expect(n).toBe(21);
  });

  it("year 1 gross taxable income = 295,920 (Regular!E35)", () => {
    expect(rows[0].grossTaxableIncome).toBeCloseTo(295_920, 2);
  });

  it("year 1 total monthly income = 26,600 (Regular!E33)", () => {
    expect(rows[0].totalMonthlyIncome).toBeCloseTo(26_600, 2);
  });

  it("DROP (David) waits until the year after he retires to grow", () => {
    // 2030 (retirement): no growth, then the $12k draw.
    expect(rows[0].balances["drop-s1"]).toBeCloseTo(1_088_000, 2);
    // 2031: first 5%, then draw.
    expect(rows[1].balances["drop-s1"]).toBeCloseTo(1_130_400, 2);
  });

  it("DROP (Batsheva) stays flat until the year after she retires", () => {
    // Plan starts 2030; she retires 2032. First growth is 2033.
    expect(rows[0].balances["drop-s2"]).toBeCloseTo(300_000, 2);
    expect(rows[1].balances["drop-s2"]).toBeCloseTo(300_000, 2);
    expect(rows[2].balances["drop-s2"]).toBeCloseTo(300_000, 2);
    expect(rows[3].balances["drop-s2"]).toBeCloseTo(315_000, 2);
  });

  it("Roth (Batsheva) compounds at 8% each year, including year 0", () => {
    expect(rows[0].balances["roth-s2"]).toBeCloseTo(16_200, 2);
    expect(rows[1].balances["roth-s2"]).toBeCloseTo(17_496, 2);
  });

  it("real-estate depreciation = purchasePrice / 27.5 (Regular!E38)", () => {
    expect(rows[0].deductions.depreciation).toBeCloseTo(300_000 / 27.5, 2);
  });

  it("standard deduction = 32,200 (2026 federal MFJ)", () => {
    // The sheet used 32,000; we apply the accurate 2026 IRS figure (32,200).
    expect(rows[0].deductions.standard).toBe(32_200);
  });

  it("salary stops the year the owner retires", () => {
    // Batsheva's salary is present in 2030/2031, gone from 2032 on.
    const incomeWithSalary = rows[0].totalMonthlyIncome;
    const incomeNoSalary = rows[2].totalMonthlyIncome;
    expect(incomeWithSalary).toBeGreaterThan(incomeNoSalary);
  });
});

describe("real estate", () => {
  const household = SAMPLE_HOUSEHOLD;
  const n = projectionYears(household);

  it("appreciates market value at the global rate (3%/yr default)", () => {
    const rows = projectScenario(household, zeros(n));
    expect(rows[0].realEstateValue).toBeCloseTo(1_000_000, 2);
    expect(rows[1].realEstateValue).toBeCloseTo(1_030_000, 2);
  });

  it("counts full equity when there is no mortgage", () => {
    const rows = projectScenario(household, zeros(n));
    expect(rows[0].mortgageBalance).toBe(0);
    expect(rows[0].realEstateEquity).toBeCloseTo(rows[0].realEstateValue, 2);
  });

  it("depreciates purchasePrice/years only within purchaseYear + years, then zero", () => {
    // Per spec: deduction = purchasePrice / depreciationYears, applied from the
    // purchase year for `depreciationYears` years; after that it drops to zero.
    const rows = projectScenario(household, zeros(n));
    const re = household.realEstate[0];
    for (const r of rows) {
      const yearsOwned = r.calendarYear - re.purchaseYear;
      const within = yearsOwned >= 0 && yearsOwned < re.depreciationYears;
      expect(r.deductions.depreciation).toBeCloseTo(
        within ? re.purchasePrice / re.depreciationYears : 0,
        2,
      );
    }
    // The sample plan straddles the boundary, so both sides are exercised.
    expect(rows.some((r) => r.deductions.depreciation > 0)).toBe(true);
    expect(rows.some((r) => r.deductions.depreciation === 0)).toBe(true);
  });

  it("does not depreciate before the purchase year", () => {
    const future = structuredClone(household);
    const start = projectionStartYear(future);
    future.realEstate = [
      {
        ...future.realEstate[0],
        purchaseYear: start + 3,
        purchasePrice: 275_000,
        depreciationYears: 27.5,
      },
    ];
    const rows = projectScenario(future, zeros(n));
    expect(rows[0].deductions.depreciation).toBe(0);
    expect(rows[1].deductions.depreciation).toBe(0);
    expect(rows[2].deductions.depreciation).toBe(0);
    expect(rows[3].deductions.depreciation).toBeCloseTo(275_000 / 27.5, 2);
  });

  it("tolerates an account missing growthRate without NaN-poisoning", () => {
    // Imported / half-filled plans may omit the now-required growthRate. A bad
    // account must not turn the whole projection into NaN (regression: a $0
    // retirement account with no growthRate broke every year after the first).
    const h = structuredClone(household);
    const bad = { ...h.accounts[0], id: "acc-bad", balance: 0 } as Record<
      string,
      unknown
    >;
    delete bad.growthRate;
    h.accounts.push(bad as unknown as (typeof h.accounts)[number]);
    const rows = projectScenario(h, zeros(projectionYears(h)));
    for (const r of rows) {
      expect(Number.isFinite(r.grossTaxableIncome)).toBe(true);
      expect(Number.isFinite(r.annualTax)).toBe(true);
      expect(Number.isFinite(r.retirementTotal)).toBe(true);
    }
  });

  it("structured rent preserves the year-1 net (~1,400/mo)", () => {
    // 4,000 rent - 2,600 expenses = 1,400/mo, matching the old net income line.
    const rows = projectScenario(household, zeros(n));
    expect(rows[0].totalMonthlyIncome).toBeCloseTo(26_600, 2);
  });

  it("amortizes a mortgage: balance falls and equity rises", () => {
    const h = structuredClone(household);
    h.realEstate[0].mortgageBalance = 200_000;
    h.realEstate[0].mortgageRate = 0.06;
    h.realEstate[0].mortgageMonthlyPayment = 2_000;
    const rows = projectScenario(h, zeros(projectionYears(h)));
    expect(rows[0].mortgageBalance).toBeLessThan(200_000);
    expect(rows[1].mortgageBalance).toBeLessThan(rows[0].mortgageBalance);
    expect(rows[0].realEstateEquity).toBeCloseTo(
      rows[0].realEstateValue - rows[0].mortgageBalance,
      2,
    );
  });
});

function palHousehold(opts: {
  monthlyRent?: number;
  monthlyOperatingExpenses?: number;
  purchasePrice?: number;
  depreciationYears?: number;
  purchaseYear?: number;
  monthlyOtherIncome?: number;
  activeParticipation?: boolean;
  realEstateProfessional?: boolean;
  realEstate?: Household["realEstate"];
  years?: number;
}): Household {
  const years = opts.years ?? 3;
  return {
    filingStatus: "single",
    residenceState: "FL",
    people: [
      { id: "p1", name: "Pat", birthYear: 1976, retirementYear: 2026 },
    ],
    accounts: [],
    incomes: [
      {
        id: "pen",
        label: "Pension",
        ownerId: "p1",
        kind: "pension",
        monthlyAmount: opts.monthlyOtherIncome ?? 20_000,
        growthRate: 0,
        taxability: "full",
      },
    ],
    realEstate:
      opts.realEstate ??
      [
        {
          id: "re1",
          label: "Rental",
          purchaseYear: opts.purchaseYear ?? 2026,
          purchasePrice: opts.purchasePrice ?? 200_000,
          marketValue: 200_000,
          appreciationRate: 0,
          depreciationYears: opts.depreciationYears ?? 10,
          monthlyRent: opts.monthlyRent ?? 1_000,
          monthlyOperatingExpenses: opts.monthlyOperatingExpenses ?? 0,
          rentGrowthRate: 0,
          activeParticipation: opts.activeParticipation,
        },
      ],
    expenses: [],
    assumptions: { expenseGrowth: 0, finalAge: 50 + years - 1 },
    optimizer: { strategy: "manual" },
    realEstateProfessional: opts.realEstateProfessional,
  };
}

describe("rental passive activity loss", () => {
  it("uses full depreciation when it is at or under rental net, even at high MAGI", () => {
    // Rent $16,800, dep $10,000: leftover is income, so no PAL limit.
    const h = palHousehold({
      monthlyRent: 1_400,
      purchasePrice: 100_000,
      depreciationYears: 10,
      monthlyOtherIncome: 20_000,
    });
    const rows = projectScenario(h, zeros(projectionYears(h)));
    expect(rows[0].deductions.depreciation).toBeCloseTo(10_000, 2);
    expect(rows[0].rentalLossCarryforward).toBeCloseTo(0, 2);
  });

  it("caps depreciation at rental net when MAGI is above $150k and carries the rest", () => {
    // Rent $12,000, dep $50,000: $38,000 leftover loss, high MAGI, no allowance.
    const h = palHousehold({
      monthlyRent: 1_000,
      purchasePrice: 500_000,
      depreciationYears: 10,
      monthlyOtherIncome: 20_000,
    });
    const rows = projectScenario(h, zeros(projectionYears(h)));
    expect(rows[0].deductions.depreciation).toBeCloseTo(12_000, 2);
    expect(rows[0].rentalLossCarryforward).toBeCloseTo(38_000, 2);
    expect(rows[0].rentalLossCarryforwardById.re1).toBeCloseTo(38_000, 2);
    const otherOrdinary = 20_000 * 12;
    expect(rows[0].grossTaxableIncome).toBeCloseTo(otherOrdinary + 12_000, 2);
  });

  it("lets up to $25k of leftover loss offset other income when MAGI is $100k or less", () => {
    const h = palHousehold({
      monthlyRent: 1_000,
      purchasePrice: 500_000,
      depreciationYears: 10,
      monthlyOtherIncome: 80_000 / 12,
    });
    const rows = projectScenario(h, zeros(projectionYears(h)));
    expect(rows[0].deductions.depreciation).toBeCloseTo(
      12_000 + RENTAL_LOSS_SPECIAL_ALLOWANCE,
      2,
    );
    expect(rows[0].rentalLossCarryforward).toBeCloseTo(
      38_000 - RENTAL_LOSS_SPECIAL_ALLOWANCE,
      2,
    );
  });

  it("phases the $25k allowance out by 50 cents per MAGI dollar from $100k to $150k", () => {
    // MAGI $120k → allowance $15,000.
    const h = palHousehold({
      monthlyRent: 1_000,
      purchasePrice: 500_000,
      depreciationYears: 10,
      monthlyOtherIncome: 120_000 / 12,
    });
    const rows = projectScenario(h, zeros(projectionYears(h)));
    expect(rows[0].deductions.depreciation).toBeCloseTo(12_000 + 15_000, 2);
    expect(rows[0].rentalLossCarryforward).toBeCloseTo(38_000 - 15_000, 2);
  });

  it("allows the full leftover loss for a real estate professional", () => {
    const h = palHousehold({
      monthlyRent: 1_000,
      purchasePrice: 500_000,
      depreciationYears: 10,
      monthlyOtherIncome: 20_000,
      realEstateProfessional: true,
    });
    const rows = projectScenario(h, zeros(projectionYears(h)));
    expect(rows[0].deductions.depreciation).toBeCloseTo(50_000, 2);
    expect(rows[0].rentalLossCarryforward).toBeCloseTo(0, 2);
    const otherOrdinary = 20_000 * 12;
    expect(rows[0].grossTaxableIncome).toBeCloseTo(otherOrdinary + 12_000, 2);
    expect(rows[0].taxableIncome).toBeCloseTo(
      Math.max(
        0,
        otherOrdinary + 12_000 - rows[0].deductions.standard - 50_000,
      ),
      2,
    );
  });

  it("cannot use the $25k allowance without active participation", () => {
    const h = palHousehold({
      monthlyRent: 1_000,
      purchasePrice: 500_000,
      depreciationYears: 10,
      monthlyOtherIncome: 80_000 / 12,
      activeParticipation: false,
    });
    const rows = projectScenario(h, zeros(projectionYears(h)));
    expect(rows[0].deductions.depreciation).toBeCloseTo(12_000, 2);
    expect(rows[0].rentalLossCarryforward).toBeCloseTo(38_000, 2);
  });

  it("lets one property's rental gain absorb another property's loss before the allowance", () => {
    const h = palHousehold({
      monthlyOtherIncome: 20_000,
      realEstate: [
        {
          id: "gain",
          label: "Gain",
          purchaseYear: 2026,
          purchasePrice: 50_000,
          marketValue: 200_000,
          appreciationRate: 0,
          depreciationYears: 10,
          monthlyRent: 2_500,
          monthlyOperatingExpenses: 0,
          rentGrowthRate: 0,
          activeParticipation: true,
        },
        {
          id: "loss",
          label: "Loss",
          purchaseYear: 2026,
          purchasePrice: 200_000,
          marketValue: 200_000,
          appreciationRate: 0,
          depreciationYears: 10,
          monthlyRent: 500,
          monthlyOperatingExpenses: 0,
          rentGrowthRate: 0,
          activeParticipation: true,
        },
      ],
    });
    // Gain: 30,000 - 5,000 = +25,000. Loss: 6,000 - 20,000 = -14,000.
    // Net leftover is +11,000 income; no carryforward.
    const rows = projectScenario(h, zeros(projectionYears(h)));
    expect(rows[0].deductions.depreciation).toBeCloseTo(25_000, 2);
    expect(rows[0].rentalLossCarryforward).toBeCloseTo(0, 2);
    expect(rows[0].grossTaxableIncome).toBeCloseTo(20_000 * 12 + 36_000, 2);
  });

  it("uses prior-year carryforward when a later year has spare rental net", () => {
    const h = palHousehold({
      monthlyRent: 1_000,
      purchasePrice: 200_000,
      depreciationYears: 1,
      purchaseYear: 2026,
      monthlyOtherIncome: 20_000,
      years: 3,
    });
    const rows = projectScenario(h, zeros(projectionYears(h)));
    // Year 0: rent 12,000, dep 200,000 → leftover 188,000, all suspended.
    expect(rows[0].deductions.depreciation).toBeCloseTo(12_000, 2);
    expect(rows[0].rentalLossCarryforward).toBeCloseTo(188_000, 2);
    // Year 1: no more dep; 12,000 net absorbs 12,000 of the carryforward.
    expect(rows[1].deductions.depreciation).toBeCloseTo(12_000, 2);
    expect(rows[1].rentalLossCarryforward).toBeCloseTo(176_000, 2);
  });

  it("does not depreciate a property with no rent", () => {
    const h = palHousehold({
      monthlyRent: 0,
      purchasePrice: 300_000,
      depreciationYears: 27.5,
      monthlyOtherIncome: 20_000,
    });
    const rows = projectScenario(h, zeros(projectionYears(h)));
    expect(rows[0].deductions.depreciation).toBe(0);
    expect(rows[0].rentalLossCarryforward).toBe(0);
    expect(rows[0].grossTaxableIncome).toBeCloseTo(20_000 * 12, 2);
  });
});

describe("itemized expenses", () => {
  it("sums per-item monthly equivalents and grows each by its own rate", () => {
    const h = structuredClone(SAMPLE_HOUSEHOLD);
    h.expenses = [
      { id: "m", label: "Monthly line", amount: 1_000, frequency: "monthly", growthRate: 0.1 },
      { id: "y", label: "Yearly line", amount: 12_000, frequency: "yearly", growthRate: 0 },
    ];
    const rows = projectScenario(h, zeros(projectionYears(h)));
    // Year 0: 1,000 (monthly) + 12,000/12 (yearly) = 2,000.
    expect(rows[0].monthlyExpenses).toBeCloseTo(2_000, 2);
    expect(rows[0].expenseMonthly).toEqual({ m: 1_000, y: 1_000 });
    // Year 1: 1,000 * 1.1 (grows) + 1,000 (flat) = 2,100.
    expect(rows[1].monthlyExpenses).toBeCloseTo(2_100, 2);
    expect(rows[1].expenseMonthly.m).toBeCloseTo(1_100, 2);
    expect(rows[1].expenseMonthly.y).toBeCloseTo(1_000, 2);
  });

  it("treats an empty expense list as zero spending", () => {
    const h = structuredClone(SAMPLE_HOUSEHOLD);
    h.expenses = [];
    const rows = projectScenario(h, zeros(projectionYears(h)));
    expect(rows[0].monthlyExpenses).toBe(0);
    expect(rows[0].expenseMonthly).toEqual({});
  });

  it("applies an expense only inside its start/end years", () => {
    const h = structuredClone(SAMPLE_HOUSEHOLD);
    const start = projectionStartYear(h);
    h.expenses = [
      {
        id: "bridge",
        label: "Bridge",
        amount: 1_000,
        frequency: "monthly",
        growthRate: 0.1,
        startYear: start + 2,
        endYear: start + 3,
      },
    ];
    const rows = projectScenario(h, zeros(projectionYears(h)));
    expect(rows[0].expenseMonthly.bridge).toBe(0);
    expect(rows[1].expenseMonthly.bridge).toBe(0);
    // Amount is the start-year spend, not grown from year 0.
    expect(rows[2].expenseMonthly.bridge).toBe(1_000);
    expect(rows[3].expenseMonthly.bridge).toBeCloseTo(1_100, 2);
    expect(rows[4].expenseMonthly.bridge).toBe(0);
    expect(rows[0].monthlyExpenses).toBe(0);
    expect(rows[2].monthlyExpenses).toBe(1_000);
  });

  it("grows an end-dated expense from the first projection year", () => {
    const h = structuredClone(SAMPLE_HOUSEHOLD);
    const start = projectionStartYear(h);
    h.expenses = [
      {
        id: "early",
        label: "Early",
        amount: 1_200,
        frequency: "yearly",
        growthRate: 0,
        endYear: start,
      },
    ];
    const rows = projectScenario(h, zeros(projectionYears(h)));
    expect(rows[0].expenseMonthly.early).toBe(100);
    expect(rows[1].expenseMonthly.early).toBe(0);
  });
});

describe("income date range", () => {
  it("uses the entered amount in the start year, not grown from year 0", () => {
    const h = structuredClone(SAMPLE_HOUSEHOLD);
    const start = projectionStartYear(h);
    h.incomes = [
      {
        id: "ss",
        label: "Social Security",
        ownerId: h.people[0].id,
        kind: "socialSecurity",
        monthlyAmount: 2_000,
        growthRate: 0.1,
        taxability: "full",
        startYear: start + 2,
        endYear: start + 3,
      },
    ];
    const rows = projectScenario(h, zeros(projectionYears(h)));
    expect(rows[0].incomeMonthly.ss ?? 0).toBe(0);
    expect(rows[1].incomeMonthly.ss ?? 0).toBe(0);
    expect(rows[2].incomeMonthly.ss).toBe(2_000);
    expect(rows[3].incomeMonthly.ss).toBeCloseTo(2_200, 2);
    expect(rows[4].incomeMonthly.ss ?? 0).toBe(0);
  });
});

describe("income and asset breakdowns", () => {
  it("itemizes monthly income sources that sum to totalMonthlyIncome", () => {
    const rows = projectScenario(SAMPLE_HOUSEHOLD, zeros(projectionYears(SAMPLE_HOUSEHOLD)));
    const row = rows[0];
    const sum = Object.values(row.incomeMonthly).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(row.totalMonthlyIncome, 6);
    // Sample plan has a discretionary retirement draw and rental cash flow.
    expect(row.incomeMonthly.discretionary).toBeCloseTo(1_000, 2);
    expect(row.incomeMonthly["re:re-investment"]).toBeDefined();
  });

  it("itemizes real-estate equity per property", () => {
    const rows = projectScenario(SAMPLE_HOUSEHOLD, zeros(projectionYears(SAMPLE_HOUSEHOLD)));
    const row = rows[0];
    const sum = Object.values(row.realEstateEquityById).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(row.realEstateEquity, 6);
  });
});

describe("withdrawal income requires a valid source account", () => {
  const baseN = projectionYears(SAMPLE_HOUSEHOLD);
  const baseRows = projectScenario(SAMPLE_HOUSEHOLD, zeros(baseN));

  it("ignores a retirementDraw with no drawsFromAccountId (no phantom income)", () => {
    const h = structuredClone(SAMPLE_HOUSEHOLD);
    h.incomes.push({
      id: "orphan",
      label: "Orphan draw",
      ownerId: h.people[0].id,
      kind: "retirementDraw",
      monthlyAmount: 1000,
      growthRate: 0,
      taxability: "full",
    });
    const rows = projectScenario(h, zeros(projectionYears(h)));
    // The orphan income must not add taxable income, cash flow, or touch any
    // balance - the projection is identical to the plan without it.
    expect(rows[0].grossTaxableIncome).toBeCloseTo(
      baseRows[0].grossTaxableIncome,
      2,
    );
    expect(rows[0].totalMonthlyIncome).toBeCloseTo(
      baseRows[0].totalMonthlyIncome,
      2,
    );
    for (const acc of h.accounts) {
      expect(rows[0].balances[acc.id]).toBeCloseTo(
        baseRows[0].balances[acc.id],
        2,
      );
    }
  });

  it("ignores a sourceless rothWithdrawal (no phantom cash flow)", () => {
    const h = structuredClone(SAMPLE_HOUSEHOLD);
    h.incomes.push({
      id: "orphan-roth",
      label: "Orphan Roth draw",
      ownerId: h.people[0].id,
      kind: "rothWithdrawal",
      monthlyAmount: 2000,
      growthRate: 0,
      taxability: "taxFree",
    });
    const rows = projectScenario(h, zeros(projectionYears(h)));
    expect(rows[0].totalMonthlyIncome).toBeCloseTo(
      baseRows[0].totalMonthlyIncome,
      2,
    );
  });

  it("counts and depletes once a valid source account is linked", () => {
    const h = structuredClone(SAMPLE_HOUSEHOLD);
    const ret = h.accounts.find((a) => a.kind === "retirementTaxable");
    if (!ret) throw new Error("expected a retirementTaxable account in sample");
    h.incomes.push({
      id: "linked",
      label: "Linked draw",
      ownerId: ret.ownerId,
      kind: "retirementDraw",
      monthlyAmount: 1000,
      growthRate: 0,
      taxability: "full",
      drawsFromAccountId: ret.id,
    });
    const rows = projectScenario(h, zeros(projectionYears(h)));
    // +12,000/yr taxable income and a matching reduction in the source balance.
    expect(rows[0].grossTaxableIncome).toBeCloseTo(
      baseRows[0].grossTaxableIncome + 12_000,
      2,
    );
    expect(rows[0].balances[ret.id]).toBeCloseTo(
      baseRows[0].balances[ret.id] - 12_000,
      2,
    );
  });
});

describe("roth scenario with the spreadsheet's manual schedule", () => {
  const household = SAMPLE_HOUSEHOLD;
  const schedule = manualSchedule(household);
  const rows = projectScenario(household, schedule);

  it("converts 150,000 in year 1 (Roth!E18)", () => {
    expect(rows[0].conversion).toBeCloseTo(150_000, 2);
  });

  it("DROP (David) is reduced by draw + conversion with no year-0 growth", () => {
    // 1,100,000 - 12,000 - 150,000 = 938,000.
    expect(rows[0].balances["drop-s1"]).toBeCloseTo(938_000, 2);
  });

  it("Roth (David) receives the conversion after growth", () => {
    // 30,000 * 1.08 + 150,000 = 182,400.
    expect(rows[0].balances["roth-s1"]).toBeCloseTo(182_400, 2);
  });

  it("conversion adds to taxable income (Roth!E36)", () => {
    // Gross taxable = 295,920 baseline + 150,000 conversion = 445,920.
    expect(rows[0].grossTaxableIncome).toBeCloseTo(445_920, 2);
  });

  it("never converts more than is available", () => {
    for (const row of rows) {
      for (const acc of household.accounts) {
        expect(row.balances[acc.id]).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("RMDs deplete tax-deferred balances", () => {
  it("reduces the retirement account each year once the owner hits RMD age", () => {
    // $100k IRA, no scheduled draw, 0% growth, RMDs from age 73 (born 1953).
    // With no growth the balance must fall by exactly the Uniform Lifetime
    // share for each year's age: 1/26.5 at 73, 1/25.5 at 74, and so on.
    const household = {
      filingStatus: "single" as const,
      residenceState: "FL" as const,
      people: [
        {
          id: "p1",
          name: "Pat",
          birthYear: 1953,
          retirementYear: 2026,
        },
      ],
      accounts: [
        {
          id: "ret",
          label: "IRA",
          ownerId: "p1",
          kind: "retirementTaxable" as const,
          balance: 100_000,
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
      optimizer: {
        strategy: "manual" as const,
        manualSchedule: [0, 0, 0, 0],
      },
    };
    const rows = projectScenario(household, zeros(projectionYears(household)));
    // 2026: age 73 → first RMD year. $100k / 26.5 = $3,773.58 withdrawn.
    const rmd0 = 100_000 / 26.5;
    const bal0 = 100_000 - rmd0;
    expect(rows[0].ages.p1).toBe(73);
    expect(rows[0].balances.ret).toBeCloseTo(bal0, 2);
    expect(rows[0].incomeMonthly["rmd:ret"]).toBeCloseTo(rmd0 / 12, 6);
    expect(rows[0].grossTaxableIncome).toBeCloseTo(rmd0, 2);
    // Each later year divides the prior year-end balance by that age's
    // denominator, so the withdrawn share grows as the owner ages.
    const bal1 = bal0 - bal0 / 25.5;
    const bal2 = bal1 - bal1 / 24.6;
    const bal3 = bal2 - bal2 / 23.7;
    expect(rows[1].ages.p1).toBe(74);
    expect(rows[1].balances.ret).toBeCloseTo(bal1, 2);
    expect(rows[2].balances.ret).toBeCloseTo(bal2, 2);
    expect(rows[3].balances.ret).toBeCloseTo(bal3, 2);
  });

  it("takes about 4.07% of the balance at age 75, per the IRS table", () => {
    // Regression guard for the flat-rate model this replaced: a plan whose
    // owner turns 75 in the first projection year must withdraw 1/24.6 of the
    // balance, not some assumed percentage.
    const household = {
      filingStatus: "single" as const,
      residenceState: "FL" as const,
      people: [
        { id: "p1", name: "Pat", birthYear: 1961, retirementYear: 2036 },
      ],
      accounts: [
        {
          id: "ret",
          label: "IRA",
          ownerId: "p1",
          kind: "retirementTaxable" as const,
          balance: 605_467,
          growthRate: 0,
        },
      ],
      incomes: [],
      realEstate: [],
      expenses: [],
      assumptions: { expenseGrowth: 0, finalAge: 76 },
      optimizer: { strategy: "manual" as const, manualSchedule: [0, 0] },
    };
    const rows = projectScenario(household, zeros(projectionYears(household)));
    expect(rows[0].ages.p1).toBe(75);
    const rmd = rows[0].incomeMonthly["rmd:ret"] * 12;
    expect(rmd / 605_467).toBeCloseTo(1 / 24.6, 6);
    expect(rows[0].incomeMonthly["rmd:ret"]).toBeCloseTo(2_051.04, 2);
  });

  it("caps the RMD at what is left when the prior-year base exceeds it", () => {
    // $100k IRA drained by a $4k/mo draw ($48k/yr) with no growth. The RMD is
    // figured on the prior December 31 balance, which in the final year is more
    // than the account still holds, so the take is capped and the balance
    // floors at 0 rather than going negative.
    const household = {
      filingStatus: "single" as const,
      residenceState: "FL" as const,
      people: [
        { id: "p1", name: "Pat", birthYear: 1953, retirementYear: 2026 },
      ],
      accounts: [
        {
          id: "ret",
          label: "IRA",
          ownerId: "p1",
          kind: "retirementTaxable" as const,
          balance: 100_000,
          growthRate: 0,
        },
      ],
      incomes: [
        {
          id: "draw",
          label: "Retirement draw",
          ownerId: "p1",
          kind: "retirementDraw" as const,
          monthlyAmount: 4_000,
          growthRate: 0,
          taxability: "full" as const,
          drawsFromAccountId: "ret",
        },
      ],
      realEstate: [],
      expenses: [],
      assumptions: { expenseGrowth: 0, finalAge: 76 },
      optimizer: { strategy: "manual" as const, manualSchedule: [0, 0, 0, 0] },
    };
    const rows = projectScenario(household, zeros(projectionYears(household)));
    for (const row of rows) {
      expect(row.balances.ret).toBeGreaterThanOrEqual(0);
      const rmd = (row.incomeMonthly["rmd:ret"] ?? 0) * 12;
      expect(rmd).toBeGreaterThanOrEqual(0);
    }
    expect(rows[rows.length - 1].balances.ret).toBe(0);
  });
});

describe("scheduled draws and growth continue past the RMD age", () => {
  it("keeps the retirement draw, compounds the balance, and takes the RMD on top", () => {
    // $100k account growing 5%/yr, $1k/mo scheduled draw, RMDs from age 73.
    // Each year: grow, take the $12k draw, then take a full RMD figured on the
    // prior December 31 balance (the draw doesn't shrink it). Both incomes must
    // appear as separate lines.
    const household = {
      filingStatus: "single" as const,
      residenceState: "FL" as const,
      people: [
        {
          id: "p1",
          name: "Maggie",
          birthYear: 1953,
          retirementYear: 2026,
        },
      ],
      accounts: [
        {
          id: "drop",
          label: "DROP",
          ownerId: "p1",
          kind: "retirementTaxable" as const,
          balance: 100_000,
          growthRate: 0.05,
        },
      ],
      incomes: [
        {
          id: "draw",
          label: "Income from retirement assets",
          ownerId: "p1",
          kind: "retirementDraw" as const,
          monthlyAmount: 1_000,
          growthRate: 0,
          taxability: "full" as const,
          drawsFromAccountId: "drop",
        },
      ],
      realEstate: [],
      expenses: [],
      assumptions: {
        expenseGrowth: 0,
        finalAge: 75,
      },
      optimizer: {
        strategy: "manual" as const,
        manualSchedule: [0, 0, 0],
      },
    };
    const rows = projectScenario(household, zeros(projectionYears(household)));
    // 2026 (age 73): grow 5% first, then the $12k draw, then the RMD on the
    // $100k opening (prior-year-end) balance (1/26.5), not on the post-draw
    // remainder.
    expect(rows[0].ages.p1).toBe(73);
    const grown0 = 100_000 * 1.05;
    const afterDraw0 = grown0 - 12_000;
    const rmd0 = 100_000 / 26.5;
    const bal0 = afterDraw0 - rmd0;
    expect(rows[0].incomeMonthly.draw).toBeCloseTo(1_000, 6);
    expect(rows[0].incomeMonthly["rmd:drop"]).toBeCloseTo(rmd0 / 12, 6);
    expect(rows[0].balances.drop).toBeCloseTo(bal0, 2);
    expect(rows[0].grossTaxableIncome).toBeCloseTo(12_000 + rmd0, 2);
    // 2027 (age 74): the remaining balance still compounds at 5% before the
    // draw is taken, but the RMD divides last year's closing balance by 25.5,
    // so neither this year's growth nor this year's draw changes it.
    const grown1 = bal0 * 1.05;
    const afterDraw1 = grown1 - 12_000;
    const rmd1 = bal0 / 25.5;
    expect(rows[1].incomeMonthly.draw).toBeCloseTo(1_000, 6);
    expect(rows[1].incomeMonthly["rmd:drop"]).toBeCloseTo(rmd1 / 12, 6);
    expect(rows[1].balances.drop).toBeCloseTo(afterDraw1 - rmd1, 2);
  });
});

describe("withdrawals cannot overdraw or invent phantom income", () => {
  it("floors the source balance at 0 and stops counting income once empty", () => {
    // $10k retirement account, $5k/mo scheduled draw → empties in year 1
    // (partial take). Year 2+ must stay at $0 with no phantom taxable income
    // from the still-active draw schedule (pre-RMD).
    const household = {
      filingStatus: "single" as const,
      residenceState: "FL" as const,
      people: [
        {
          id: "p1",
          name: "Pat",
          birthYear: 1965,
          retirementYear: 2026,
        },
      ],
      accounts: [
        {
          id: "ret",
          label: "IRA",
          ownerId: "p1",
          kind: "retirementTaxable" as const,
          balance: 10_000,
          growthRate: 0,
        },
      ],
      incomes: [
        {
          id: "draw",
          label: "Retirement draw",
          ownerId: "p1",
          kind: "retirementDraw" as const,
          monthlyAmount: 5_000,
          growthRate: 0,
          taxability: "full" as const,
          drawsFromAccountId: "ret",
        },
      ],
      realEstate: [],
      expenses: [],
      assumptions: {
        expenseGrowth: 0,
        finalAge: 70,
      },
      optimizer: {
        strategy: "manual" as const,
        manualSchedule: [0, 0, 0, 0, 0],
      },
    };
    const rows = projectScenario(household, zeros(projectionYears(household)));

    // Year 1: take the full $10k (not the scheduled $60k); balance floors at 0.
    expect(rows[0].balances.ret).toBe(0);
    expect(rows[0].grossTaxableIncome).toBeCloseTo(10_000, 2);
    expect(rows[0].totalMonthlyIncome).toBeCloseTo(10_000 / 12, 6);

    // Later pre-RMD years: still empty, no phantom draw income.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].balances.ret).toBe(0);
      expect(rows[i].grossTaxableIncome).toBe(0);
      expect(rows[i].totalMonthlyIncome).toBe(0);
      expect(rows[i].incomeMonthly.draw).toBeUndefined();
    }
  });
});

describe("deposits into accounts", () => {
  /**
   * One person retiring in 2030 (so the projection starts in 2030), one
   * account, no income and no expenses. Deposits are the only moving part.
   */
  function depositHousehold(
    account: Partial<Household["accounts"][number]> & {
      deposits: Deposit[];
    },
  ): Household {
    return {
      filingStatus: "single",
      residenceState: "FL",
      people: [{ id: "p1", name: "Pat", birthYear: 1970, retirementYear: 2030 }],
      accounts: [
        {
          id: "acc",
          label: "IRA",
          ownerId: "p1",
          kind: "retirementTaxable",
          retirementType: "ira",
          balance: 100_000,
          growthRate: 0,
          ...account,
        },
      ],
      incomes: [],
      realEstate: [],
      expenses: [],
      assumptions: { expenseGrowth: 0, finalAge: 62 },
      optimizer: { strategy: "manual", manualSchedule: [] },
    };
  }

  const deposit = (over: Partial<Deposit> = {}): Deposit => ({
    id: "dep",
    label: "Contribution",
    amount: 1_000,
    frequency: "monthly",
    startYear: 2030,
    ...over,
  });

  it("adds a monthly deposit at 12x the amount, after that year's growth", () => {
    const household = depositHousehold({
      growthRate: 0.1,
      deposits: [deposit({ amount: 1_000, endYear: 2031 })],
    });
    const rows = projectScenario(household, zeros(projectionYears(household)));

    // Year 0: grow $100k to $110k, then add $12k.
    expect(rows[0].balances.acc).toBeCloseTo(122_000, 6);
    expect(rows[0].monthlyDeposits).toBeCloseTo(1_000, 6);
    expect(rows[0].depositMonthly.dep).toBeCloseTo(1_000, 6);
    // Year 1: last year's deposit compounds along with everything else.
    expect(rows[1].balances.acc).toBeCloseTo(122_000 * 1.1 + 12_000, 6);
    // Year 2 is past the end year: no more deposits.
    expect(rows[2].monthlyDeposits).toBe(0);
    expect(rows[2].depositMonthly.dep).toBeUndefined();
  });

  it("treats a yearly deposit as the amount itself and a one-time as a single year", () => {
    const yearly = depositHousehold({
      deposits: [deposit({ frequency: "yearly", amount: 6_000, endYear: 2031 })],
    });
    const yearlyRows = projectScenario(yearly, zeros(projectionYears(yearly)));
    expect(yearlyRows[0].balances.acc).toBeCloseTo(106_000, 6);
    expect(yearlyRows[1].balances.acc).toBeCloseTo(112_000, 6);

    const once = depositHousehold({
      deposits: [
        // An end year is ignored for a one-time deposit.
        deposit({ frequency: "oneTime", amount: 25_000, endYear: 2040 }),
      ],
    });
    const onceRows = projectScenario(once, zeros(projectionYears(once)));
    expect(onceRows[0].balances.acc).toBeCloseTo(125_000, 6);
    expect(onceRows[1].balances.acc).toBeCloseTo(125_000, 6);
    expect(onceRows[1].monthlyDeposits).toBe(0);
  });

  it("keeps the deposit amount flat for the life of the deposit", () => {
    const household = depositHousehold({
      deposits: [
        deposit({ frequency: "yearly", amount: 10_000, endYear: 2032 }),
      ],
    });
    const rows = projectScenario(household, zeros(projectionYears(household)));
    for (const row of rows) {
      expect(row.depositMonthly.dep * 12).toBeCloseTo(10_000, 6);
    }
  });

  it("compounds pre-plan deposits into the opening balance without touching cash flow", () => {
    // Contributions from 2027 through 2029, with the plan starting in 2030.
    // A deposit made in year Y lands on January 1 of Y+1, so 2027 compounds for
    // two years, 2028 for one, and 2029 not at all.
    const household = depositHousehold({
      balance: 0,
      growthRate: 0.1,
      deposits: [
        deposit({
          frequency: "yearly",
          amount: 10_000,
          startYear: 2027,
          endYear: 2029,
        }),
      ],
    });
    const rows = projectScenario(household, zeros(projectionYears(household)));

    const opening = 10_000 * 1.1 ** 2 + 10_000 * 1.1 + 10_000;
    expect(opening).toBeCloseTo(33_100, 6);
    // Year 0 still grows the opening balance, and no deposit runs in 2030.
    expect(rows[0].balances.acc).toBeCloseTo(opening * 1.1, 6);
    expect(rows[0].monthlyDeposits).toBe(0);
    expect(rows[0].surplus).toBe(0);
  });

  it("splits a deposit that straddles the plan start year", () => {
    const household = depositHousehold({
      balance: 0,
      growthRate: 0,
      deposits: [
        deposit({
          frequency: "yearly",
          amount: 10_000,
          startYear: 2028,
          endYear: 2031,
        }),
      ],
    });
    const rows = projectScenario(household, zeros(projectionYears(household)));

    // 2028 and 2029 build the opening balance (no growth here, so $20k);
    // 2030 and 2031 run through the projection.
    expect(rows[0].balances.acc).toBeCloseTo(30_000, 6);
    expect(rows[0].monthlyDeposits).toBeCloseTo(10_000 / 12, 6);
    expect(rows[1].balances.acc).toBeCloseTo(40_000, 6);
    expect(rows[2].monthlyDeposits).toBe(0);
  });

  it("takes deposits out of surplus like an expense", () => {
    const household = depositHousehold({
      deposits: [deposit({ frequency: "yearly", amount: 6_000 })],
    });
    household.incomes = [
      {
        id: "pension",
        label: "Pension",
        ownerId: "p1",
        kind: "pension",
        monthlyAmount: 5_000,
        growthRate: 0,
        taxability: "taxFree",
      },
    ];
    household.expenses = [
      {
        id: "living",
        label: "Living",
        amount: 3_000,
        frequency: "monthly",
        growthRate: 0,
      },
    ];
    const rows = projectScenario(household, zeros(projectionYears(household)));

    expect(rows[0].monthlyDeposits).toBeCloseTo(500, 6);
    expect(rows[0].surplus).toBeCloseTo(5_000 - 3_000 - 500, 6);
  });

  it("excludes tax-deferred deposits from taxable income, but not Roth ones", () => {
    const salary = {
      id: "salary",
      label: "Salary",
      ownerId: "p1",
      kind: "salary" as const,
      monthlyAmount: 10_000,
      growthRate: 0,
      taxability: "full" as const,
    };

    const preTax = depositHousehold({
      deposits: [deposit({ frequency: "yearly", amount: 20_000 })],
    });
    preTax.incomes = [salary];
    const preTaxRows = projectScenario(preTax, zeros(projectionYears(preTax)));
    expect(preTaxRows[0].preTaxDeposits).toBeCloseTo(20_000, 6);
    expect(preTaxRows[0].grossTaxableIncome).toBeCloseTo(100_000, 6);
    // The deposit is spent either way: only the tax bill differs.
    expect(preTaxRows[0].totalMonthlyIncome).toBeCloseTo(10_000, 6);

    const roth = depositHousehold({
      kind: "rothTaxFree",
      deposits: [deposit({ frequency: "yearly", amount: 20_000 })],
    });
    roth.incomes = [salary];
    const rothRows = projectScenario(roth, zeros(projectionYears(roth)));
    expect(rothRows[0].preTaxDeposits).toBe(0);
    expect(rothRows[0].grossTaxableIncome).toBeCloseTo(120_000, 6);
    expect(rothRows[0].federalAnnualTax).toBeGreaterThan(
      preTaxRows[0].federalAnnualTax,
    );
  });

  it("never drives taxable income below zero with an oversized pre-tax deposit", () => {
    const household = depositHousehold({
      deposits: [deposit({ frequency: "yearly", amount: 500_000 })],
    });
    const rows = projectScenario(household, zeros(projectionYears(household)));
    expect(rows[0].grossTaxableIncome).toBe(0);
    expect(rows[0].federalAnnualTax).toBe(0);
  });

  it("adds after-tax deposits to cost basis so they aren't taxed as gains", () => {
    // $100k brokerage with $100k basis, one $50k deposit, then a $150k
    // withdrawal. Every dollar is return of basis, so no gain is realized.
    const household = depositHousehold({
      kind: "investment",
      balance: 100_000,
      costBasis: 100_000,
      growthRate: 0,
      deposits: [
        deposit({ frequency: "oneTime", amount: 50_000, startYear: 2030 }),
      ],
    });
    household.incomes = [
      {
        id: "draw",
        label: "Brokerage draw",
        ownerId: "p1",
        kind: "afterTaxWithdrawal",
        monthlyAmount: 12_500,
        growthRate: 0,
        taxability: "taxFree",
        startYear: 2031,
        endYear: 2031,
        drawsFromAccountId: "acc",
      },
    ];
    const rows = projectScenario(household, zeros(projectionYears(household)));

    expect(rows[0].balances.acc).toBeCloseTo(150_000, 6);
    expect(rows[1].balances.acc).toBeCloseTo(0, 6);
    expect(rows[1].capitalGainsIncome).toBeCloseTo(0, 6);
  });

  it("counts deposit principal as basis when valuing the estate", () => {
    // An after-tax account contributes its balance net of basis to the estate.
    // A $50k deposit in 2030 growing 10% is worth $60,500 by 2032, of which
    // only the $10,500 of growth is above basis: the deposited principal was
    // already taxed on the way in.
    const household = depositHousehold({
      kind: "investment",
      balance: 0,
      costBasis: 0,
      growthRate: 0.1,
      deposits: [
        deposit({ frequency: "oneTime", amount: 50_000, startYear: 2030 }),
      ],
    });
    const scenario = runScenario(
      household,
      zeros(projectionYears(household)),
      "baseline",
    );
    const finalRow = scenario.rows[scenario.rows.length - 1];
    expect(finalRow.afterTaxTotal).toBeCloseTo(60_500, 6);
    expect(scenario.totals.inheritanceFinal).toBeCloseTo(10_500, 6);
  });

  it("keeps deposits out of plans that have none", () => {
    const household = depositHousehold({ deposits: [] });
    const rows = projectScenario(household, zeros(projectionYears(household)));
    for (const row of rows) {
      expect(row.monthlyDeposits).toBe(0);
      expect(row.preTaxDeposits).toBe(0);
      expect(row.depositMonthly).toEqual({});
    }
  });
});

describe("afterTaxAssets", () => {
  it("matches scenario totals at the RMD year and final year", () => {
    const household = SAMPLE_HOUSEHOLD;
    const schedule = zeros(projectionYears(household));
    const scenario = runScenario(household, schedule, "baseline");
    const primaryId = primaryPersonId(household);
    const rmdAge = primaryRmdAge(household);
    const rmdRow =
      (rmdAge != null
        ? scenario.rows.find((r) => r.ages[primaryId] >= rmdAge)
        : undefined) ?? scenario.rows[scenario.rows.length - 1];
    const finalRow = scenario.rows[scenario.rows.length - 1];

    expect(afterTaxAssets(household, rmdRow)).toBeCloseTo(
      scenario.totals.afterTaxAssetsAtRmd,
      6,
    );
    expect(afterTaxAssets(household, finalRow)).toBeCloseTo(
      scenario.totals.inheritanceFinal,
      6,
    );
  });
});

describe("DROP growth delay", () => {
  function household(opts: {
    retirementType: "drop" | "ira" | "401k";
    retirementYear: number;
    spouseRetirementYear?: number;
    monthlyDraw?: number;
  }): Household {
    const people = [
      {
        id: "p1",
        name: "Pat",
        birthYear: 1970,
        retirementYear: opts.retirementYear,
      },
    ];
    if (opts.spouseRetirementYear != null) {
      people.push({
        id: "p2",
        name: "Sam",
        birthYear: 1972,
        retirementYear: opts.spouseRetirementYear,
      });
    }
    return {
      filingStatus: opts.spouseRetirementYear != null ? "mfj" : "single",
      residenceState: "FL",
      people,
      accounts: [
        {
          id: "ret",
          label: opts.retirementType === "drop" ? "DROP" : "IRA",
          ownerId: people[people.length - 1].id,
          kind: "retirementTaxable",
          retirementType: opts.retirementType,
          balance: 100_000,
          growthRate: 0.05,
        },
      ],
      incomes:
        opts.monthlyDraw != null
          ? [
              {
                id: "draw",
                label: "Draw",
                ownerId: people[people.length - 1].id,
                kind: "retirementDraw",
                monthlyAmount: opts.monthlyDraw,
                growthRate: 0,
                taxability: "full",
                drawsFromAccountId: "ret",
              },
            ]
          : [],
      realEstate: [],
      expenses: [],
      assumptions: { expenseGrowth: 0, finalAge: 62 },
      optimizer: { strategy: "manual", manualSchedule: [] },
    };
  }

  it("leaves a DROP flat in the retirement year, then grows the next year", () => {
    const h = household({
      retirementType: "drop",
      retirementYear: 2026,
      monthlyDraw: 1_000,
    });
    const rows = projectScenario(h, zeros(projectionYears(h)));
    expect(rows[0].calendarYear).toBe(2026);
    expect(rows[0].balances.ret).toBeCloseTo(88_000, 2);
    expect(rows[1].calendarYear).toBe(2027);
    expect(rows[1].balances.ret).toBeCloseTo(80_400, 2);
  });

  it("holds a later-retiring spouse DROP until the year after they retire", () => {
    const h = household({
      retirementType: "drop",
      retirementYear: 2026,
      spouseRetirementYear: 2028,
    });
    const rows = projectScenario(h, zeros(projectionYears(h)));
    expect(rows[0].calendarYear).toBe(2026);
    expect(rows[0].balances.ret).toBeCloseTo(100_000, 2);
    expect(rows[1].balances.ret).toBeCloseTo(100_000, 2);
    expect(rows[2].balances.ret).toBeCloseTo(100_000, 2);
    expect(rows[3].calendarYear).toBe(2029);
    expect(rows[3].balances.ret).toBeCloseTo(105_000, 2);
  });

  it("still grows an IRA and a 401(k) in year 0", () => {
    for (const retirementType of ["ira", "401k"] as const) {
      const h = household({ retirementType, retirementYear: 2026 });
      const rows = projectScenario(h, zeros(projectionYears(h)));
      expect(rows[0].balances.ret).toBeCloseTo(105_000, 2);
      expect(rows[1].balances.ret).toBeCloseTo(110_250, 2);
    }
  });

  it("grows year 0 only for the rest of the year when balances are as of a date in it", () => {
    const h = household({ retirementType: "ira", retirementYear: 2026 });
    const refs = { ...FALLBACK_REFERENCE_DATA, asOfDate: "2026-10-07" };
    const rows = projectScenario(h, zeros(projectionYears(h)), refs);
    // October 7 leaves 86 of 365 days, so year 0 compounds 5% for 86/365.
    const year0 = 100_000 * Math.pow(1.05, 86 / 365);
    expect(rows[0].balances.ret).toBeCloseTo(year0, 2);
    // Later years get a full year.
    expect(rows[1].balances.ret).toBeCloseTo(year0 * 1.05, 2);
  });

  it("keeps a full year-0 year when the as-of date is outside the start year", () => {
    const h = household({ retirementType: "ira", retirementYear: 2027 });
    const refs = { ...FALLBACK_REFERENCE_DATA, asOfDate: "2026-10-07" };
    const rows = projectScenario(h, zeros(projectionYears(h)), refs);
    expect(rows[0].calendarYear).toBe(2027);
    expect(rows[0].balances.ret).toBeCloseTo(105_000, 2);
  });

  it("applies year-0 growth when the same account is switched from DROP to IRA", () => {
    const drop = household({ retirementType: "drop", retirementYear: 2026 });
    const ira = {
      ...drop,
      accounts: [{ ...drop.accounts[0], retirementType: "ira" as const }],
    };
    const dropRows = projectScenario(drop, zeros(projectionYears(drop)));
    const iraRows = projectScenario(ira, zeros(projectionYears(ira)));
    expect(dropRows[0].balances.ret).toBeCloseTo(100_000, 2);
    expect(iraRows[0].balances.ret).toBeCloseTo(105_000, 2);
  });

  it("adds DROP pre-start deposits as principal only", () => {
    const h = household({ retirementType: "drop", retirementYear: 2030 });
    h.accounts[0].balance = 0;
    h.accounts[0].deposits = [
      {
        id: "dep",
        label: "Contribution",
        amount: 10_000,
        frequency: "yearly",
        startYear: 2027,
        endYear: 2029,
      },
    ];
    const rows = projectScenario(h, zeros(projectionYears(h)));
    // Three $10k deposits, no pre-start compounding, no 2030 growth.
    expect(rows[0].calendarYear).toBe(2030);
    expect(rows[0].balances.ret).toBeCloseTo(30_000, 2);
    expect(rows[0].monthlyDeposits).toBe(0);
    expect(rows[1].balances.ret).toBeCloseTo(31_500, 2);
  });
});
