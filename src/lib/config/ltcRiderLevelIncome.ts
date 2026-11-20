/**
 * The LTC rider's income table: the Level Income Option payout rates, by
 * issue age (rows) and number of completed contract years (columns), as the
 * user supplied them. A rider account's lifetime income is its balance when
 * the income starts times this rate, fixed for life; while its owner is in
 * long-term care the income is doubled, for at most
 * `LTC_RIDER_DOUBLED_YEARS` years (see `lib/domain/longTermCare.ts`).
 *
 * The contract is taken as issued at the plan start, so the issue age is the
 * income recipient's age that year and the completed years are the years
 * from the plan start to the first income year.
 */

/** Completed contract years each column is for. */
export const LEVEL_INCOME_YEARS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20] as const;

const NA = null;

/** Payout rate by issue age, one entry per `LEVEL_INCOME_YEARS` column. N/A is null. */
export const LEVEL_INCOME_BY_ISSUE_AGE: Record<number, (number | null)[]> = {
  35: [NA, NA, NA, NA, NA, NA, NA, NA, NA, NA, NA, 0.0545, 0.06],
  40: [NA, NA, NA, NA, NA, NA, NA, NA, NA, NA, 0.056, 0.06, 0.0745],
  45: [NA, NA, NA, NA, NA, 0.0565, 0.057, 0.0575, 0.058, 0.0595, 0.06, 0.0695, 0.085],
  50: [0.0605, 0.061, 0.0615, 0.062, 0.0625, 0.063, 0.0635, 0.064, 0.0645, 0.0655, 0.066, 0.0775, 0.093],
  51: [0.061, 0.0615, 0.062, 0.0625, 0.063, 0.0635, 0.064, 0.0645, 0.065, 0.0665, 0.068, 0.079, 0.0945],
  52: [0.062, 0.0625, 0.063, 0.0635, 0.064, 0.0645, 0.065, 0.0655, 0.066, 0.068, 0.0695, 0.0805, 0.096],
  53: [0.063, 0.0635, 0.064, 0.0645, 0.065, 0.0655, 0.066, 0.0665, 0.067, 0.0695, 0.071, 0.082, 0.0975],
  54: [0.064, 0.0645, 0.065, 0.0655, 0.066, 0.0665, 0.067, 0.0675, 0.069, 0.071, 0.0725, 0.0835, 0.099],
  55: [0.065, 0.0655, 0.066, 0.0665, 0.067, 0.0675, 0.068, 0.0685, 0.07, 0.0715, 0.0735, 0.085, 0.1005],
  56: [0.066, 0.0665, 0.067, 0.0675, 0.068, 0.0685, 0.069, 0.0695, 0.0705, 0.0725, 0.0745, 0.086, 0.102],
  57: [0.067, 0.0675, 0.068, 0.0685, 0.069, 0.0695, 0.07, 0.0705, 0.071, 0.073, 0.0755, 0.0875, 0.103],
  58: [0.068, 0.0685, 0.069, 0.0695, 0.07, 0.0705, 0.071, 0.0715, 0.072, 0.0745, 0.0765, 0.089, 0.104],
  59: [0.0685, 0.069, 0.0695, 0.07, 0.0705, 0.071, 0.072, 0.0725, 0.073, 0.075, 0.078, 0.09, 0.105],
  60: [0.069, 0.0695, 0.07, 0.0705, 0.0715, 0.0725, 0.073, 0.0735, 0.074, 0.076, 0.079, 0.091, 0.106],
  61: [0.0705, 0.071, 0.0715, 0.072, 0.073, 0.0735, 0.074, 0.0745, 0.075, 0.0775, 0.0805, 0.092, 0.107],
  62: [0.0715, 0.0725, 0.073, 0.0735, 0.074, 0.0745, 0.075, 0.0755, 0.076, 0.079, 0.082, 0.0935, 0.1095],
  63: [0.073, 0.0735, 0.0745, 0.075, 0.0755, 0.076, 0.0765, 0.077, 0.0775, 0.0805, 0.0835, 0.0945, 0.112],
  64: [0.0745, 0.075, 0.0755, 0.076, 0.0765, 0.077, 0.0775, 0.078, 0.0785, 0.0815, 0.0845, 0.0955, 0.1145],
  65: [0.076, 0.0765, 0.077, 0.0775, 0.078, 0.0785, 0.079, 0.0795, 0.08, 0.083, 0.086, 0.0965, 0.117],
  66: [0.0775, 0.078, 0.0785, 0.079, 0.0795, 0.08, 0.0805, 0.081, 0.0815, 0.0845, 0.0885, 0.0995, 0.119],
  67: [0.078, 0.0785, 0.079, 0.0795, 0.08, 0.0805, 0.082, 0.0825, 0.083, 0.0855, 0.0895, 0.102, 0.1205],
  68: [0.0795, 0.08, 0.0805, 0.081, 0.0815, 0.082, 0.083, 0.085, 0.0855, 0.087, 0.09, 0.1065, 0.122],
  69: [0.0815, 0.082, 0.0825, 0.083, 0.0835, 0.084, 0.085, 0.087, 0.0875, 0.089, 0.092, 0.1105, 0.1235],
  70: [0.083, 0.0835, 0.084, 0.0845, 0.085, 0.0855, 0.0865, 0.0885, 0.09, 0.0915, 0.0945, 0.1145, 0.125],
  71: [0.084, 0.0845, 0.085, 0.0855, 0.086, 0.0865, 0.088, 0.0905, 0.092, 0.0935, 0.097, 0.119, 0.127],
  72: [0.0855, 0.086, 0.0865, 0.087, 0.0875, 0.0885, 0.09, 0.0925, 0.0945, 0.096, 0.1, 0.1205, 0.129],
  73: [0.0865, 0.087, 0.0875, 0.088, 0.0885, 0.09, 0.0925, 0.095, 0.0965, 0.098, 0.102, 0.122, 0.1315],
  74: [0.088, 0.0885, 0.089, 0.0895, 0.09, 0.092, 0.094, 0.097, 0.0985, 0.1, 0.104, 0.123, 0.1345],
  75: [0.089, 0.0895, 0.09, 0.0905, 0.091, 0.0935, 0.096, 0.099, 0.1, 0.1015, 0.1055, 0.1245, 0.1395],
  76: [0.09, 0.0905, 0.091, 0.093, 0.094, 0.095, 0.0975, 0.1005, 0.102, 0.1035, 0.1075, 0.1255, NA],
  77: [0.0915, 0.092, 0.0935, 0.094, 0.095, 0.097, 0.0995, 0.1025, 0.104, 0.1055, 0.1095, 0.127, NA],
  78: [0.0925, 0.093, 0.094, 0.095, 0.096, 0.0985, 0.1015, 0.1045, 0.107, 0.1085, 0.1125, 0.128, NA],
  79: [0.0945, 0.095, 0.0955, 0.096, 0.097, 0.1005, 0.104, 0.1075, 0.11, 0.1115, 0.1155, 0.129, NA],
  80: [0.0965, 0.097, 0.0975, 0.098, 0.099, 0.1025, 0.106, 0.1095, 0.113, 0.1155, 0.1195, 0.1305, NA],
};

const ISSUE_AGES = Object.keys(LEVEL_INCOME_BY_ISSUE_AGE)
  .map(Number)
  .sort((a, b) => a - b);

/**
 * Payout rate for a contract issued at `issueAge` with `completedYears`
 * contract years done when the income starts.
 *
 * - Issue age: the listed row at or below it (35 for younger, 80 for older).
 * - Years: the listed column at or below it (11 to 14 read 10, past 20 read 20).
 * - An N/A cell reads the nearest listed column in that row that has a rate,
 *   the lower one on a tie.
 */
export function levelIncomeRate(issueAge: number, completedYears: number): number {
  const age = Number.isFinite(issueAge) ? Math.floor(issueAge) : ISSUE_AGES[ISSUE_AGES.length - 1];
  const rowAge = [...ISSUE_AGES].reverse().find((a) => a <= age) ?? ISSUE_AGES[0];
  const row = LEVEL_INCOME_BY_ISSUE_AGE[rowAge];
  const years = Math.max(0, Number.isFinite(completedYears) ? Math.floor(completedYears) : 0);
  let col = 0;
  for (let c = 0; c < LEVEL_INCOME_YEARS.length; c++) {
    if (LEVEL_INCOME_YEARS[c] <= years) col = c;
  }
  if (row[col] != null) return row[col] as number;
  for (let d = 1; d < row.length; d++) {
    const below = row[col - d];
    if (below != null) return below;
    const above = row[col + d];
    if (above != null) return above;
  }
  return 0;
}
