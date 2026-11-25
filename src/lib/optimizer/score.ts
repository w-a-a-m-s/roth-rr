import type { ConversionStrategy, FillBracketRate, Household } from "@/lib/domain/types";
import { FILL_BRACKET_RATES } from "@/lib/domain/types";
import { projectionYears } from "@/lib/engine/project";
import {
  comparisonFrom,
  runRothScenario,
  runScenario,
} from "@/lib/engine/runScenario";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";
import type { ReferenceData } from "@/lib/externalData/types";
import { buildConversionSchedule } from "@/lib/optimizer";

export type StrategyScoreId =
  | "even"
  | "immediate"
  | "fillBracket:0.12"
  | "fillBracket:0.22"
  | "fillBracket:0.24"
  | "irmaa"
  | "depleteByRmd"
  | "minTax"
  | "manual";

export interface StrategyScore {
  id: StrategyScoreId;
  strategy: ConversionStrategy;
  targetBracketRate?: FillBracketRate;
  /** Lifetime taxes with this strategy minus no conversion (negative saves). */
  taxesTotal: number;
  /** After-tax assets at the RMD age with this strategy minus no conversion. */
  afterTaxAssetsAtRmd: number;
}

function scoreId(
  strategy: ConversionStrategy,
  rate?: FillBracketRate,
): StrategyScoreId {
  if (strategy === "fillBracket") {
    const r = rate ?? 0.22;
    return `fillBracket:${r}` as StrategyScoreId;
  }
  return strategy as StrategyScoreId;
}

/**
 * Each conversion strategy's change in lifetime taxes and in after-tax
 * assets at the RMD age versus no conversion, sharing one no-conversion
 * baseline so the menu can compare options without double-projecting it.
 * (A single combined score was dropped at the user's request: adding tax
 * savings to the estate counts them twice when leftover money is saved.)
 */
export function scoreConversionStrategies(
  household: Household,
  refs: ReferenceData = FALLBACK_REFERENCE_DATA,
): StrategyScore[] {
  const n = projectionYears(household);
  const zeros = Array.from({ length: Math.max(0, n) }, () => 0);
  const baseline = runScenario(household, zeros, "No Roth conversion", refs);

  const options: Array<{
    strategy: ConversionStrategy;
    targetBracketRate?: FillBracketRate;
  }> = [
    { strategy: "manual" },
    { strategy: "even" },
    { strategy: "immediate" },
    ...FILL_BRACKET_RATES.map((targetBracketRate) => ({
      strategy: "fillBracket" as const,
      targetBracketRate,
    })),
    { strategy: "irmaa" },
    { strategy: "depleteByRmd" },
    { strategy: "minTax" },
  ];

  return options.map((opt) => {
    const scored: Household = {
      ...household,
      optimizer: {
        ...household.optimizer,
        strategy: opt.strategy,
        targetBracketRate:
          opt.targetBracketRate ?? household.optimizer.targetBracketRate,
      },
    };
    const schedule = buildConversionSchedule(scored, refs);
    // Same Roth run as the results (with any one-time conversion), so the
    // menu's impact matches what the plan shows.
    const roth = runRothScenario(
      household,
      schedule,
      "With Roth conversion",
      refs,
    );
    const comparison = comparisonFrom(baseline, roth);
    return {
      id: scoreId(opt.strategy, opt.targetBracketRate),
      strategy: opt.strategy,
      targetBracketRate: opt.targetBracketRate,
      taxesTotal: comparison.deltas.taxesTotal,
      afterTaxAssetsAtRmd: comparison.deltas.afterTaxAssetsAtRmd,
    };
  });
}
