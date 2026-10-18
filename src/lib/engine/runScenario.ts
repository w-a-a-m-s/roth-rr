import type { EarlyConversion, Household } from "@/lib/domain/types";
import { primaryRmdAge } from "@/lib/domain/rmd";
import type {
  Comparison,
  ProjectionOptions,
  ProjectionRow,
  ScenarioResult,
  ScenarioTotals,
} from "@/lib/engine/types";
import {
  primaryPersonId,
  projectionStartYear,
  projectScenario,
  retirementStartYear,
  scenarioStartYear,
  strategyStartYear,
} from "@/lib/engine/project";
import { depositPrincipalThrough } from "@/lib/engine/deposits";
import {
  AFTER_TAX_ACCOUNT_KINDS,
  contributionAccounts,
} from "@/lib/domain/household";
import { progressiveTax } from "@/lib/engine/tax";
import { federalTaxForYear } from "@/lib/engine/taxIndexing";
import type { FederalTaxYear } from "@/lib/config/federalTax";
import type { MedicarePartBYear } from "@/lib/config/medicare";
import { medicareYears } from "@/lib/engine/medicare";
import { getStateTaxTable, type StateIncomeTaxYear } from "@/lib/config/stateTax";
import { forFiling } from "@/lib/config/filingStatus";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";
import type { ReferenceData } from "@/lib/externalData/types";

const AFTER_TAX_KINDS = new Set<string>(AFTER_TAX_ACCOUNT_KINDS);

/**
 * Cost basis across after-tax accounts as of `throughYear`. Deposits are paid
 * in with already-taxed dollars, so their principal adds to basis and isn't
 * taxed again as a gain when the estate is valued.
 */
function afterTaxCostBasis(household: Household, throughYear: number): number {
  return contributionAccounts(household)
    .filter((a) => AFTER_TAX_KINDS.has(a.kind))
    .reduce(
      (sum, a) =>
        sum + (a.costBasis ?? 0) + depositPrincipalThrough(a, throughYear),
      0,
    );
}

/**
 * After-tax value of a tax-deferred (retirement) balance: taxed as a lump sum
 * of ordinary income through federal and state brackets (no deductions),
 * with the federal brackets indexed to `calendarYear`.
 */
function estateRetirementValue(
  household: Household,
  retirementTotal: number,
  federal: FederalTaxYear,
  stateTax: StateIncomeTaxYear,
  fs: Household["filingStatus"] = household.filingStatus,
  calendarYear: number = federal.year,
): number {
  const federalTax = progressiveTax(
    retirementTotal,
    forFiling(
      federalTaxForYear(household, federal, calendarYear).brackets,
      fs,
      "federal brackets",
    ),
  );
  const state = getStateTaxTable(
    stateTax,
    household.residenceState ?? "FL",
  );
  let stateTaxAmount = 0;
  if (state.hasIncomeTax && !state.capitalGainsOnly) {
    const deduction =
      forFiling(state.standardDeduction, fs, "state standardDeduction") +
      forFiling(state.personalExemption, fs, "state personalExemption");
    const taxable = Math.max(0, retirementTotal - deduction);
    stateTaxAmount = progressiveTax(
      taxable,
      forFiling(state.brackets, fs, "state brackets"),
    );
  }
  return retirementTotal - federalTax - stateTaxAmount;
}

/**
 * After-tax estate value: tax-deferred balances are taxed through federal +
 * state brackets, Roth passes tax free, after-tax accounts net of cost basis,
 * real-estate equity at full value.
 */
export function afterTaxAssets(
  household: Household,
  row: ProjectionRow,
  refs: ReferenceData = FALLBACK_REFERENCE_DATA,
): number {
  return inheritanceValue(
    household,
    row,
    refs.federalTax,
    refs.stateIncomeTax,
  );
}

function inheritanceValue(
  household: Household,
  row: ProjectionRow,
  federal: FederalTaxYear,
  stateTax: StateIncomeTaxYear,
): number {
  const costBasis = afterTaxCostBasis(household, row.calendarYear);
  return (
    estateRetirementValue(
      household,
      row.retirementTotal,
      federal,
      stateTax,
      row.filingStatus,
      row.calendarYear,
    ) +
    row.rothTotal +
    Math.max(0, row.afterTaxTotal - costBasis) +
    row.realEstateEquity +
    row.businessEquity
  );
}

/**
 * Total Medicare Part B premiums (including IRMAA) paid across the projection.
 * MAGI is approximated by federal ordinary gross taxable income plus realized
 * capital gains from after-tax withdrawals.
 */
function medicareTotal(
  household: Household,
  rows: ProjectionRow[],
  medicare: MedicarePartBYear,
): number {
  return medicareYears(household, rows, medicare).totalPremiums;
}

function computeTotals(
  household: Household,
  rows: ProjectionRow[],
  refs: ReferenceData,
): ScenarioTotals {
  const rmdAge = primaryRmdAge(household);
  const primaryId = primaryPersonId(household);
  const federal = refs.federalTax;

  const retirement = retirementStartYear(household);

  let taxesEarly = 0;
  let taxesLate = 0;
  let federalTaxesEarly = 0;
  let federalTaxesLate = 0;
  let stateTaxesEarly = 0;
  let stateTaxesLate = 0;
  let federalTaxesTotal = 0;
  let stateTaxesTotal = 0;
  for (const row of rows) {
    federalTaxesTotal += row.federalAnnualTax;
    stateTaxesTotal += row.stateAnnualTax;
    // No known RMD age → treat all years as pre-RMD for the early/late split.
    if (rmdAge == null || row.ages[primaryId] < rmdAge) {
      // Taxes until the RMD age count from retirement, whatever year the
      // plan starts in. Earlier years are only in the lifetime total.
      if (row.calendarYear < retirement) continue;
      taxesEarly += row.annualTax;
      federalTaxesEarly += row.federalAnnualTax;
      stateTaxesEarly += row.stateAnnualTax;
    } else {
      taxesLate += row.annualTax;
      federalTaxesLate += row.federalAnnualTax;
      stateTaxesLate += row.stateAnnualTax;
    }
  }

  const rmdRow =
    (rmdAge != null
      ? rows.find((r) => r.ages[primaryId] >= rmdAge)
      : undefined) ?? rows[rows.length - 1];
  const finalRow = rows[rows.length - 1];

  return {
    taxesEarly,
    taxesLate,
    taxesTotal: federalTaxesTotal + stateTaxesTotal,
    federalTaxesEarly,
    federalTaxesLate,
    federalTaxesTotal,
    stateTaxesEarly,
    stateTaxesLate,
    stateTaxesTotal,
    medicareTotal: medicareTotal(household, rows, refs.medicare),
    afterTaxAssetsAtRmd: inheritanceValue(
      household,
      rmdRow,
      federal,
      refs.stateIncomeTax,
    ),
    inheritanceFinal: inheritanceValue(
      household,
      finalRow,
      federal,
      refs.stateIncomeTax,
    ),
  };
}

export function runScenario(
  household: Household,
  conversionSchedule: number[],
  label: string,
  refs: ReferenceData = FALLBACK_REFERENCE_DATA,
  options: ProjectionOptions = {},
): ScenarioResult {
  const rows = projectScenario(household, conversionSchedule, refs, options);
  return {
    label,
    rows,
    conversionSchedule,
    totals: computeTotals(household, rows, refs),
  };
}

/**
 * Conversions the user typed for the years before the strategy's first year
 * (see `strategyStartYear`): positive amounts, not already past (balances
 * are entered today, so a conversion in an earlier year is already in them).
 */
export function typedEarlyConversions(
  household: Household,
  asOfDate?: string,
): EarlyConversion[] {
  const end = strategyStartYear(household);
  const today = asOfDate ? Number(asOfDate.slice(0, 4)) : NaN;
  const typed: EarlyConversion[] = [];
  for (const conversion of household.optimizer?.earlyConversions ?? []) {
    const { year, amount } = conversion;
    if (!Number.isFinite(year) || !Number.isFinite(amount) || amount <= 0) continue;
    if (!(year < end)) continue;
    if (Number.isFinite(today) && year < today) continue;
    typed.push({ year, amount });
  }
  return typed;
}

/**
 * The typed early conversions in years before the projection starts. The
 * Roth run reaches back to convert them (years from the start on are in the
 * conversion schedule instead).
 */
export function activeEarlyConversions(
  household: Household,
  asOfDate?: string,
): EarlyConversion[] {
  const start = projectionStartYear(household);
  return typedEarlyConversions(household, asOfDate).filter((c) => c.year < start);
}

function sumTaxes(
  rows: ProjectionRow[],
  beforeYear: number,
  fromYear = -Infinity,
) {
  let federal = 0;
  let state = 0;
  for (const row of rows) {
    if (row.calendarYear >= beforeYear) break;
    if (row.calendarYear < fromYear) continue;
    federal += row.federalAnnualTax;
    state += row.stateAnnualTax;
  }
  return { federal, state };
}

/**
 * The Roth-conversion scenario: `conversionSchedule` from the strategy, plus
 * the plan's early conversions before the projection starts. Those run in
 * their own years (the projection reaches back to them), and the rows are
 * trimmed back to the normal start so they line up with the baseline. The
 * years trimmed off add only the tax the conversions caused.
 */
export function runRothScenario(
  household: Household,
  conversionSchedule: number[],
  label: string,
  refs: ReferenceData = FALLBACK_REFERENCE_DATA,
  options: ProjectionOptions = {},
): ScenarioResult {
  const early = activeEarlyConversions(household, refs.asOfDate);
  if (early.length === 0) {
    return runScenario(household, conversionSchedule, label, refs, options);
  }
  const start = scenarioStartYear(household, options, refs.asOfDate);
  const fromYear = Math.min(start, ...early.map((c) => c.year));
  const rows = projectScenario(household, conversionSchedule, refs, {
    ...options,
    fromYear,
    earlyConversions: early,
  });
  const shown = rows.filter((row) => row.calendarYear >= start);
  const totals = computeTotals(household, shown, refs);
  if (shown.length === rows.length) {
    return { label, rows: shown, conversionSchedule, totals };
  }

  // Price the hidden years against the same years with no conversion.
  const without = projectScenario(household, [], refs, { ...options, fromYear });
  const withTax = sumTaxes(rows, start);
  const withoutTax = sumTaxes(without, start);
  const federalTax = withTax.federal - withoutTax.federal;
  const stateTax = withTax.state - withoutTax.state;
  const convertedByYear: Record<number, number> = {};
  for (const row of rows) {
    if (row.calendarYear >= start) break;
    convertedByYear[row.calendarYear] = row.conversion;
  }
  // Before the plan starts everyone is below their RMD age: the hidden years
  // from retirement on are early taxes (earlier ones are lifetime only).
  const retirement = retirementStartYear(household);
  const withEarly = sumTaxes(rows, start, retirement);
  const withoutEarly = sumTaxes(without, start, retirement);
  const earlyFederal = withEarly.federal - withoutEarly.federal;
  const earlyState = withEarly.state - withoutEarly.state;
  totals.federalTaxesEarly += earlyFederal;
  totals.stateTaxesEarly += earlyState;
  totals.taxesEarly += earlyFederal + earlyState;
  totals.federalTaxesTotal += federalTax;
  totals.stateTaxesTotal += stateTax;
  totals.taxesTotal += federalTax + stateTax;
  return {
    label,
    rows: shown,
    conversionSchedule,
    totals,
    earlyConversions: { convertedByYear, federalTax, stateTax },
  };
}

/** Deltas between an already-run baseline and Roth scenario. */
export function comparisonFrom(
  baseline: ScenarioResult,
  roth: ScenarioResult,
): Comparison {
  return {
    baseline,
    roth,
    deltas: {
      taxesEarly: roth.totals.taxesEarly - baseline.totals.taxesEarly,
      taxesLate: roth.totals.taxesLate - baseline.totals.taxesLate,
      taxesTotal: roth.totals.taxesTotal - baseline.totals.taxesTotal,
      federalTaxesTotal:
        roth.totals.federalTaxesTotal - baseline.totals.federalTaxesTotal,
      stateTaxesTotal:
        roth.totals.stateTaxesTotal - baseline.totals.stateTaxesTotal,
      medicareTotal: roth.totals.medicareTotal - baseline.totals.medicareTotal,
      afterTaxAssetsAtRmd:
        roth.totals.afterTaxAssetsAtRmd - baseline.totals.afterTaxAssetsAtRmd,
      inheritanceFinal:
        roth.totals.inheritanceFinal - baseline.totals.inheritanceFinal,
    },
  };
}

/**
 * Run the no-conversion baseline against a Roth-conversion scenario and report
 * the differences in lifetime taxes, after-tax assets at the RMD age, and
 * final inheritance.
 */
export function compareScenarios(
  household: Household,
  conversionSchedule: number[],
  refs: ReferenceData = FALLBACK_REFERENCE_DATA,
  options: ProjectionOptions = {},
): Comparison {
  const zeros = new Array(conversionSchedule.length).fill(0);
  const baseline = runScenario(
    household,
    zeros,
    "No Roth conversion",
    refs,
    options,
  );
  const roth = runRothScenario(
    household,
    conversionSchedule,
    "With Roth conversion",
    refs,
    options,
  );
  return comparisonFrom(baseline, roth);
}
