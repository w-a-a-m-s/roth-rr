import { describe, expect, it } from "vitest";
import { taxableSocialSecurity } from "@/lib/engine/socialSecurityTax";
import { projectScenario, projectionYears } from "@/lib/engine/project";
import type { FilingStatus, Household } from "@/lib/domain/types";

describe("taxableSocialSecurity (IRS Pub. 915 worksheet)", () => {
  it("taxes none of it while provisional income is under the base amount", () => {
    // Joint: $10k other + half of $30k = $25k, under $32k.
    expect(taxableSocialSecurity(30_000, 10_000, "mfj")).toBe(0);
    expect(taxableSocialSecurity(30_000, 17_000, "mfj")).toBe(0); // exactly $32k
    // Single: $15k + $10k = $25k, at the base.
    expect(taxableSocialSecurity(20_000, 15_000, "single")).toBe(0);
  });

  it("taxes half the income above the base between the two thresholds", () => {
    // Joint: $25k + $15k = $40k, $8k over $32k.
    expect(taxableSocialSecurity(30_000, 25_000, "mfj")).toBeCloseTo(4_000, 6);
    // Single: $20k + $10k = $30k, $5k over $25k.
    expect(taxableSocialSecurity(20_000, 20_000, "single")).toBeCloseTo(2_500, 6);
  });

  it("adds 85% of the income above the adjusted base", () => {
    // Joint: $40k + $15k = $55k. $6,000 (half of $44k to $32k) + 85% of $11k.
    expect(taxableSocialSecurity(30_000, 40_000, "mfj")).toBeCloseTo(6_000 + 9_350, 6);
    // Single: $4k benefits, $33k other: $35k. Half the benefits ($2,000) is
    // less than $4,500, so $2,000 + 85% of $1k.
    expect(taxableSocialSecurity(4_000, 33_000, "single")).toBeCloseTo(2_850, 6);
  });

  it("never taxes more than 85% of the benefits", () => {
    // Single: $40k + $10k = $50k would give $4,500 + $13,600, capped at $17,000.
    expect(taxableSocialSecurity(20_000, 40_000, "single")).toBeCloseTo(17_000, 6);
    expect(taxableSocialSecurity(48_000, 500_000, "mfj")).toBeCloseTo(40_800, 6);
  });

  it("uses each filing status's own thresholds", () => {
    // Same $30k benefits and $25k other income: $40k provisional.
    const at = (fs: FilingStatus) => taxableSocialSecurity(30_000, 25_000, fs);
    expect(at("mfj")).toBeCloseTo(0.5 * (40_000 - 32_000), 6);
    // Single and HOH: past $34k, so $4,500 + 85% of $6k.
    expect(at("single")).toBeCloseTo(4_500 + 0.85 * 6_000, 6);
    expect(at("hoh")).toBeCloseTo(at("single"), 6);
  });

  it("is zero without benefits", () => {
    expect(taxableSocialSecurity(0, 500_000, "mfj")).toBe(0);
  });
});

describe("taxable Social Security in the projection", () => {
  const couple = (pension: number): Household => ({
    filingStatus: "mfj",
    residenceState: "FL",
    people: [
      { id: "a", name: "Ana", birthYear: 1960, retirementYear: 2026 },
      { id: "b", name: "Ben", birthYear: 1960, retirementYear: 2026 },
    ],
    accounts: [],
    incomes: [
      {
        id: "ss",
        label: "Social Security",
        ownerId: "a",
        kind: "socialSecurity",
        monthlyAmount: 2_500,
        growthRate: 0,
        taxability: "full",
      },
      {
        id: "pension",
        label: "Pension",
        ownerId: "b",
        kind: "pension",
        monthlyAmount: pension / 12,
        growthRate: 0,
        taxability: "full",
      },
    ],
    realEstate: [],
    expenses: [],
    assumptions: { expenseGrowth: 0, finalAge: 70, taxIndexing: 0 },
    optimizer: { strategy: "manual" },
  });
  const first = (h: Household) => projectScenario(h, new Array(projectionYears(h)).fill(0))[0];

  it("taxes a modest couple's benefits far below 85%", () => {
    // $30k benefits, $25k pension: $40k provisional, so $4,000 taxable.
    const row = first(couple(25_000));
    expect(row.socialSecurityTaxable).toBeCloseTo(4_000, 6);
    expect(row.grossTaxableIncome).toBeCloseTo(25_000 + 4_000, 6);
  });

  it("reaches 85% for a high-income couple", () => {
    const row = first(couple(200_000));
    expect(row.socialSecurityTaxable).toBeCloseTo(0.85 * 30_000, 6);
  });

  it("counts a Roth conversion toward provisional income", () => {
    const h = couple(25_000);
    h.accounts = [
      { id: "ira", label: "IRA", ownerId: "a", kind: "retirementTaxable", balance: 100_000, growthRate: 0 },
    ];
    const rows = projectScenario(h, [20_000, ...new Array(projectionYears(h) - 1).fill(0)]);
    expect(rows[0].conversion).toBe(20_000);
    // $25k + $20k + $15k = $60k: $6,000 + 85% of $16k.
    expect(rows[0].socialSecurityTaxable).toBeCloseTo(6_000 + 0.85 * 16_000, 6);
  });

  it("switches a surviving spouse to the single thresholds the year after", () => {
    const h = couple(25_000);
    // Ben (with the pension) passes at 68 in 2028; Ana keeps her benefits.
    const rows = projectScenario(h, new Array(projectionYears(h)).fill(0), undefined, {
      death: { personId: "b", deathAge: 68 },
    });
    const year = (y: number) => rows.find((r) => r.calendarYear === y)!;
    expect(year(2028).filingStatus).toBe("mfj");
    expect(year(2029).filingStatus).toBe("single");
    // 2029: $30k benefits alone, $15k provisional: under the $25k base.
    expect(year(2029).socialSecurityTaxable).toBe(0);
  });
});
