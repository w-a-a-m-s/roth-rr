/**
 * IRS Uniform Lifetime Table (Pub. 590-B, Appendix B, Table III): the applicable
 * denominator used to figure a lifetime RMD. The RMD for a year is the account
 * balance as of December 31 of the preceding year divided by the denominator for
 * the owner's age in that year.
 *
 * Table III is the right table for this model: it covers unmarried owners,
 * owners whose spouse isn't more than 10 years younger, and owners whose spouse
 * isn't the sole beneficiary. Table II (Joint and Last Survivor) applies only
 * when the sole beneficiary is a spouse more than 10 years younger, and plans
 * here don't record beneficiary designations.
 *
 * Unlike the tax and Medicare tables, this one isn't on an annual cadence. The
 * IRS reissues the life expectancy tables rarely (last effective 2022), so it
 * ships as a committed constant rather than an external dataset. See
 * docs/external-data.md.
 *
 * Source: https://www.irs.gov/publications/p590b
 */
const UNIFORM_LIFETIME_DENOMINATORS: Record<number, number> = {
  72: 27.4,
  73: 26.5,
  74: 25.5,
  75: 24.6,
  76: 23.7,
  77: 22.9,
  78: 22.0,
  79: 21.1,
  80: 20.2,
  81: 19.4,
  82: 18.5,
  83: 17.7,
  84: 16.8,
  85: 16.0,
  86: 15.2,
  87: 14.4,
  88: 13.7,
  89: 12.9,
  90: 12.2,
  91: 11.5,
  92: 10.8,
  93: 10.1,
  94: 9.5,
  95: 8.9,
  96: 8.4,
  97: 7.8,
  98: 7.3,
  99: 6.8,
  100: 6.4,
  101: 6.0,
  102: 5.6,
  103: 5.2,
  104: 4.9,
  105: 4.6,
  106: 4.3,
  107: 4.1,
  108: 3.9,
  109: 3.7,
  110: 3.5,
  111: 3.4,
  112: 3.3,
  113: 3.1,
  114: 3.0,
  115: 2.9,
  116: 2.8,
  117: 2.7,
  118: 2.5,
  119: 2.3,
};

/** Youngest and oldest ages the published table lists. */
export const UNIFORM_LIFETIME_MIN_AGE = 72;
export const UNIFORM_LIFETIME_MAX_AGE = 120;

/** The table's terminal row, "120 and over". */
const UNIFORM_LIFETIME_MAX_AGE_DENOMINATOR = 2.0;

/**
 * Applicable denominator for an owner's age. Ages at or past the table's last
 * row use "120 and over"; younger ages clamp to the first row, which only comes
 * up for a plan whose RMD starting age predates the table (the engine never
 * takes an RMD before the owner's starting age).
 */
export function uniformLifetimeDenominator(age: number): number {
  if (!Number.isFinite(age)) return UNIFORM_LIFETIME_MAX_AGE_DENOMINATOR;
  const whole = Math.floor(age);
  if (whole >= UNIFORM_LIFETIME_MAX_AGE) {
    return UNIFORM_LIFETIME_MAX_AGE_DENOMINATOR;
  }
  if (whole <= UNIFORM_LIFETIME_MIN_AGE) {
    return UNIFORM_LIFETIME_DENOMINATORS[UNIFORM_LIFETIME_MIN_AGE];
  }
  return UNIFORM_LIFETIME_DENOMINATORS[whole];
}

/**
 * The RMD as a share of the prior year-end balance, for labels and copy. The
 * engine divides by the denominator directly.
 */
export function uniformLifetimeRate(age: number): number {
  return 1 / uniformLifetimeDenominator(age);
}
