import { describe, expect, it } from "vitest";
import { employmentTax } from "@/lib/engine/employmentTax";
import { indexedFederalTax } from "@/lib/engine/taxIndexing";
import { projectScenario, projectionYears } from "@/lib/engine/project";
import { FALLBACK_FEDERAL_TAX } from "@/lib/config/federalTax";
import type { Household } from "@/lib/domain/types";

const BASE = 184_500; // 2026 Social Security wage base

describe("employmentTax", () => {
  it("charges employee FICA on wages: 6.2% up to the wage base, 1.45% on all", () => {
    const t = employmentTax({ p1: { wages: 100_000, business: 0 } }, "mfj", BASE);
    expect(t.socialSecurity).toBeCloseTo(6_200, 6);
    expect(t.medicare).toBeCloseTo(1_450, 6);
    expect(t.additionalMedicare).toBe(0);
    expect(t.selfEmploymentDeduction).toBe(0);

    const high = employmentTax({ p1: { wages: 300_000, business: 0 } }, "mfj", BASE);
    expect(high.socialSecurity).toBeCloseTo(BASE * 0.062, 6);
    expect(high.medicare).toBeCloseTo(300_000 * 0.0145, 6);
    // 0.9% on wages over the $250k joint threshold.
    expect(high.additionalMedicare).toBeCloseTo(50_000 * 0.009, 6);
  });

  it("charges self-employment tax on 92.35% of business profit, and deducts half", () => {
    const t = employmentTax({ p1: { wages: 0, business: 100_000 } }, "single", BASE);
    const net = 92_350;
    expect(t.socialSecurity).toBeCloseTo(net * 0.124, 6);
    expect(t.medicare).toBeCloseTo(net * 0.029, 6);
    expect(t.selfEmploymentDeduction).toBeCloseTo((net * 0.153) / 2, 6);
    expect(t.total).toBeCloseTo(net * 0.153, 6);
  });

  it("stops the Social Security part at the wage base, wages first", () => {
    // $150k wages leave $34,500 of the base for self-employment earnings.
    const t = employmentTax({ p1: { wages: 150_000, business: 100_000 } }, "mfj", BASE);
    expect(t.socialSecurity).toBeCloseTo(150_000 * 0.062 + (BASE - 150_000) * 0.124, 6);
    expect(t.medicare).toBeCloseTo(150_000 * 0.0145 + 92_350 * 0.029, 6);
    // Half the SE tax only, never the employee's share of FICA.
    expect(t.selfEmploymentDeduction).toBeCloseTo(
      ((BASE - 150_000) * 0.124 + 92_350 * 0.029) / 2,
      6,
    );
  });

  it("gives each person their own wage base", () => {
    const t = employmentTax(
      { p1: { wages: 0, business: 300_000 }, p2: { wages: 0, business: 300_000 } },
      "mfj",
      BASE,
    );
    expect(t.socialSecurity).toBeCloseTo(2 * BASE * 0.124, 6);
  });

  it("figures the additional Medicare tax on combined earnings, wages first", () => {
    // Joint threshold $250k: $200k wages leave $50k of threshold for SE.
    const t = employmentTax(
      { p1: { wages: 200_000, business: 0 }, p2: { wages: 0, business: 100_000 } },
      "mfj",
      BASE,
    );
    expect(t.additionalMedicare).toBeCloseTo((92_350 - 50_000) * 0.009, 6);
    // Single threshold is $200k.
    const single = employmentTax({ p1: { wages: 0, business: 300_000 } }, "single", BASE);
    expect(single.additionalMedicare).toBeCloseTo((277_050 - 200_000) * 0.009, 6);
  });

  it("skips tiny self-employment earnings and doesn't let a loss offset wages", () => {
    expect(employmentTax({ p1: { wages: 0, business: 400 } }, "single", BASE).total).toBe(0);
    const t = employmentTax({ p1: { wages: 50_000, business: -40_000 } }, "single", BASE);
    expect(t.total).toBeCloseTo(50_000 * 0.0765, 6);
  });
});

describe("employment tax in the projection", () => {
  const household = (business: number, taxIndexing?: number): Household => ({
    filingStatus: "single",
    residenceState: "FL",
    people: [{ id: "p1", name: "Sam", birthYear: 1975, retirementYear: 2036 }],
    accounts: [],
    incomes: [
      {
        id: "biz",
        label: "Consulting",
        ownerId: "p1",
        kind: "business",
        monthlyAmount: business / 12,
        growthRate: 0,
        taxability: "full",
      },
    ],
    realEstate: [],
    expenses: [],
    assumptions: { expenseGrowth: 0, finalAge: 63, taxIndexing },
    optimizer: { strategy: "manual" },
  });
  const run = (h: Household) =>
    projectScenario(h, new Array(projectionYears(h)).fill(0));

  it("indexes the wage base with the brackets, so the cap moves each year", () => {
    const rows = run(household(400_000));
    for (const row of rows) {
      const base = indexedFederalTax(FALLBACK_FEDERAL_TAX, row.calendarYear, 0.02)
        .socialSecurityWageBase;
      expect(row.employmentTax.socialSecurity).toBeCloseTo(base * 0.124, 6);
    }
    expect(rows[0].calendarYear).toBe(2036);
    // 2036 base: $184,500 grown 2% a year for 10 years.
    expect(rows[0].employmentTax.socialSecurity).toBeCloseTo(184_500 * 1.02 ** 10 * 0.124, 6);
  });

  it("takes half the self-employment tax off income and adds the tax to federal tax", () => {
    const [row] = run(household(100_000, 0));
    const t = row.employmentTax;
    expect(row.grossTaxableIncome).toBeCloseTo(100_000 - t.selfEmploymentDeduction, 6);
    expect(row.federalAnnualTax).toBeCloseTo(row.federalOrdinaryTax + t.total, 6);
    expect(row.netAnnualIncome).toBeCloseTo(100_000 - row.federalAnnualTax, 6);
  });

  it("charges nothing on business income marked tax free", () => {
    const h = household(100_000);
    h.incomes[0].taxability = "taxFree";
    expect(run(h)[0].employmentTax.total).toBe(0);
  });
});
