import type { FilingStatus } from "@/lib/domain/types";
import {
  ADDITIONAL_MEDICARE_RATE,
  ADDITIONAL_MEDICARE_THRESHOLD,
  EMPLOYEE_MEDICARE_RATE,
  EMPLOYEE_SOCIAL_SECURITY_RATE,
  SELF_EMPLOYMENT_EARNINGS_SHARE,
  SELF_EMPLOYMENT_MEDICARE_RATE,
  SELF_EMPLOYMENT_SOCIAL_SECURITY_RATE,
  SELF_EMPLOYMENT_TAX_MINIMUM,
} from "@/lib/config/federalTax";

/** One person's earned income for the year. */
export interface EarnedIncome {
  /** Salary (W-2 wages). */
  wages: number;
  /** Business profit (self-employment income, before the 92.35% share). */
  business: number;
}

export interface EmploymentTax {
  /** Social Security part: employee 6.2% of wages, self-employed 12.4%. */
  socialSecurity: number;
  /** Medicare part: employee 1.45% of wages, self-employed 2.9%. */
  medicare: number;
  /** 0.9% on wages and self-employment income over the filing threshold. */
  additionalMedicare: number;
  total: number;
  /**
   * Half of the self-employment tax (without the additional Medicare tax),
   * taken off income before the standard deduction, as on Schedule SE.
   */
  selfEmploymentDeduction: number;
}

const NONE: EmploymentTax = {
  socialSecurity: 0,
  medicare: 0,
  additionalMedicare: 0,
  total: 0,
  selfEmploymentDeduction: 0,
};

/**
 * Employee FICA on wages plus self-employment tax on business income, the way
 * Schedule SE and Form 8959 figure them. The Social Security part stops at
 * the wage base, per person: wages use it up first, then self-employment
 * earnings get what's left. Medicare has no cap. The additional 0.9% Medicare
 * tax is figured on the household's combined wages and self-employment
 * earnings above the threshold, wages first. A business loss doesn't lower
 * the tax on wages.
 */
export function employmentTax(
  earnedByPerson: Record<string, EarnedIncome>,
  filingStatus: FilingStatus,
  wageBase: number,
): EmploymentTax {
  let socialSecurity = 0;
  let medicare = 0;
  let selfEmploymentTax = 0;
  let totalWages = 0;
  let totalSelfEmployment = 0;
  for (const earned of Object.values(earnedByPerson)) {
    const wages = Math.max(0, earned.wages);
    totalWages += wages;
    socialSecurity += EMPLOYEE_SOCIAL_SECURITY_RATE * Math.min(wages, wageBase);
    medicare += EMPLOYEE_MEDICARE_RATE * wages;

    const net = Math.max(0, earned.business) * SELF_EMPLOYMENT_EARNINGS_SHARE;
    if (net < SELF_EMPLOYMENT_TAX_MINIMUM) continue;
    totalSelfEmployment += net;
    const room = Math.max(0, wageBase - wages);
    const seSocialSecurity = SELF_EMPLOYMENT_SOCIAL_SECURITY_RATE * Math.min(net, room);
    const seMedicare = SELF_EMPLOYMENT_MEDICARE_RATE * net;
    socialSecurity += seSocialSecurity;
    medicare += seMedicare;
    selfEmploymentTax += seSocialSecurity + seMedicare;
  }
  if (totalWages <= 0 && totalSelfEmployment <= 0) return NONE;

  const threshold = ADDITIONAL_MEDICARE_THRESHOLD[filingStatus];
  const additionalMedicare =
    ADDITIONAL_MEDICARE_RATE *
    (Math.max(0, totalWages - threshold) +
      Math.max(0, totalSelfEmployment - Math.max(0, threshold - totalWages)));
  return {
    socialSecurity,
    medicare,
    additionalMedicare,
    total: socialSecurity + medicare + additionalMedicare,
    selfEmploymentDeduction: selfEmploymentTax / 2,
  };
}
