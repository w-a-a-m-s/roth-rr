import type { FilingStatus } from "@/lib/domain/types";
import {
  NET_INVESTMENT_INCOME_TAX_RATE,
  NET_INVESTMENT_INCOME_TAX_THRESHOLD,
} from "@/lib/config/federalTax";
import { forFiling } from "@/lib/config/filingStatus";

/**
 * Net investment income tax (Form 8960): 3.8% of the smaller of net
 * investment income and MAGI over the filing status's threshold. A net
 * investment loss owes nothing. Wages, self-employment income, Social
 * Security, IRA distributions and Roth conversions aren't investment income,
 * but they're in MAGI, so they can push investment income over the line.
 */
export function netInvestmentIncomeTax(
  netInvestmentIncome: number,
  magi: number,
  filingStatus: FilingStatus,
): number {
  if (!(netInvestmentIncome > 0)) return 0;
  const threshold = forFiling(
    NET_INVESTMENT_INCOME_TAX_THRESHOLD,
    filingStatus,
    "net investment income tax threshold",
  );
  const over = Math.max(0, magi - threshold);
  return NET_INVESTMENT_INCOME_TAX_RATE * Math.min(netInvestmentIncome, over);
}
