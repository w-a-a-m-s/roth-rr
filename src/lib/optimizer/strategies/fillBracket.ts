import type { Household, TaxBracket } from "@/lib/domain/types";
import { forFiling } from "@/lib/config/filingStatus";
import { projectScenario } from "@/lib/engine/project";
import { conversionYears } from "@/lib/engine/convertible";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";
import type { ReferenceData } from "@/lib/externalData/types";
import { resolveBracketRate } from "@/lib/optimizer/labels";
import { federalTaxForYear } from "@/lib/engine/taxIndexing";
import {
  padToProjection,
  roundCents,
  strategyStartIndex,
} from "@/lib/optimizer/util";

/** Most re-projections spent settling each year onto its ceiling. */
const MAX_PASSES = 12;

/** A year is filled once it's this close under its ceiling. */
const FILLED_WITHIN = 1;

/**
 * Steepest taxable income per converted dollar the step trusts: 1, plus up to
 * 0.85 of Social Security, 0.5 of the rental-loss allowance and a bit more.
 */
const MAX_SLOPE = 3;

/**
 * Taxable-income ceiling that stays inside `rate`: the next bracket's floor.
 * Returns Infinity when `rate` is the top published bracket.
 */
export function bracketFillCeiling(
  brackets: TaxBracket[],
  rate: number,
): number {
  const idx = brackets.findIndex((b) => b.rate === rate);
  if (idx < 0) return 0;
  if (idx >= brackets.length - 1) return Number.POSITIVE_INFINITY;
  return brackets[idx + 1].floor;
}

/**
 * Each conversion year: convert enough to fill the target federal bracket
 * (that year's, indexed for inflation) and never more.
 *
 * A converted dollar can add more than a dollar of taxable income: it phases
 * out the senior deduction, makes more Social Security taxable, and shrinks
 * the rental-loss allowance. It can also add less, while unused deductions
 * absorb it. So the room under the ceiling with no conversion is only a first
 * guess: each pass re-projects with the schedule and moves every year by its
 * gap to the ceiling over its measured slope, then the last passes back off
 * any year still over. The engine caps at balances.
 */
export function fillBracketSchedule(
  household: Household,
  refs: ReferenceData = FALLBACK_REFERENCE_DATA,
): number[] {
  const zeros = padToProjection(household, []);
  const rows = projectScenario(household, zeros, refs);
  const rate = resolveBracketRate(household.optimizer.targetBracketRate);
  const years = conversionYears(household);
  const first = strategyStartIndex(household);

  // The most taxable income each year can have and stay in the bracket:
  // strictly below the next bracket's inclusive floor. Null skips the year.
  const targets = rows.slice(0, years).map((row, i) => {
    if (i < first) return null;
    // That year's brackets, indexed for inflation like the projection's.
    const brackets = forFiling(
      federalTaxForYear(household, refs.federalTax, row.calendarYear).brackets,
      household.filingStatus,
      "federal brackets",
    );
    const ceiling = bracketFillCeiling(brackets, rate);
    if (!Number.isFinite(ceiling)) return null;
    return ceiling - 0.01;
  });

  let schedule = padToProjection(
    household,
    targets.map((target, i) =>
      target == null ? 0 : roundCents(Math.max(0, target - rows[i].taxableIncome)),
    ),
  );
  // Each year's previous (conversion, taxable income) point, for its slope.
  const previous = rows.map((row) => ({ amount: 0, income: row.taxableIncome }));

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const projected = projectScenario(household, schedule, refs);
    // The last two passes only back off: they guarantee no year is left over.
    const backOffOnly = pass >= MAX_PASSES - 2;
    const next = schedule.slice();
    let settled = true;
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      if (target == null) continue;
      const row = projected[i];
      const gap = target - row.taxableIncome;
      // Converted less than scheduled: the accounts ran dry.
      const capped = row.conversion < schedule[i] - 0.005;
      if (gap >= 0 && (gap < FILLED_WITHIN || capped || backOffOnly)) continue;
      // Over without converting: income alone is past the bracket.
      if (gap < 0 && row.conversion <= 0) continue;
      settled = false;
      const run = row.conversion - previous[i].amount;
      const rise = row.taxableIncome - previous[i].income;
      const measured = Math.abs(run) > 1 ? rise / run : 1;
      // Past the deductions every converted dollar adds at least a dollar of
      // taxable income, so backing off by the whole overshoot (slope 1)
      // always lands at or under the ceiling.
      const slope = backOffOnly ? 1 : Math.min(MAX_SLOPE, Math.max(1, measured));
      const step = gap / slope;
      previous[i] = { amount: row.conversion, income: row.taxableIncome };
      next[i] = roundCents(Math.max(0, row.conversion + step));
    }
    if (settled) break;
    schedule = next;
  }
  return schedule;
}
