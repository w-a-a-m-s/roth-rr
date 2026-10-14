import type { Household, SpendingCapacitySettings } from "@/lib/domain/types";
import type { ProjectionRow, ScenarioResult } from "@/lib/engine/types";
import { runRothScenario, runScenario } from "@/lib/engine/runScenario";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";
import type { ReferenceData } from "@/lib/externalData/types";

/** The saved inputs, with defaults for anything missing or not a number. */
export function spendingCapacitySettingsFor(household: Household): SpendingCapacitySettings {
  const reserve = household.spendingCapacity?.endReserve;
  return {
    endReserve: typeof reserve === "number" && Number.isFinite(reserve) ? Math.max(0, reserve) : 0,
  };
}

/** A year counts as covered when it's short by less than this a month. */
const COVERED = -1;
/** The search stops once the monthly spending is pinned within this. */
const PRECISION_MONTHLY = 1;
/** Never search past this many times the plan's spending. */
const MAX_SCALE = 50;

export interface CapacityScenario {
  /** What the capacity is as a multiple of the plan's own expenses. */
  scale: number;
  /** The plan's own expenses a month, in the first year. */
  planMonthly: number;
  /** The most it can spend a month in the first year, growing as the plan's do. */
  capacityMonthly: number;
  /**
   * With the plan's spending, the first year the accounts can't cover, or
   * null when the money lasts to the final age.
   */
  runsShort: { year: number; age: number } | null;
  /** The projection at the capacity, short years covered from the accounts. */
  rows: ProjectionRow[];
}

export interface SpendingCapacity {
  baseline: CapacityScenario;
  roth: CapacityScenario;
}

/** Investment and retirement accounts left at the end of a year (before tax). */
export function accountsLeft(row: ProjectionRow): number {
  return row.retirementTotal + row.rothTotal + row.afterTaxTotal;
}

function planExpensesMonthly(household: Household, row: ProjectionRow | undefined): number {
  if (!row) return 0;
  return household.expenses.reduce((sum, e) => sum + (row.expenseMonthly[e.id] ?? 0), 0);
}

/**
 * Spending capacity: the most the household can spend, as a multiple of the
 * plan's own expenses (every one grows as it does in the plan), so every year
 * through the final age is covered and at least `endReserve` is left in the
 * accounts at the end. A year short of cash takes more from the accounts:
 * after-tax first, then tax-deferred, then Roth, grossed up for the tax. A
 * year with money left over doesn't save it, so the answer leans safe. Both
 * scenarios use the plan's conversion schedule (`schedule`) as-is.
 */
export function spendingCapacity(
  household: Household,
  schedule: number[],
  refs: ReferenceData = FALLBACK_REFERENCE_DATA,
  settings: SpendingCapacitySettings = spendingCapacitySettingsFor(household),
): SpendingCapacity {
  const zeros = new Array(schedule.length).fill(0);
  const run = {
    baseline: (scale: number) =>
      runScenario(household, zeros, "No Roth conversion", refs, {
        spendingScale: scale,
        coverShortfalls: true,
      }),
    roth: (scale: number) =>
      runRothScenario(household, schedule, "With Roth conversion", refs, {
        spendingScale: scale,
        coverShortfalls: true,
      }),
  };
  return {
    baseline: searchCapacity(household, run.baseline, settings.endReserve),
    roth: searchCapacity(household, run.roth, settings.endReserve),
  };
}

function searchCapacity(
  household: Household,
  run: (scale: number) => ScenarioResult,
  endReserve: number,
): CapacityScenario {
  const lasts = (rows: ProjectionRow[]) =>
    rows.every((r) => r.surplus >= COVERED) &&
    accountsLeft(rows[rows.length - 1] ?? ({} as ProjectionRow)) >= endReserve;

  const plan = run(1);
  const planMonthly = planExpensesMonthly(household, plan.rows[0]);
  const short = plan.rows.find((r) => r.surplus < COVERED);
  const primary = household.mainPersonId ?? household.people[0]?.id;
  const runsShort = short
    ? { year: short.calendarYear, age: primary ? short.ages[primary] : NaN }
    : null;
  if (!(planMonthly > 0)) {
    return { scale: 1, planMonthly: 0, capacityMonthly: 0, runsShort, rows: plan.rows };
  }

  // Bracket the answer, then halve the gap until it's within a dollar a month.
  let lo = 0;
  let hi = 1;
  let best = run(0);
  if (!lasts(best.rows)) {
    return { scale: 0, planMonthly, capacityMonthly: 0, runsShort, rows: best.rows };
  }
  if (lasts(plan.rows)) {
    lo = 1;
    best = plan;
    hi = 2;
    while (hi < MAX_SCALE) {
      const trial = run(hi);
      if (!lasts(trial.rows)) break;
      lo = hi;
      best = trial;
      hi *= 2;
    }
  }
  while ((hi - lo) * planMonthly > PRECISION_MONTHLY) {
    const mid = (lo + hi) / 2;
    const trial = run(mid);
    if (lasts(trial.rows)) {
      lo = mid;
      best = trial;
    } else {
      hi = mid;
    }
  }
  return {
    scale: lo,
    planMonthly,
    capacityMonthly: planMonthly * lo,
    runsShort,
    rows: best.rows,
  };
}
