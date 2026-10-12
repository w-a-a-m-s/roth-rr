import type { Household } from "@/lib/domain/types";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";
import type { ReferenceData } from "@/lib/externalData/types";
import { evenSchedule } from "@/lib/optimizer/strategies/even";
import { fillBracketSchedule } from "@/lib/optimizer/strategies/fillBracket";
import { immediateSchedule } from "@/lib/optimizer/strategies/immediate";
import { irmaaSchedule } from "@/lib/optimizer/strategies/irmaa";
import { depleteByRmdSchedule } from "@/lib/optimizer/strategies/depleteByRmd";
import { manualSchedule } from "@/lib/optimizer/strategies/manual";
import { minTaxSchedule } from "@/lib/optimizer/strategies/minTax";
import { capConversionsToShortfall } from "@/lib/optimizer/shortfall";
import {
  clearBeforeRetirement,
  convertibleTotal,
  roundCents,
  strategyStartIndex,
} from "@/lib/optimizer/util";
import { projectionStartYear } from "@/lib/engine/project";
import { typedEarlyConversions } from "@/lib/engine/runScenario";

/**
 * Resolve the household's optimizer config into a concrete per-year conversion
 * schedule. Every strategy returns the same `number[]` shape so the engine
 * treats them identically. With `maxMonthlyShortfall` set, each year's amount
 * is then lowered so the conversion's tax doesn't leave the year short by more
 * than that per month.
 */
export function buildConversionSchedule(
  household: Household,
  refs: ReferenceData = FALLBACK_REFERENCE_DATA,
): number[] {
  // Years before the first retirement year are manual only: a strategy never
  // converts there, only amounts the user typed into a manual schedule.
  const raw = strategySchedule(household, refs);
  const schedule =
    household.optimizer.strategy === "manual"
      ? raw
      : clearBeforeRetirement(household, raw);
  const limit = household.optimizer.maxMonthlyShortfall;
  const capped =
    limit == null
      ? schedule
      : capConversionsToShortfall(household, schedule, limit, refs);
  return fitTypedConversions(household, capped, refs);
}

/**
 * Put the amounts the user typed for the years before the strategy starts
 * into the schedule (they win over a manual schedule's own value there).
 * When typed amounts plus the strategy's would convert more than the
 * convertible total, the strategy's amounts are lowered from the latest year
 * back. Lowering keeps every year inside its strategy's limit (bracket,
 * IRMAA tier, shortfall cap). Manual schedules and over-convertible plans
 * are left as entered.
 */
function fitTypedConversions(
  household: Household,
  schedule: number[],
  refs: ReferenceData,
): number[] {
  const typed = typedEarlyConversions(household, refs.asOfDate);
  if (typed.length === 0) return schedule;
  const start = projectionStartYear(household);
  const next = schedule.slice();
  for (const c of typed) {
    const i = c.year - start;
    if (i >= 0 && i < next.length) next[i] = c.amount;
  }
  if (household.optimizer.strategy === "manual") return next;
  if (household.optimizer.allowOverConvertible === true) return next;

  const first = strategyStartIndex(household);
  const typedTotal = typed.reduce((sum, c) => sum + c.amount, 0);
  const strategyTotal = next.slice(first).reduce((sum, v) => sum + v, 0);
  let excess = typedTotal + strategyTotal - convertibleTotal(household, refs.asOfDate);
  for (let i = next.length - 1; i >= first && excess > 0.005; i--) {
    const cut = Math.min(next[i], excess);
    next[i] = roundCents(next[i] - cut);
    excess -= cut;
  }
  return next;
}

function strategySchedule(
  household: Household,
  refs: ReferenceData,
): number[] {
  switch (household.optimizer.strategy) {
    case "immediate":
      return immediateSchedule(household, refs.asOfDate);
    case "fillBracket":
      return fillBracketSchedule(household, refs);
    case "irmaa":
      return irmaaSchedule(household, refs);
    case "depleteByRmd":
      return depleteByRmdSchedule(household, refs.asOfDate);
    case "minTax":
      return minTaxSchedule(household, refs);
    case "manual":
      return manualSchedule(household, refs.asOfDate);
    case "even":
    default:
      return evenSchedule(household, refs.asOfDate);
  }
}
