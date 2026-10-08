import type { Household } from "@/lib/domain/types";
import { primaryRmdAge } from "@/lib/domain/rmd";
import type {
  Comparison,
  ProjectionRow,
  ScenarioResult,
  ScenarioTotals,
} from "@/lib/engine/types";
import { primaryPersonId, projectScenario } from "@/lib/engine/project";
import { depositPrincipalThrough } from "@/lib/engine/deposits";
import { progressiveTax } from "@/lib/engine/tax";
import type { FederalTaxYear } from "@/lib/config/federalTax";
import type { MedicarePartBYear } from "@/lib/config/medicare";
import {
  MEDICARE_ELIGIBILITY_AGE,
  MEDICARE_IRMAA_LOOKBACK_YEARS,
  medicarePartBMonthlyPremium,
} from "@/lib/config/medicare";
import { getStateTaxTable, type StateIncomeTaxYear } from "@/lib/config/stateTax";
import { forFiling } from "@/lib/config/filingStatus";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";
import type { ReferenceData } from "@/lib/externalData/types";

const AFTER_TAX_KINDS = new Set(["investment", "annuity", "cd", "savings"]);

/**
 * Cost basis across after-tax accounts as of `throughYear`. Deposits are paid
 * in with already-taxed dollars, so their principal adds to basis and isn't
 * taxed again as a gain when the estate is valued.
 */
function afterTaxCostBasis(household: Household, throughYear: number): number {
  return household.accounts
    .filter((a) => AFTER_TAX_KINDS.has(a.kind))
    .reduce(
      (sum, a) =>
        sum + (a.costBasis ?? 0) + depositPrincipalThrough(a, throughYear),
      0,
    );
}

/**
 * After-tax value of a tax-deferred (retirement) balance: taxed as a lump sum
 * of ordinary income through federal and state brackets (no deductions).
 */
function estateRetirementValue(
  household: Household,
  retirementTotal: number,
  federal: FederalTaxYear,
  stateTax: StateIncomeTaxYear,
): number {
  const fs = household.filingStatus;
  const federalTax = progressiveTax(
    retirementTotal,
    forFiling(federal.brackets, fs, "federal brackets"),
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
    ) +
    row.rothTotal +
    Math.max(0, row.afterTaxTotal - costBasis) +
    row.realEstateEquity
  );
}

/**
 * Income tax still owed on the tax-deferred balance in `row`: what the
 * inheritance value takes out when it cashes those accounts out as a lump sum.
 */
export function deferredTaxOwed(
  household: Household,
  row: ProjectionRow,
  refs: ReferenceData = FALLBACK_REFERENCE_DATA,
): number {
  return (
    row.retirementTotal -
    estateRetirementValue(
      household,
      row.retirementTotal,
      refs.federalTax,
      refs.stateIncomeTax,
    )
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
  const fs = household.filingStatus;
  let total = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const enrolled = household.people.filter(
      (p) => row.ages[p.id] >= MEDICARE_ELIGIBILITY_AGE,
    ).length;
    if (enrolled === 0) continue;
    const lookback = rows[Math.max(0, i - MEDICARE_IRMAA_LOOKBACK_YEARS)];
    const monthly = medicarePartBMonthlyPremium(
      lookback.grossTaxableIncome + lookback.capitalGainsIncome,
      fs,
      medicare,
    );
    total += enrolled * monthly * 12;
  }
  return total;
}

function computeTotals(
  household: Household,
  rows: ProjectionRow[],
  refs: ReferenceData,
): ScenarioTotals {
  const rmdAge = primaryRmdAge(household);
  const primaryId = primaryPersonId(household);
  const federal = refs.federalTax;

  let taxesEarly = 0;
  let taxesLate = 0;
  let federalTaxesEarly = 0;
  let federalTaxesLate = 0;
  let stateTaxesEarly = 0;
  let stateTaxesLate = 0;
  for (const row of rows) {
    // No known RMD age → treat all years as pre-RMD for the early/late split.
    if (rmdAge == null || row.ages[primaryId] < rmdAge) {
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
    taxesTotal: taxesEarly + taxesLate,
    federalTaxesEarly,
    federalTaxesLate,
    federalTaxesTotal: federalTaxesEarly + federalTaxesLate,
    stateTaxesEarly,
    stateTaxesLate,
    stateTaxesTotal: stateTaxesEarly + stateTaxesLate,
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
): ScenarioResult {
  const rows = projectScenario(household, conversionSchedule, refs);
  return {
    label,
    rows,
    conversionSchedule,
    totals: computeTotals(household, rows, refs),
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
): Comparison {
  const zeros = new Array(conversionSchedule.length).fill(0);
  const baseline = runScenario(
    household,
    zeros,
    "No Roth conversion",
    refs,
  );
  const roth = runScenario(
    household,
    conversionSchedule,
    "With Roth conversion",
    refs,
  );
  return comparisonFrom(baseline, roth);
}
