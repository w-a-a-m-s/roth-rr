import type { Household, TaxBracket } from "@/lib/domain/types";
import { forFiling } from "@/lib/config/filingStatus";
import { projectScenario } from "@/lib/engine/project";
import { conversionYears } from "@/lib/engine/convertible";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";
import type { ReferenceData } from "@/lib/externalData/types";
import { resolveBracketRate } from "@/lib/optimizer/labels";
import { padToProjection, roundCents } from "@/lib/optimizer/util";

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
 * using that year's no-conversion taxable income. The engine caps at balances.
 */
export function fillBracketSchedule(
  household: Household,
  refs: ReferenceData = FALLBACK_REFERENCE_DATA,
): number[] {
  const zeros = padToProjection(household, []);
  const rows = projectScenario(household, zeros, refs);
  const brackets = forFiling(
    refs.federalTax.brackets,
    household.filingStatus,
    "federal brackets",
  );
  const rate = resolveBracketRate(household.optimizer.targetBracketRate);
  const ceiling = bracketFillCeiling(brackets, rate);
  const years = conversionYears(household);

  const window = rows.slice(0, years).map((row) => {
    if (!Number.isFinite(ceiling)) return 0;
    // Stay strictly below the next bracket's inclusive floor.
    const room = ceiling - row.taxableIncome - 0.01;
    return roundCents(Math.max(0, room));
  });
  return padToProjection(household, window);
}
