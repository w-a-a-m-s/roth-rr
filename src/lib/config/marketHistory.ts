import sp500 from "./data/sp500Returns.json";
import treasury from "./data/treasury10yReturns.json";

/**
 * S&P 500 total returns (dividends included) by calendar year, for the
 * "Market history" return mode. A committed constant like the RMD table:
 * past years never change, and one new year is added each January (see
 * docs/external-data.md, which `external-data:check` holds to).
 */
export const SP500_SOURCE = {
  name: sp500.source,
  url: sp500.sourceUrl,
  updated: sp500.sourceUpdated,
};

export const SP500_FIRST_YEAR: number = sp500.firstYear;
export const SP500_LAST_YEAR: number = sp500.lastYear;

const RETURNS = sp500.returns as Record<string, number>;

/** The S&P 500's total return for `year` (decimal), or undefined outside the data. */
export function sp500Return(year: number): number | undefined {
  return RETURNS[String(year)];
}

const TREASURY_RETURNS = treasury.returns as Record<string, number>;

/**
 * The 10-year US Treasury bond's total return for `year` (decimal), from the
 * same Damodaran table, or undefined outside the data.
 */
export function treasury10yReturn(year: number): number | undefined {
  return TREASURY_RETURNS[String(year)];
}

/** Share of the 50 / 50 mix in the S&P 500 (the rest in 10-year Treasuries). */
export const BALANCED_STOCK_SHARE = 0.5;

/**
 * A 50% S&P 500 / 50% 10-year Treasury portfolio's return for `year`,
 * rebalanced to 50 / 50 each January, or undefined outside the data.
 */
export function balancedReturn(year: number): number | undefined {
  const stocks = sp500Return(year);
  const bonds = treasury10yReturn(year);
  if (stocks == null || bonds == null) return undefined;
  return BALANCED_STOCK_SHARE * stocks + (1 - BALANCED_STOCK_SHARE) * bonds;
}

/** Every year with its S&P 500 (`total`), Treasury and 50 / 50 return, oldest first. */
export function sp500Years(): { year: number; total: number; treasury?: number; balanced?: number }[] {
  const out: { year: number; total: number; treasury?: number; balanced?: number }[] = [];
  for (let year = SP500_FIRST_YEAR; year <= SP500_LAST_YEAR; year++) {
    const total = sp500Return(year);
    if (total == null) continue;
    out.push({ year, total, treasury: treasury10yReturn(year), balanced: balancedReturn(year) });
  }
  return out;
}
