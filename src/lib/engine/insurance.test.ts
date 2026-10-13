import { describe, expect, it } from "vitest";
import type {
  DisabilityInsurancePolicy,
  Household,
  InsurancePolicy,
  LifeInsurancePolicy,
  LongTermCarePolicy,
} from "@/lib/domain/types";
import type { ProjectionOptions } from "@/lib/engine/types";
import { projectScenario, projectionYears } from "@/lib/engine/project";
import { calculate } from "@/lib/calculate";
import { lifeInsurancePayoutRate } from "@/lib/config/lifeInsurancePayout";
import { SOCIAL_SECURITY_TAXABLE_PCT } from "@/lib/config/federalTax";
import {
  disabilityBenefitMonths,
  lifeInsuranceClaims,
  lifeInsuranceSummary,
  lifePolicyInForce,
  longTermCareBenefitMonths,
  resolveDisability,
  waitingMonths,
} from "@/lib/domain/insurance";
import { resolveDeath } from "@/lib/domain/survivorship";
import { migrateHousehold } from "@/store/useScenario";

// Alex (born 1950) and Sam (born 1952). Plan starts in 2026.
function couple(insurance: InsurancePolicy[] = []): Household {
  return {
    filingStatus: "mfj",
    residenceState: "FL",
    people: [
      { id: "a", name: "Alex", birthYear: 1950, retirementYear: 2026, sex: "male" },
      { id: "b", name: "Sam", birthYear: 1952, retirementYear: 2026, sex: "female" },
    ],
    mainPersonId: "a",
    accounts: [
      { id: "ira", label: "IRA", ownerId: "a", kind: "retirementTaxable", balance: 400_000, growthRate: 0.05, retirementType: "ira" },
    ],
    incomes: [
      { id: "ss", label: "SS", ownerId: "a", kind: "socialSecurity", monthlyAmount: 4000, growthRate: 0, taxability: "full" },
    ],
    realEstate: [],
    expenses: [
      { id: "living", label: "Living", amount: 5000, frequency: "monthly", growthRate: 0 },
    ],
    assumptions: { expenseGrowth: 0, finalAge: 95 },
    optimizer: { strategy: "manual", manualSchedule: [] },
    insurance,
  };
}

const life = (patch: Partial<LifeInsurancePolicy> = {}): LifeInsurancePolicy => ({
  id: "life1",
  kind: "life",
  label: "Whole life",
  insuredId: "a",
  policyType: "permanent",
  permanentType: "whole",
  faceAmount: 1_000_000,
  ...patch,
});

const di = (patch: Partial<DisabilityInsurancePolicy> = {}): DisabilityInsurancePolicy => ({
  id: "di1",
  kind: "disability",
  label: "DI",
  insuredId: "w",
  occupation: "own",
  monthlyBenefit: 5000,
  waitingDays: 90,
  benefitPeriod: "age65",
  ...patch,
});

const ltc = (patch: Partial<LongTermCarePolicy> = {}): LongTermCarePolicy => ({
  id: "ltc1",
  kind: "longTermCare",
  label: "LTC",
  insuredId: "a",
  policyType: "traditional",
  monthlyBenefit: 8000,
  waitingDays: 90,
  benefitYears: 2,
  ...patch,
});

function rows(h: Household, options: ProjectionOptions = {}) {
  return projectScenario(h, new Array(projectionYears(h)).fill(0), undefined, options);
}
const at = (r: ReturnType<typeof rows>, y: number) => r.find((x) => x.calendarYear === y)!;

describe("insurance never touches Retirement", () => {
  it("gives the same Retirement numbers with or without policies", () => {
    const policies = [life(), di({ insuredId: "a" }), ltc()];
    expect(calculate(couple(policies))).toEqual(calculate(couple()));
  });

  it("leaves Survivorship alone when the person who passes has no life policy", () => {
    const death = { death: { personId: "b", deathAge: 80 } };
    expect(rows(couple([life()]), death)).toEqual(rows(couple(), death));
  });
});

describe("life insurance payout table", () => {
  it("reads the immediate payout column by age at death", () => {
    expect(lifeInsurancePayoutRate(59)).toBe(0.057);
    expect(lifeInsurancePayoutRate(65)).toBe(0.063);
    expect(lifeInsurancePayoutRate(80)).toBe(0.078);
    expect(lifeInsurancePayoutRate(86)).toBe(0.083);
  });

  it("pays 5% under 59 and holds the age 86 rate after that", () => {
    expect(lifeInsurancePayoutRate(45)).toBe(0.05);
    expect(lifeInsurancePayoutRate(58)).toBe(0.05);
    expect(lifeInsurancePayoutRate(92)).toBe(0.083);
  });
});

describe("life insurance in Survivorship", () => {
  // Alex passes at 80, the end of 2030. The death benefit lands in 2030; income starts in 2031.
  const options = { death: { personId: "a", deathAge: 80 } };
  const without = rows(couple(), options);
  const withLife = rows(couple([life()]), options);
  const key = "life:life1";

  it("pays face times the age 80 rate (7.8%) for life from the year after the death", () => {
    expect(at(withLife, 2030).incomeMonthly[key]).toBeUndefined();
    expect(at(withLife, 2031).incomeMonthly[key]).toBeCloseTo(78_000 / 12, 6);
    expect(at(withLife, 2045).incomeMonthly[key]).toBeCloseTo(78_000 / 12, 6);
  });

  it("invests the death benefit at 8% and draws the income from it", () => {
    expect(at(withLife, 2031).balances[key]).toBeCloseTo(1_000_000 * 1.08 - 78_000, 4);
    expect(at(withLife, 2032).balances[key]).toBeCloseTo((1_000_000 * 1.08 - 78_000) * 1.08 - 78_000, 4);
  });

  it("shows the death benefit in assets in the year of death, with no income yet", () => {
    expect(at(withLife, 2029).balances[key]).toBeUndefined();
    expect(at(withLife, 2030).balances[key]).toBe(1_000_000);
    expect(at(withLife, 2030).afterTaxTotal - at(without, 2030).afterTaxTotal).toBeCloseTo(1_000_000, 4);
  });

  it("counts the proceeds as after-tax assets", () => {
    const y = 2031;
    expect(at(withLife, y).afterTaxTotal - at(without, y).afterTaxTotal).toBeCloseTo(1_002_000, 4);
  });

  it("taxes earnings first, as ordinary income", () => {
    // 2031: $80,000 of earnings on $1,000,000, so all $78,000 is taxable.
    expect(at(withLife, 2031).grossTaxableIncome - at(without, 2031).grossTaxableIncome).toBeCloseTo(78_000, 4);
  });

  it("only pays a term policy that's still in force at the death", () => {
    const expired = life({ policyType: "term", termYears: 20, issueYear: 2000, permanentType: undefined });
    expect(lifePolicyInForce(expired, 2019)).toBe(true);
    expect(lifePolicyInForce(expired, 2030)).toBe(false);
    expect(rows(couple([expired]), options)).toEqual(without);
    const current = life({ policyType: "term", termYears: 10, issueYear: 2025 });
    expect(lifePolicyInForce(current, 2030)).toBe(true);
    expect(at(rows(couple([current]), options), 2031).incomeMonthly[key]).toBeCloseTo(78_000 / 12, 6);
  });

  it("uses 5% for a death before 59", () => {
    const h = couple([life()]);
    const claims = lifeInsuranceClaims(h, resolveDeath(h, { personId: "a", deathAge: 55 }));
    expect(claims).toHaveLength(1);
    expect(claims[0].rate).toBe(0.05);
    expect(claims[0].annualIncome).toBe(50_000);
  });
});

// Wren (born 1970) works for a salary until 2035; the plan starts in 2026 at 56.
function worker(insurance: InsurancePolicy[] = []): Household {
  return {
    filingStatus: "single",
    residenceState: "FL",
    people: [{ id: "w", name: "Wren", birthYear: 1970, retirementYear: 2026 }],
    mainPersonId: "w",
    accounts: [
      { id: "brk", label: "Brokerage", ownerId: "w", kind: "investment", balance: 200_000, growthRate: 0.05, costBasis: 200_000 },
    ],
    incomes: [
      { id: "pay", label: "Salary", ownerId: "w", kind: "salary", monthlyAmount: 10_000, growthRate: 0, taxability: "full", endYear: 2035 },
    ],
    realEstate: [],
    expenses: [
      { id: "living", label: "Living", amount: 6000, frequency: "monthly", growthRate: 0 },
    ],
    assumptions: { expenseGrowth: 0, finalAge: 90 },
    optimizer: { strategy: "manual", manualSchedule: [] },
    insurance,
  };
}

describe("disability", () => {
  // Disabled January 1, 2027 at 57.
  const options = { disability: { personId: "w", age: 57 } };

  it("stops the disabled person's salary from that year", () => {
    const r = rows(worker(), options);
    expect(at(r, 2026).incomeMonthly.pay).toBe(10_000);
    expect(at(r, 2027).incomeMonthly.pay).toBeUndefined();
  });

  it("pays the benefit after the waiting period until 65, tax free", () => {
    const without = rows(worker(), options);
    const r = rows(worker([di()]), options);
    // 90 days is 3 months, so 9 months in 2027.
    expect(at(r, 2027).incomeMonthly["di:di1"]).toBeCloseTo((5000 * 9) / 12, 6);
    expect(at(r, 2034).incomeMonthly["di:di1"]).toBe(5000);
    expect(at(r, 2035).incomeMonthly["di:di1"]).toBeUndefined();
    expect(at(r, 2027).grossTaxableIncome).toBe(at(without, 2027).grossTaxableIncome);
  });

  it("taxes the benefit when an employer paid the premiums", () => {
    const without = rows(worker(), options);
    const r = rows(worker([di({ taxable: true })]), options);
    expect(at(r, 2028).grossTaxableIncome - at(without, 2028).grossTaxableIncome).toBe(60_000);
  });

  it("waits two whole years on a 2-year waiting period, then pays for the benefit years", () => {
    const policy = di({ waitingDays: 730, benefitPeriod: "2y" });
    expect(waitingMonths(730)).toBe(24);
    expect(disabilityBenefitMonths(policy, 1970, 2027, 2028)).toBe(0);
    expect(disabilityBenefitMonths(policy, 1970, 2027, 2029)).toBe(12);
    expect(disabilityBenefitMonths(policy, 1970, 2027, 2030)).toBe(12);
    expect(disabilityBenefitMonths(policy, 1970, 2027, 2031)).toBe(0);
  });

  it("only pays in the Disability analysis", () => {
    expect(calculate(worker([di()]))).toEqual(calculate(worker()));
  });

  it("resolves the disability to January 1 of the year the person reaches that age", () => {
    expect(resolveDisability(worker(), { personId: "w", age: 57 })).toEqual({ personId: "w", year: 2027 });
    expect(resolveDisability(worker(), { personId: "nobody", age: 57 })).toBeNull();
  });
});

describe("long-term care insurance", () => {
  // Alex in home care ($6,000/mo, no inflation) from 80 (2030) for 3 years.
  const options = {
    longTermCare: { who: "one" as const, personId: "a", careType: "home" as const, inflation: 0, periods: [] },
  };

  it("pays up to the care cost after the waiting period, for its benefit years", () => {
    const r = rows(couple([ltc()]), options);
    expect(at(r, 2029).incomeMonthly["ltci:ltc1"]).toBeUndefined();
    // 9 months in 2030 at the $6,000 care cost (the $8,000 benefit is capped).
    expect(at(r, 2030).incomeMonthly["ltci:ltc1"]).toBeCloseTo((6000 * 9) / 12, 6);
    expect(at(r, 2031).incomeMonthly["ltci:ltc1"]).toBe(6000);
    // Benefits run months 3 to 27: 3 months in 2032.
    expect(at(r, 2032).incomeMonthly["ltci:ltc1"]).toBeCloseTo((6000 * 3) / 12, 6);
    expect(at(r, 2033).incomeMonthly["ltci:ltc1"]).toBeUndefined();
  });

  it("never outlasts the care, even with lifetime benefits", () => {
    expect(longTermCareBenefitMonths(ltc({ benefitYears: "lifetime" }), 2030, 2032, 2032)).toBe(12);
    expect(longTermCareBenefitMonths(ltc({ benefitYears: "lifetime" }), 2030, 2032, 2033)).toBe(0);
  });

  it("is tax free and leaves expenses as they were", () => {
    const without = rows(couple(), options);
    const r = rows(couple([ltc()]), options);
    const year = at(r, 2031);
    // Taxable income is Social Security, the IRA's lifetime income, any RMD
    // above it and any extra IRA withdrawal: none of the benefit.
    const taxableMonthly =
      year.incomeMonthly.ss * SOCIAL_SECURITY_TAXABLE_PCT +
      (year.incomeMonthly["draw:ira"] ?? 0) +
      (year.incomeMonthly["rmd:ira"] ?? 0) +
      (year.incomeMonthly["topup:ira"] ?? 0);
    expect(year.grossTaxableIncome).toBeCloseTo(taxableMonthly * 12, 6);
    expect(year.monthlyExpenses).toBe(at(without, 2031).monthlyExpenses);
    // The benefit means less extra comes out of the IRA to pay for care.
    expect(year.incomeMonthly["topup:ira"] ?? 0).toBeLessThan(
      at(without, 2031).incomeMonthly["topup:ira"],
    );
  });
});

describe("saved insurance", () => {
  it("defaults a plan without insurance to an empty list", () => {
    const h = couple();
    delete h.insurance;
    expect(migrateHousehold(h).insurance).toEqual([]);
  });

  it("heals bad policy fields and drops policies of unknown kinds", () => {
    const h = couple([
      { id: "x", kind: "life", label: "L", insuredId: "a", policyType: "bogus", faceAmount: "lots" } as unknown as InsurancePolicy,
      { id: "y", kind: "disability", label: "D", insuredId: "a", monthlyBenefit: 1000, waitingDays: 45, benefitPeriod: "forever", occupation: "?" } as unknown as InsurancePolicy,
      { id: "z", kind: "pet" } as unknown as InsurancePolicy,
    ]);
    const out = migrateHousehold(h).insurance ?? [];
    expect(out.map((p) => p.id)).toEqual(["x", "y"]);
    const lifePolicy = out[0] as LifeInsurancePolicy;
    expect(lifePolicy.policyType).toBe("term");
    expect(lifePolicy.faceAmount).toBe(0);
    expect(lifePolicy.termYears).toBe(20);
    const diPolicy = out[1] as DisabilityInsurancePolicy;
    expect(diPolicy.waitingDays).toBe(90);
    expect(diPolicy.benefitPeriod).toBe("age65");
    expect(diPolicy.occupation).toBe("own");
  });
});

describe("life insurance summary", () => {
  const h = couple([
    life({ id: "w", label: "Whole", cashValue: 80_000, premium: 1000, premiumFrequency: "monthly" }),
    life({ id: "t", label: "Term", policyType: "term", termYears: 20, issueYear: 2020, permanentType: undefined, faceAmount: 500_000, premium: 900, premiumFrequency: "annual" }),
    life({ id: "old", label: "Old", policyType: "term", termYears: 10, issueYear: 2000, permanentType: undefined, faceAmount: 250_000, premium: 300, premiumFrequency: "annual" }),
    life({ id: "s", label: "Sam's", insuredId: "b", faceAmount: 300_000 }),
  ]);
  // In 2026 Alex is 76 (7.4%) and Sam is 74 (7.2%).
  const { groups, totals } = lifeInsuranceSummary(h, 2026);

  it("groups policies by insured in plan order", () => {
    expect(groups.map((g) => [g.name, g.age, g.payoutRate])).toEqual([
      ["Alex", 76, 0.074],
      ["Sam", 74, 0.072],
    ]);
    expect(groups[0].rows.map((r) => r.coverage)).toEqual(["Lifetime", "2020 to 2039", "Ended 2009"]);
  });

  it("lists an ended term policy but leaves it out of the totals", () => {
    const old = groups[0].rows.find((r) => r.policyId === "old")!;
    expect(old.inForce).toBe(false);
    expect(old.annualIncome).toBe(0);
    expect(groups[0].totals).toEqual({
      faceAmount: 1_500_000,
      cashValue: 80_000,
      annualPremium: 12_900,
      annualIncome: 1_500_000 * 0.074,
    });
  });

  it("adds every insured into the household total", () => {
    expect(totals.faceAmount).toBe(1_800_000);
    expect(totals.annualIncome).toBeCloseTo(1_500_000 * 0.074 + 300_000 * 0.072, 6);
  });
});

describe("a disability before the plan starts", () => {
  // Wren (born 1970) works until retiring in 2036; the plan starts in 2036.
  const h: Household = {
    ...worker([di({ benefitPeriod: "age65" })]),
    people: [{ id: "w", name: "Wren", birthYear: 1970, retirementYear: 2036 }],
  };
  // Disabled at 58, January 1, 2028.
  const r = rows(h, { disability: { personId: "w", age: 58 } });
  const at = (y: number) => r.find((x) => x.calendarYear === y)!;

  it("starts the projection in the year of the disability", () => {
    expect(r[0].calendarYear).toBe(2028);
    expect(r.length).toBe(projectionYears(h) + 8);
  });

  it("stops the salary and pays the policy until 65", () => {
    expect(at(2028).incomeMonthly.pay).toBeUndefined();
    expect(at(2028).incomeMonthly["di:di1"]).toBeCloseTo((5000 * 9) / 12, 6);
    expect(at(2034).incomeMonthly["di:di1"]).toBe(5000);
    expect(at(2035).incomeMonthly["di:di1"]).toBeUndefined();
  });

  it("leaves Retirement starting at the plan start", () => {
    expect(rows(h)[0].calendarYear).toBe(2036);
  });
});
