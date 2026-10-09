import type { ConversionStrategy, Household } from "@/lib/domain/types";
import { FILL_BRACKET_RATES } from "@/lib/domain/types";
import { conversionYears, convertibleTotal } from "@/lib/engine/convertible";
import { runScenario } from "@/lib/engine/runScenario";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";
import type { ReferenceData } from "@/lib/externalData/types";
import { depleteByRmdSchedule } from "@/lib/optimizer/strategies/depleteByRmd";
import { evenSchedule } from "@/lib/optimizer/strategies/even";
import { fillBracketSchedule } from "@/lib/optimizer/strategies/fillBracket";
import { immediateSchedule } from "@/lib/optimizer/strategies/immediate";
import { irmaaSchedule } from "@/lib/optimizer/strategies/irmaa";
import { padToProjection } from "@/lib/optimizer/util";

/** Smallest step the year-by-year search tries, in dollars. */
const MIN_STEP = 500;
/** Sweeps over the years at each step size before halving it. */
const MAX_PASSES = 3;
/** An improvement has to beat this many dollars to count (ignores noise). */
const MIN_GAIN = 1;

/**
 * Lifetime federal + state income tax for a conversion schedule: the same
 * total the results show as Lifetime taxes.
 */
export function lifetimeTaxes(
  household: Household,
  schedule: number[],
  refs: ReferenceData,
): number {
  return runScenario(household, schedule, "Minimum taxes", refs).totals
    .taxesTotal;
}

/**
 * The conversion schedule with the lowest lifetime income tax (federal +
 * state through the end of the plan). Tax on tax-deferred money still left
 * at the end, Medicare premiums, and the size of the inheritance are not part
 * of the target: this is purely "pay the least tax while you're alive".
 *
 * It starts from the best of no conversion and every other strategy, then
 * walks the conversion years one at a time, nudging each year's amount up or
 * down and keeping any change that lowers lifetime tax. The step halves until
 * it reaches $500.
 */
export function minTaxSchedule(
  household: Household,
  refs: ReferenceData = FALLBACK_REFERENCE_DATA,
): number[] {
  // The search runs a few hundred projections, and the results view and the
  // strategy menu both ask for it on every edit: reuse the last answer when
  // nothing but the strategy choice changed.
  const key = cacheKey(household);
  if (cache && cache.refs === refs && cache.key === key) return cache.schedule.slice();
  const schedule = searchMinTax(household, refs);
  cache = { refs, key, schedule };
  return schedule.slice();
}

let cache: { refs: ReferenceData; key: string; schedule: number[] } | null =
  null;

function cacheKey(household: Household): string {
  // The schedule doesn't depend on which strategy is selected.
  return JSON.stringify({ ...household, optimizer: null });
}

function searchMinTax(household: Household, refs: ReferenceData): number[] {
  const zeros = padToProjection(household, []);
  const years = Math.min(conversionYears(household), zeros.length);
  if (years < 1) return zeros;

  const as = (strategy: ConversionStrategy, extra = {}): Household => ({
    ...household,
    optimizer: { strategy, ...extra },
  });
  const starts: number[][] = [
    zeros,
    evenSchedule(as("even"), refs.asOfDate),
    immediateSchedule(as("immediate"), refs.asOfDate),
    ...FILL_BRACKET_RATES.map((targetBracketRate) =>
      fillBracketSchedule(as("fillBracket", { targetBracketRate }), refs),
    ),
    irmaaSchedule(as("irmaa"), refs),
    depleteByRmdSchedule(as("depleteByRmd"), refs.asOfDate),
  ];

  let best = zeros;
  let bestTax = Number.POSITIVE_INFINITY;
  for (const start of starts) {
    const schedule = padToProjection(household, start);
    const tax = lifetimeTaxes(household, schedule, refs);
    if (tax >= bestTax) continue;
    best = schedule;
    bestTax = tax;
  }

  const convertible = convertibleTotal(household, refs.asOfDate);
  let step = Math.max(MIN_STEP, Math.round(convertible / 5));
  while (step >= MIN_STEP) {
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      let improved = false;
      for (let i = 0; i < years; i++) {
        for (const delta of [step, -step]) {
          const amount = Math.max(0, Math.round(best[i] + delta));
          if (amount === best[i]) continue;
          const trial = best.slice();
          trial[i] = amount;
          const tax = lifetimeTaxes(household, trial, refs);
          if (tax > bestTax - MIN_GAIN) continue;
          best = trial;
          bestTax = tax;
          improved = true;
        }
      }
      if (!improved) break;
    }
    step = Math.floor(step / 2);
  }
  return best;
}
