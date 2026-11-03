import type { Household } from "@/lib/domain/types";
import type { ProjectionRow, ScenarioResult } from "@/lib/engine/types";
import { runRothScenario, runScenario } from "@/lib/engine/runScenario";
import { accountsLeft } from "@/lib/engine/spendingCapacity";
import { SP500_FIRST_YEAR, SP500_LAST_YEAR, sp500Return } from "@/lib/config/marketHistory";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";
import type { ReferenceData } from "@/lib/externalData/types";

/**
 * Monte Carlo: the plan run many times, each with its own market. Every run
 * draws a history year at random (with replacement) for each plan year, from
 * the S&P 500 / 10-year Treasury data, and both scenarios in a run see the
 * same market so they compare fairly. Accounts on S&P 500 or 50 / 50 history
 * get that year's actual return; tax-deferred, Roth and brokerage accounts on
 * a fixed return get their own rate moved by that year's S&P 500 swing from
 * its average (`monteCarloGrowth`). A short year takes more from the accounts
 * (after-tax, then tax-deferred, then Roth), like Spending capacity, and a run
 * succeeds when every year through the final age is paid.
 */

/** How many markets the analysis runs. */
export const MONTE_CARLO_RUNS = 1000;

/** Fixed seed, so the same plan always shows the same numbers. */
export const MONTE_CARLO_SEED = 20261103;

/** A year counts as paid when it's short by less than this a month. */
const COVERED = -1;

/** Small, fast, seeded random numbers in [0, 1) (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every history year with an S&P 500 return. */
export function historyYears(): number[] {
  const years: number[] = [];
  for (let y = SP500_FIRST_YEAR; y <= SP500_LAST_YEAR; y++) {
    if (sp500Return(y) != null) years.push(y);
  }
  return years;
}

/** `runs` markets of `length` years each, drawn with replacement. */
export function marketPaths(
  runs: number,
  length: number,
  seed: number = MONTE_CARLO_SEED,
): number[][] {
  const years = historyYears();
  const random = seededRandom(seed);
  const paths: number[][] = [];
  for (let r = 0; r < runs; r++) {
    const path: number[] = [];
    for (let i = 0; i < length; i++) path.push(years[Math.floor(random() * years.length)]);
    paths.push(path);
  }
  return paths;
}

/** One scenario's outcome in one market. */
export interface RunOutcome {
  lasts: boolean;
  /** First year spending couldn't be paid, or null when it lasts. */
  shortYear: number | null;
  inheritance: number;
  afterTaxAtRmd: number;
  /** Investment and retirement accounts left at each year end (before tax). */
  accountsByYear: number[];
}

/** Both scenarios in one market. */
export interface MonteCarloRun {
  baseline: RunOutcome;
  roth: RunOutcome;
}

function outcome(result: ScenarioResult): RunOutcome {
  const short = result.rows.find((r: ProjectionRow) => r.surplus < COVERED);
  return {
    lasts: !short,
    shortYear: short ? short.calendarYear : null,
    inheritance: result.totals.inheritanceFinal,
    afterTaxAtRmd: result.totals.afterTaxAssetsAtRmd,
    accountsByYear: result.rows.map(accountsLeft),
  };
}

/**
 * Both scenarios with the plan's conversion schedule in one market
 * (`marketPath`, or the plan's own returns when it's missing).
 */
export function monteCarloRun(
  household: Household,
  schedule: number[],
  refs: ReferenceData = FALLBACK_REFERENCE_DATA,
  marketPath?: readonly number[],
): MonteCarloRun {
  const zeros = new Array(schedule.length).fill(0);
  const options = { coverShortfalls: true, marketPath };
  return {
    baseline: outcome(runScenario(household, zeros, "No Roth conversion", refs, options)),
    roth: outcome(runRothScenario(household, schedule, "With Roth conversion", refs, options)),
  };
}

export interface Percentiles {
  p10: number;
  p50: number;
  p90: number;
}

export interface MonteCarloScenario {
  /** Share of runs (0 to 1) where every year through the final age is paid. */
  successRate: number;
  inheritance: Percentiles;
  afterTaxAtRmd: Percentiles;
  /** Accounts left at each year end, by percentile across the runs. */
  accountsByYear: ({ year: number } & Percentiles)[];
  /** In the runs that fall short, the median year the money runs out. */
  medianShortYear: number | null;
}

export interface MonteCarloSummary {
  runs: number;
  baseline: MonteCarloScenario;
  roth: MonteCarloScenario;
  /** Share of runs where converting leaves the larger inheritance. */
  rothAheadRate: number;
  /** The same plan on its own fixed / history returns, for reference. */
  plan: MonteCarloRun;
}

/** The value at fraction `q` (0 to 1) of an ascending list, interpolated. */
export function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function percentiles(values: number[]): Percentiles {
  const sorted = [...values].sort((a, b) => a - b);
  return { p10: percentile(sorted, 0.1), p50: percentile(sorted, 0.5), p90: percentile(sorted, 0.9) };
}

function summarizeScenario(outcomes: RunOutcome[], years: number[]): MonteCarloScenario {
  const shortYears = outcomes
    .map((o) => o.shortYear)
    .filter((y): y is number => y != null)
    .sort((a, b) => a - b);
  return {
    successRate: outcomes.filter((o) => o.lasts).length / Math.max(1, outcomes.length),
    inheritance: percentiles(outcomes.map((o) => o.inheritance)),
    afterTaxAtRmd: percentiles(outcomes.map((o) => o.afterTaxAtRmd)),
    accountsByYear: years.map((year, i) => ({
      year,
      ...percentiles(outcomes.map((o) => o.accountsByYear[i] ?? 0)),
    })),
    medianShortYear: shortYears.length > 0 ? Math.round(percentile(shortYears, 0.5)) : null,
  };
}

/** Roll the runs up into success rates and percentiles for both scenarios. */
export function summarizeMonteCarlo(
  runs: MonteCarloRun[],
  plan: MonteCarloRun,
  years: number[],
): MonteCarloSummary {
  const ahead = runs.filter((r) => r.roth.inheritance > r.baseline.inheritance).length;
  return {
    runs: runs.length,
    baseline: summarizeScenario(runs.map((r) => r.baseline), years),
    roth: summarizeScenario(runs.map((r) => r.roth), years),
    rothAheadRate: ahead / Math.max(1, runs.length),
    plan,
  };
}

/** The plan's run on its own returns, and the calendar years its rows cover. */
export function monteCarloPlan(
  household: Household,
  schedule: number[],
  refs: ReferenceData = FALLBACK_REFERENCE_DATA,
): { plan: MonteCarloRun; years: number[] } {
  const zeros = new Array(schedule.length).fill(0);
  const rows = runScenario(household, zeros, "No Roth conversion", refs, { coverShortfalls: true }).rows;
  return { plan: monteCarloRun(household, schedule, refs), years: rows.map((r) => r.calendarYear) };
}

/**
 * The whole analysis in one call (tests, small run counts). The UI runs the
 * same steps in chunks so the page stays responsive.
 */
export function monteCarlo(
  household: Household,
  schedule: number[],
  refs: ReferenceData = FALLBACK_REFERENCE_DATA,
  runs: number = MONTE_CARLO_RUNS,
  seed: number = MONTE_CARLO_SEED,
): MonteCarloSummary {
  const { plan, years } = monteCarloPlan(household, schedule, refs);
  const results = marketPaths(runs, years.length, seed).map((path) =>
    monteCarloRun(household, schedule, refs, path),
  );
  return summarizeMonteCarlo(results, plan, years);
}
