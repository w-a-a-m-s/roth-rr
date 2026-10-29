/**
 * The income table: payout rates for turning money into guaranteed lifetime
 * income. It pays the life insurance death benefit in the Survivorship
 * analysis, every account's lifetime income in Survivorship and Long-term
 * care, and any account withdrawal set to the income table on the Income step.
 *
 * Source: Transamerica Structured Index Advantage Income Annuity, Income
 * Advantage with optional Step-Up Benefit, Joint Life (1.55% fee), the
 * "Immediate Payout %" column (flyer 5182416R1, 10/26, page 2). The rate is
 * picked by age when the income starts and stays fixed for life (guaranteed,
 * non-reducing income).
 */

/** Immediate payout rate by age, ages 59 to 86. */
export const LIFE_INSURANCE_PAYOUT_BY_AGE: Record<number, number> = {
  59: 0.052,
  60: 0.053,
  61: 0.054,
  62: 0.055,
  63: 0.056,
  64: 0.057,
  65: 0.058,
  66: 0.059,
  67: 0.06,
  68: 0.061,
  69: 0.062,
  70: 0.063,
  71: 0.064,
  72: 0.065,
  73: 0.066,
  74: 0.067,
  75: 0.068,
  76: 0.069,
  77: 0.07,
  78: 0.071,
  79: 0.072,
  80: 0.073,
  81: 0.074,
  82: 0.075,
  83: 0.076,
  84: 0.077,
  85: 0.078,
  86: 0.078,
};

/** Below the table's youngest age (59) the payout is a flat 5%. */
export const LIFE_INSURANCE_PAYOUT_UNDER_59 = 0.05;

const YOUNGEST = 59;
const OLDEST = 86;

/** Yearly growth of the death benefit once it's invested. */
export const LIFE_INSURANCE_PROCEEDS_GROWTH = 0.08;

/**
 * Yearly payout rate for a death at `age`. Under 59 it's 5%; past 86 (the
 * table's last immediate payout) it holds at the age 86 rate.
 */
export function lifeInsurancePayoutRate(age: number): number {
  if (!Number.isFinite(age)) return LIFE_INSURANCE_PAYOUT_UNDER_59;
  const whole = Math.floor(age);
  if (whole < YOUNGEST) return LIFE_INSURANCE_PAYOUT_UNDER_59;
  return LIFE_INSURANCE_PAYOUT_BY_AGE[Math.min(whole, OLDEST)];
}

/** One row of the income table as the app shows it. */
export interface IncomeTableRow {
  /** "Under 59", "59" ... "86", "87+". */
  ageLabel: string;
  rate: number;
  /** The ages the row covers, inclusive (`max` Infinity for the last row). */
  minAge: number;
  maxAge: number;
}

/** The whole table by age, with the under-59 and past-86 rows around it. */
export function incomeTableRows(): IncomeTableRow[] {
  const rows: IncomeTableRow[] = [
    { ageLabel: `Under ${YOUNGEST}`, rate: LIFE_INSURANCE_PAYOUT_UNDER_59, minAge: -Infinity, maxAge: YOUNGEST - 1 },
  ];
  for (let age = YOUNGEST; age <= OLDEST; age++) {
    rows.push({ ageLabel: String(age), rate: LIFE_INSURANCE_PAYOUT_BY_AGE[age], minAge: age, maxAge: age });
  }
  rows.push({
    ageLabel: `${OLDEST + 1}+`,
    rate: LIFE_INSURANCE_PAYOUT_BY_AGE[OLDEST],
    minAge: OLDEST + 1,
    maxAge: Infinity,
  });
  return rows;
}
