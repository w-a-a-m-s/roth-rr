/**
 * Payout rates for turning a life insurance death benefit into lifetime
 * income in the Survivorship analysis.
 *
 * Source: Transamerica Structured Index Advantage Income Annuity, Income
 * Advantage with optional Step-Up Benefit, Single Life (1.45% fee), the
 * "Immediate Payout %" column (flyer 5182416R1, 06/26). The rate is picked by
 * age at death and stays fixed for life (guaranteed, non-reducing income).
 */

/** Immediate payout rate by age, ages 59 to 86. */
export const LIFE_INSURANCE_PAYOUT_BY_AGE: Record<number, number> = {
  59: 0.057,
  60: 0.058,
  61: 0.059,
  62: 0.06,
  63: 0.061,
  64: 0.062,
  65: 0.063,
  66: 0.064,
  67: 0.065,
  68: 0.066,
  69: 0.067,
  70: 0.068,
  71: 0.069,
  72: 0.07,
  73: 0.071,
  74: 0.072,
  75: 0.073,
  76: 0.074,
  77: 0.075,
  78: 0.076,
  79: 0.077,
  80: 0.078,
  81: 0.079,
  82: 0.08,
  83: 0.081,
  84: 0.082,
  85: 0.083,
  86: 0.083,
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
