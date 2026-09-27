import type { ConversionStrategy, Household } from "@/lib/domain/types";
import { calculate } from "@/lib/calculate";

/**
 * The four headline comparison metrics for a single scenario - exactly what
 * `ComparisonSummary.tsx` renders.
 */
export interface ScenarioMetrics {
  taxesTotal: number;
  medicareTotal: number;
  afterTaxAssetsAtRmd: number;
  inheritanceFinal: number;
}

/** Baseline (no conversion) vs. Roth scenario, plus the deltas. */
export interface GoldenMetrics {
  baseline: ScenarioMetrics;
  roth: ScenarioMetrics;
  deltas: ScenarioMetrics;
}

/**
 * One golden regression case: a plan (`household`) + the exact metrics it
 * produced when last blessed (`expected`), stamped with the git commit that was
 * current at that time so discrepancies can be traced back to code changes.
 *
 * One JSON file per case lives in `./cases/*.json`. Author a new case by hand
 * (name, strategy, household), then run `GOLDEN_BLESS=1 npm test` to fill in
 * `expected`, `commit`, and `commitDate`.
 */
export interface GoldenCase {
  /** Human-readable description of what this plan exercises. */
  name: string;
  /** The conversion strategy this case relates to (must match the household). */
  strategy: ConversionStrategy;
  /** Short git hash the `expected` values were last verified against. */
  commit: string;
  /** ISO commit date of `commit`, for quick eyeballing. */
  commitDate: string;
  /** Optional free-form note (what changed, why this case exists, quirks). */
  note?: string;
  /** The plan input - the same `household` shape the app stores per plan. */
  household: Household;
  /** The metrics `calculate()` produced when last blessed. */
  expected: GoldenMetrics;
}

/** Round to cents so platform float jitter never flips a comparison. */
const cents = (n: number) => Math.round(n * 100) / 100;

function scenario(t: ScenarioMetrics): ScenarioMetrics {
  return {
    taxesTotal: cents(t.taxesTotal),
    medicareTotal: cents(t.medicareTotal),
    afterTaxAssetsAtRmd: cents(t.afterTaxAssetsAtRmd),
    inheritanceFinal: cents(t.inheritanceFinal),
  };
}

/**
 * Run the real UI entry point `calculate()` on a plan and return the four
 * headline metrics for both scenarios plus the deltas, rounded to cents.
 */
export function computeMetrics(household: Household): GoldenMetrics {
  const c = calculate(household);
  return {
    baseline: scenario(c.baseline.totals),
    roth: scenario(c.roth.totals),
    deltas: scenario(c.deltas),
  };
}
