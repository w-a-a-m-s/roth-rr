import type { ConversionStrategy, FillBracketRate, Household } from "@/lib/domain/types";
import { FILL_BRACKET_RATES } from "@/lib/domain/types";
import type { Comparison } from "@/lib/engine/types";
import { projectionYears } from "@/lib/engine/project";
import {
  comparisonFrom,
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
  | "manual";

export interface StrategyScore {
  id: StrategyScoreId;
  strategy: ConversionStrategy;
  targetBracketRate?: FillBracketRate;
  impact: number;
}

/**
 * Same combination the results header shows as Total impact: end-of-plan
 * inheritance plus lifetime tax and Medicare Part B savings. After-tax
 * assets at RMD are the same estate snapshot as inheritance, just earlier,
 * so including them would double-count.
 */
export function totalImpact(
  deltas: Pick<
    Comparison["deltas"],
    "inheritanceFinal" | "taxesTotal" | "medicareTotal"
  >,
): number {
  return deltas.inheritanceFinal - deltas.taxesTotal - deltas.medicareTotal;
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
 * Total impact of each conversion strategy, sharing one no-conversion
 * baseline so the menu can compare options without double-projecting it.
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
    const roth = runScenario(
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
      impact: totalImpact(comparison.deltas),
    };
  });
}
