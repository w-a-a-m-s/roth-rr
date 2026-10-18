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
 * (that year's, indexed for inflation) using that year's no-conversion
 * taxable income. The engine caps at balances.
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

  const window = rows.slice(0, years).map((row, i) => {
    if (i < first) return 0;
    // That year's brackets, indexed for inflation like the projection's.
    const brackets = forFiling(
      federalTaxForYear(household, refs.federalTax, row.calendarYear).brackets,
      household.filingStatus,
      "federal brackets",
    );
    const ceiling = bracketFillCeiling(brackets, rate);
    if (!Number.isFinite(ceiling)) return 0;
    // Stay strictly below the next bracket's inclusive floor.
    const room = ceiling - row.taxableIncome - 0.01;
    return roundCents(Math.max(0, room));
  });
  return padToProjection(household, window);
}
