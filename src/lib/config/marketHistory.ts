import sp500 from "./data/sp500Returns.json";

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

/** Every year with its return, oldest first. */
export function sp500Years(): { year: number; total: number }[] {
  const out: { year: number; total: number }[] = [];
  for (let year = SP500_FIRST_YEAR; year <= SP500_LAST_YEAR; year++) {
    const total = sp500Return(year);
    if (total != null) out.push({ year, total });
  }
  return out;
}
