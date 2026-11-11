import { describe, expect, it } from "vitest";
import type { Household, PropertyLoan } from "@/lib/domain/types";
import {
  HECM_ANNUAL_MIP,
  compareReverseMortgage,
  estimatePrincipalLimitFactor,
  hecmOriginationFee,
  reverseMortgageSettingsFor,
} from "@/lib/engine/reverseMortgage";

function household(loans: PropertyLoan[], extra: Partial<Household> = {}): Household {
  return {
    filingStatus: "mfj",
    residenceState: "FL",
    people: [
      { id: "a", name: "A", birthYear: 1960, retirementYear: 2025 },
      { id: "b", name: "B", birthYear: 1964, retirementYear: 2025 },
    ],
    accounts: [],
    incomes: [],
    expenses: [],
    realEstate: [
      {
        id: "rental",
        label: "Rental",
        purchaseYear: 2010,
        purchasePrice: 200_000,
        marketValue: 300_000,
        appreciationRate: 0.03,
        depreciationYears: 27.5,
        activeParticipation: true,
        loans: [],
      },
      {
        id: "home",
        label: "Home",
        purchaseYear: 2000,
        purchasePrice: 300_000,
        marketValue: 800_000,
        appreciationRate: 0,
        depreciationYears: 27.5,
        activeParticipation: true,
        use: "homestead",
        loans,
      },
    ],
    assumptions: { expenseGrowth: 0, finalAge: 90 },
    optimizer: { strategy: "manual" },
    ...extra,
  } as Household;
}

const opts = { thisYear: 2026, asOfDate: "2026-11-11" };

describe("HECM pieces", () => {
  it("caps the origination fee at $2,500 to $6,000", () => {
    expect(hecmOriginationFee(100_000)).toBe(2_500);
    expect(hecmOriginationFee(300_000)).toBe(5_000);
    expect(hecmOriginationFee(1_000_000)).toBe(6_000);
  });

  it("lends more to older borrowers and less at higher rates", () => {
    const at62 = estimatePrincipalLimitFactor(62, 0.07);
    expect(at62).toBeGreaterThan(0.3);
    expect(at62).toBeLessThan(0.4);
    expect(estimatePrincipalLimitFactor(80, 0.07)).toBeGreaterThan(at62);
    expect(estimatePrincipalLimitFactor(62, 0.09)).toBeLessThan(at62);
    // HUD's 3% expected rate floor.
    expect(estimatePrincipalLimitFactor(62, 0.01)).toBe(estimatePrincipalLimitFactor(62, 0.03));
  });

  it("defaults to the year the youngest turns 62 and the homestead", () => {
    const s = reverseMortgageSettingsFor(household([]), 2026);
    expect(s.startYear).toBe(2026);
    expect(s.payout).toBe("lumpSum");
    const younger = household([], {
      people: [
        { id: "a", name: "A", birthYear: 1973, retirementYear: 2040 },
        { id: "b", name: "B", birthYear: 1979, retirementYear: 2040 },
      ],
    });
    expect(reverseMortgageSettingsFor(younger, 2026).startYear).toBe(2041);
    // Never before the oldest is 62.
    younger.reverseMortgage = { ...reverseMortgageSettingsFor(younger, 2026), startYear: 2030 };
    expect(reverseMortgageSettingsFor(younger, 2026).startYear).toBe(2035);
  });
});

describe("compareReverseMortgage", () => {
  const mortgage: PropertyLoan = {
    id: "m",
    kind: "mortgage",
    label: "Mortgage",
    balance: 100_000,
    rate: 0.05,
    monthlyPayment: 1_500,
  };
  const h = household([mortgage]);
  const settings = {
    ...reverseMortgageSettingsFor(h, 2026),
    startYear: 2028,
    principalLimitFactor: 0.4,
  };
  const r = compareReverseMortgage(h, settings, opts)!;

  it("sizes the loan and pays off the mortgage at closing", () => {
    expect(r.property.id).toBe("home");
    expect(r.closing).toEqual({ month: 1, year: 2028 });
    expect(r.youngestAge).toBe(64);
    expect(r.maxClaim).toBe(800_000);
    expect(r.principalLimit).toBeCloseTo(320_000, 6);
    expect(r.closingCosts).toBeCloseTo(6_000 + 16_000 + 3_000, 6);
    // 14 payments (Dec 2026 through Jan 2028 is next) paid it down first.
    expect(r.existingLoans).toBeLessThan(100_000);
    expect(r.existingLoans).toBeGreaterThan(85_000);
    // 60% of the limit beats payoff + costs + 10%.
    expect(r.firstYearLimit).toBeCloseTo(192_000, 6);
    expect(r.cashAtClosing).toBeCloseTo(192_000 - r.mandatory, 6);
    expect(r.forfeited).toBeCloseTo(128_000, 6);
    expect(r.monthlyPaymentFreed).toBe(1_500);
    expect(r.years[0].year).toBe(2028);
    expect(r.years[r.years.length - 1].year).toBe(1964 + 90);
  });

  it("grows the loan at the note rate plus MIP and invests the freed payments", () => {
    const first = r.years[0];
    const rate = (settings.noteRate + HECM_ANNUAL_MIP) / 12;
    expect(first.reverseBalance).toBeCloseTo(192_000 * Math.pow(1 + rate, 12), 4);
    expect(first.paymentsInvested).toBe(18_000);
    expect(first.keepPayments).toBe(18_000);
    expect(first.keepNetWorth).toBeCloseTo(800_000 - first.keepLoans, 6);
    expect(first.reverseAhead).toBeCloseTo(first.reverseNetWorth - first.keepNetWorth, 6);
  });

  it("ends even at the breakeven return", () => {
    expect(r.breakevenReturn).not.toBeNull();
    const even = compareReverseMortgage(h, { ...settings, investmentReturn: r.breakevenReturn! }, opts)!;
    expect(Math.abs(even.reverseEnd - even.keepEnd)).toBeLessThan(1);
  });

  it("draws the rest a year later on the adjustable payout", () => {
    const full = compareReverseMortgage(h, { ...settings, payout: "fullDraw" }, opts)!;
    const rate = (settings.noteRate + HECM_ANNUAL_MIP) / 12;
    expect(full.forfeited).toBe(0);
    expect(full.laterDraw).toBeCloseTo(128_000 * Math.pow(1 + rate, 12), 4);
    expect(full.years[0].drawn).toBeCloseTo(full.cashAtClosing + full.laterDraw, 6);
  });

  it("never lets equity go below 0 (non-recourse)", () => {
    const flat = compareReverseMortgage(
      h,
      { ...settings, noteRate: 0.2, payout: "fullDraw" },
      opts,
    )!;
    expect(flat.underwaterYear).not.toBeNull();
    const last = flat.years[flat.years.length - 1];
    expect(last.reverseEquity).toBe(0);
    expect(last.reverseNetWorth).toBeCloseTo(last.invested, 6);
  });

  it("asks for cash at closing when the loans are more than the limit", () => {
    const big = compareReverseMortgage(
      household([{ ...mortgage, balance: 400_000, monthlyPayment: 3_000 }]),
      settings,
      opts,
    )!;
    expect(big.cashToClose).toBeGreaterThan(0);
    expect(big.cashAtClosing).toBe(0);
    expect(big.firstYearLimit).toBeCloseTo(big.principalLimit, 6);
  });

  it("returns null with no property", () => {
    expect(compareReverseMortgage(household([], { realEstate: [] }), settings, opts)).toBeNull();
  });
});
