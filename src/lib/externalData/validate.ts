import type { FilingStatus, TaxBracket } from "@/lib/domain/types";
import type { FederalTaxYear } from "@/lib/config/federalTax";
import type {
  MedicarePartBTier,
  MedicarePartBYear,
} from "@/lib/config/medicare";
// Relative import so jiti scripts (external-data:check) resolve without path aliases.
import {
  ALL_STATE_CODES,
  type StateCapitalGainsTreatment,
  type StateIncomeTaxYear,
  type StateTaxTable,
  type UsStateCode,
} from "../config/stateTax";
import {
  ALL_FILING_STATUSES,
  BASE_FILING_STATUSES,
  type FilingTable,
} from "../config/filingStatus";
import type {
  ExternalDataKey,
  ExternalDataMeta,
} from "@/lib/externalData/types";

const FEDERAL_FILING: readonly FilingStatus[] = ALL_FILING_STATUSES;
const EXPECTED_RATES = [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];
const EXPECTED_LTCG_RATES = [0, 0.15, 0.2];
/** CMS publishes six Part B IRMAA income tiers (including the base tier). */
const EXPECTED_MEDICARE_TIERS = 6;
const CG_TREATMENTS: StateCapitalGainsTreatment[] = [
  "ordinary",
  "exempt",
  "preferential",
];

export type ValidateResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateBrackets(
  value: unknown,
  label: string,
  allowRateChange: boolean,
): ValidateResult<TaxBracket[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: `${label}: expected non-empty brackets array` };
  }
  const brackets: TaxBracket[] = [];
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
    if (!isRecord(row)) {
      return { ok: false, error: `${label}[${i}]: expected object` };
    }
    if (typeof row.floor !== "number" || !Number.isFinite(row.floor)) {
      return { ok: false, error: `${label}[${i}].floor: expected number` };
    }
    if (typeof row.rate !== "number" || !Number.isFinite(row.rate)) {
      return { ok: false, error: `${label}[${i}].rate: expected number` };
    }
    if (i > 0 && row.floor <= brackets[i - 1].floor) {
      return {
        ok: false,
        error: `${label}: floors must be strictly ascending`,
      };
    }
    brackets.push({ floor: row.floor, rate: row.rate });
  }
  if (!allowRateChange) {
    if (brackets.length !== EXPECTED_RATES.length) {
      return {
        ok: false,
        error: `${label}: expected ${EXPECTED_RATES.length} brackets (pass allowRateChange for statute changes)`,
      };
    }
    for (let i = 0; i < brackets.length; i++) {
      if (brackets[i].rate !== EXPECTED_RATES[i]) {
        return {
          ok: false,
          error: `${label}[${i}].rate: expected ${EXPECTED_RATES[i]} (pass allowRateChange for statute changes)`,
        };
      }
    }
  }
  return { ok: true, value: brackets };
}

function validateFilingNumbers(
  value: unknown,
  label: string,
  required: readonly FilingStatus[],
): ValidateResult<FilingTable<number>> {
  if (!isRecord(value)) {
    return { ok: false, error: `${label}: expected object` };
  }
  const out: FilingTable<number> = { single: 0, mfj: 0 };
  for (const fs of required) {
    const n = value[fs];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
      return { ok: false, error: `${label}.${fs}: expected non-negative number` };
    }
    out[fs] = n;
  }
  for (const fs of ALL_FILING_STATUSES) {
    if (required.includes(fs) || value[fs] === undefined) continue;
    const n = value[fs];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
      return { ok: false, error: `${label}.${fs}: expected non-negative number` };
    }
    out[fs] = n;
  }
  return { ok: true, value: out };
}

function validateMedicareTiers(
  value: unknown,
  label: string,
  allowTiersChange: boolean,
): ValidateResult<MedicarePartBTier[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: `${label}: expected non-empty tiers array` };
  }
  const tiers: MedicarePartBTier[] = [];
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
    if (!isRecord(row)) {
      return { ok: false, error: `${label}[${i}]: expected object` };
    }
    if (typeof row.magiFloor !== "number" || !Number.isFinite(row.magiFloor)) {
      return { ok: false, error: `${label}[${i}].magiFloor: expected number` };
    }
    if (
      typeof row.monthlyPremium !== "number" ||
      !Number.isFinite(row.monthlyPremium) ||
      row.monthlyPremium < 0
    ) {
      return {
        ok: false,
        error: `${label}[${i}].monthlyPremium: expected non-negative number`,
      };
    }
    if (i > 0 && row.magiFloor <= tiers[i - 1].magiFloor) {
      return {
        ok: false,
        error: `${label}: magiFloor must be strictly ascending`,
      };
    }
    tiers.push({
      magiFloor: row.magiFloor,
      monthlyPremium: row.monthlyPremium,
    });
  }
  if (!allowTiersChange && tiers.length !== EXPECTED_MEDICARE_TIERS) {
    return {
      ok: false,
      error: `${label}: expected ${EXPECTED_MEDICARE_TIERS} tiers (pass allowRateChange if CMS changes the tier count)`,
    };
  }
  if (tiers[0].magiFloor !== 0) {
    return { ok: false, error: `${label}[0].magiFloor: expected 0` };
  }
  return { ok: true, value: tiers };
}

/** Validate a FederalTaxYear candidate (used by API PUT and apply script). */
export function validateFederalTaxYear(
  value: unknown,
  opts: { allowRateChange?: boolean } = {},
): ValidateResult<FederalTaxYear> {
  if (!isRecord(value)) {
    return { ok: false, error: "federal-tax data: expected object" };
  }
  if (typeof value.year !== "number" || !Number.isInteger(value.year)) {
    return { ok: false, error: "year: expected integer" };
  }
  if (
    typeof value.seniorDeductionPerPerson !== "number" ||
    !Number.isFinite(value.seniorDeductionPerPerson)
  ) {
    return { ok: false, error: "seniorDeductionPerPerson: expected number" };
  }

  const standard = validateFilingNumbers(
    value.standardDeduction,
    "standardDeduction",
    FEDERAL_FILING,
  );
  if (!standard.ok) return standard;

  const phaseOut = validateFilingNumbers(
    value.seniorDeductionPhaseOut,
    "seniorDeductionPhaseOut",
    FEDERAL_FILING,
  );
  if (!phaseOut.ok) return phaseOut;

  if (!isRecord(value.brackets)) {
    return { ok: false, error: "brackets: expected object" };
  }
  const allowRateChange = opts.allowRateChange === true;
  const mfj = validateBrackets(value.brackets.mfj, "brackets.mfj", allowRateChange);
  if (!mfj.ok) return mfj;
  const single = validateBrackets(
    value.brackets.single,
    "brackets.single",
    allowRateChange,
  );
  if (!single.ok) return single;
  const hoh = validateBrackets(value.brackets.hoh, "brackets.hoh", allowRateChange);
  if (!hoh.ok) return hoh;

  if (!isRecord(value.longTermCapitalGains)) {
    return { ok: false, error: "longTermCapitalGains: expected object" };
  }
  const ltcgMfj = validateLtcgBrackets(
    value.longTermCapitalGains.mfj,
    "longTermCapitalGains.mfj",
    allowRateChange,
  );
  if (!ltcgMfj.ok) return ltcgMfj;
  const ltcgSingle = validateLtcgBrackets(
    value.longTermCapitalGains.single,
    "longTermCapitalGains.single",
    allowRateChange,
  );
  if (!ltcgSingle.ok) return ltcgSingle;
  const ltcgHoh = validateLtcgBrackets(
    value.longTermCapitalGains.hoh,
    "longTermCapitalGains.hoh",
    allowRateChange,
  );
  if (!ltcgHoh.ok) return ltcgHoh;

  return {
    ok: true,
    value: {
      year: value.year,
      standardDeduction: standard.value as FederalTaxYear["standardDeduction"],
      brackets: { mfj: mfj.value, single: single.value, hoh: hoh.value },
      seniorDeductionPerPerson: value.seniorDeductionPerPerson,
      seniorDeductionPhaseOut:
        phaseOut.value as FederalTaxYear["seniorDeductionPhaseOut"],
      longTermCapitalGains: {
        mfj: ltcgMfj.value,
        single: ltcgSingle.value,
        hoh: ltcgHoh.value,
      },
    },
  };
}

function validateLtcgBrackets(
  value: unknown,
  label: string,
  allowRateChange: boolean,
): ValidateResult<TaxBracket[]> {
  const brackets = validateBrackets(value, label, true);
  if (!brackets.ok) return brackets;
  if (!allowRateChange) {
    if (brackets.value.length !== EXPECTED_LTCG_RATES.length) {
      return {
        ok: false,
        error: `${label}: expected ${EXPECTED_LTCG_RATES.length} LTCG brackets (pass allowRateChange for statute changes)`,
      };
    }
    for (let i = 0; i < brackets.value.length; i++) {
      if (brackets.value[i].rate !== EXPECTED_LTCG_RATES[i]) {
        return {
          ok: false,
          error: `${label}[${i}].rate: expected ${EXPECTED_LTCG_RATES[i]} (pass allowRateChange for statute changes)`,
        };
      }
    }
  }
  return brackets;
}

function validateStateBrackets(
  value: unknown,
  label: string,
): ValidateResult<TaxBracket[]> {
  if (!Array.isArray(value)) {
    return { ok: false, error: `${label}: expected brackets array` };
  }
  if (value.length === 0) return { ok: true, value: [] };
  return validateBrackets(value, label, true);
}

function validateStateTable(
  value: unknown,
  code: UsStateCode,
): ValidateResult<StateTaxTable> {
  if (!isRecord(value)) {
    return { ok: false, error: `states.${code}: expected object` };
  }
  if (typeof value.name !== "string" || value.name.trim() === "") {
    return { ok: false, error: `states.${code}.name: expected non-empty string` };
  }
  if (typeof value.hasIncomeTax !== "boolean") {
    return { ok: false, error: `states.${code}.hasIncomeTax: expected boolean` };
  }
  if (!isRecord(value.brackets)) {
    return { ok: false, error: `states.${code}.brackets: expected object` };
  }
  const single = validateStateBrackets(
    value.brackets.single,
    `states.${code}.brackets.single`,
  );
  if (!single.ok) return single;
  const mfj = validateStateBrackets(
    value.brackets.mfj,
    `states.${code}.brackets.mfj`,
  );
  if (!mfj.ok) return mfj;
  let hohBrackets: TaxBracket[] | undefined;
  if (value.brackets.hoh !== undefined) {
    const hoh = validateStateBrackets(
      value.brackets.hoh,
      `states.${code}.brackets.hoh`,
    );
    if (!hoh.ok) return hoh;
    hohBrackets = hoh.value;
  }

  const standard = validateFilingNumbers(
    value.standardDeduction,
    `states.${code}.standardDeduction`,
    BASE_FILING_STATUSES,
  );
  if (!standard.ok) return standard;
  const personal = validateFilingNumbers(
    value.personalExemption,
    `states.${code}.personalExemption`,
    BASE_FILING_STATUSES,
  );
  if (!personal.ok) return personal;

  if (
    typeof value.socialSecurityTaxablePct !== "number" ||
    !Number.isFinite(value.socialSecurityTaxablePct) ||
    value.socialSecurityTaxablePct < 0 ||
    value.socialSecurityTaxablePct > 1
  ) {
    return {
      ok: false,
      error: `states.${code}.socialSecurityTaxablePct: expected number in [0,1]`,
    };
  }
  if (
    typeof value.capitalGains !== "string" ||
    !CG_TREATMENTS.includes(value.capitalGains as StateCapitalGainsTreatment)
  ) {
    return {
      ok: false,
      error: `states.${code}.capitalGains: expected ordinary|exempt|preferential`,
    };
  }

  const table: StateTaxTable = {
    name: value.name,
    hasIncomeTax: value.hasIncomeTax,
    brackets: {
      single: single.value,
      mfj: mfj.value,
      ...(hohBrackets ? { hoh: hohBrackets } : {}),
    },
    standardDeduction: standard.value,
    personalExemption: personal.value,
    socialSecurityTaxablePct: value.socialSecurityTaxablePct,
    capitalGains: value.capitalGains as StateCapitalGainsTreatment,
  };
  if (value.capitalGainsOnly !== undefined) {
    if (typeof value.capitalGainsOnly !== "boolean") {
      return {
        ok: false,
        error: `states.${code}.capitalGainsOnly: expected boolean`,
      };
    }
    table.capitalGainsOnly = value.capitalGainsOnly;
  }
  if (value.capitalGainsBrackets !== undefined) {
    if (!isRecord(value.capitalGainsBrackets)) {
      return {
        ok: false,
        error: `states.${code}.capitalGainsBrackets: expected object`,
      };
    }
    const cgSingle = validateStateBrackets(
      value.capitalGainsBrackets.single,
      `states.${code}.capitalGainsBrackets.single`,
    );
    if (!cgSingle.ok) return cgSingle;
    const cgMfj = validateStateBrackets(
      value.capitalGainsBrackets.mfj,
      `states.${code}.capitalGainsBrackets.mfj`,
    );
    if (!cgMfj.ok) return cgMfj;
    let cgHoh: TaxBracket[] | undefined;
    if (value.capitalGainsBrackets.hoh !== undefined) {
      const parsed = validateStateBrackets(
        value.capitalGainsBrackets.hoh,
        `states.${code}.capitalGainsBrackets.hoh`,
      );
      if (!parsed.ok) return parsed;
      cgHoh = parsed.value;
    }
    table.capitalGainsBrackets = {
      single: cgSingle.value,
      mfj: cgMfj.value,
      ...(cgHoh ? { hoh: cgHoh } : {}),
    };
  }
  if (value.notes !== undefined) {
    if (typeof value.notes !== "string") {
      return { ok: false, error: `states.${code}.notes: expected string` };
    }
    table.notes = value.notes;
  }

  if (table.hasIncomeTax && table.brackets.single.length === 0) {
    return {
      ok: false,
      error: `states.${code}: hasIncomeTax true requires non-empty brackets`,
    };
  }
  if (
    table.capitalGainsOnly &&
    (!table.capitalGainsBrackets ||
      table.capitalGainsBrackets.single.length === 0)
  ) {
    return {
      ok: false,
      error: `states.${code}: capitalGainsOnly requires capitalGainsBrackets`,
    };
  }

  return { ok: true, value: table };
}

/** Validate a StateIncomeTaxYear candidate (all 50 states + DC). */
export function validateStateIncomeTaxYear(
  value: unknown,
): ValidateResult<StateIncomeTaxYear> {
  if (!isRecord(value)) {
    return { ok: false, error: "state-income-tax data: expected object" };
  }
  if (typeof value.year !== "number" || !Number.isInteger(value.year)) {
    return { ok: false, error: "year: expected integer" };
  }
  if (
    typeof value.reviewedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.reviewedAt)
  ) {
    return {
      ok: false,
      error: "reviewedAt: expected ISO date YYYY-MM-DD (last human review)",
    };
  }
  const reviewedMs = Date.parse(`${value.reviewedAt}T00:00:00Z`);
  if (!Number.isFinite(reviewedMs)) {
    return { ok: false, error: "reviewedAt: invalid date" };
  }
  if (!isRecord(value.states)) {
    return { ok: false, error: "states: expected object" };
  }
  const states = {} as Record<UsStateCode, StateTaxTable>;
  for (const code of ALL_STATE_CODES) {
    if (!(code in value.states)) {
      return { ok: false, error: `states: missing ${code}` };
    }
    const table = validateStateTable(value.states[code], code);
    if (!table.ok) return table;
    states[code] = table.value;
  }
  for (const key of Object.keys(value.states)) {
    if (!(ALL_STATE_CODES as readonly string[]).includes(key)) {
      return { ok: false, error: `states: unknown code ${key}` };
    }
  }
  const out: StateIncomeTaxYear = {
    year: value.year,
    reviewedAt: value.reviewedAt,
    states,
  };
  if (value.sourceUrl !== undefined) {
    if (typeof value.sourceUrl !== "string" || value.sourceUrl.trim() === "") {
      return { ok: false, error: "sourceUrl: expected non-empty string" };
    }
    out.sourceUrl = value.sourceUrl;
  }
  return { ok: true, value: out };
}

/** Validate a MedicarePartBYear candidate. */
export function validateMedicarePartBYear(
  value: unknown,
  opts: { allowRateChange?: boolean } = {},
): ValidateResult<MedicarePartBYear> {
  if (!isRecord(value)) {
    return { ok: false, error: "medicare data: expected object" };
  }
  if (typeof value.year !== "number" || !Number.isInteger(value.year)) {
    return { ok: false, error: "year: expected integer" };
  }
  if (
    typeof value.standardMonthlyPremium !== "number" ||
    !Number.isFinite(value.standardMonthlyPremium) ||
    value.standardMonthlyPremium < 0
  ) {
    return {
      ok: false,
      error: "standardMonthlyPremium: expected non-negative number",
    };
  }
  if (!isRecord(value.tiers)) {
    return { ok: false, error: "tiers: expected object" };
  }
  const allowTiersChange = opts.allowRateChange === true;
  const single = validateMedicareTiers(
    value.tiers.single,
    "tiers.single",
    allowTiersChange,
  );
  if (!single.ok) return single;
  const mfj = validateMedicareTiers(
    value.tiers.mfj,
    "tiers.mfj",
    allowTiersChange,
  );
  if (!mfj.ok) return mfj;

  return {
    ok: true,
    value: {
      year: value.year,
      standardMonthlyPremium: value.standardMonthlyPremium,
      tiers: { single: single.value, mfj: mfj.value },
    },
  };
}

export function validateMeta(value: unknown): ValidateResult<ExternalDataMeta> {
  if (!isRecord(value)) {
    return { ok: false, error: "meta: expected object" };
  }
  for (const field of ["source", "updateMethod", "format", "processor"] as const) {
    if (typeof value[field] !== "string" || value[field].trim() === "") {
      return { ok: false, error: `meta.${field}: expected non-empty string` };
    }
  }
  const meta: ExternalDataMeta = {
    source: value.source as string,
    updateMethod: value.updateMethod as string,
    format: value.format as string,
    processor: value.processor as string,
  };
  if (value.sourceUrl !== undefined) {
    if (typeof value.sourceUrl !== "string") {
      return { ok: false, error: "meta.sourceUrl: expected string" };
    }
    meta.sourceUrl = value.sourceUrl;
  }
  if (value.notes !== undefined) {
    if (typeof value.notes !== "string") {
      return { ok: false, error: "meta.notes: expected string" };
    }
    meta.notes = value.notes;
  }
  return { ok: true, value: meta };
}

/** Validate dataset payload by key. Unimplemented keys reject until wired. */
export function validateDatasetData(
  key: ExternalDataKey,
  data: unknown,
  opts: { allowRateChange?: boolean } = {},
): ValidateResult<unknown> {
  if (key === "federal-tax") return validateFederalTaxYear(data, opts);
  if (key === "medicare") return validateMedicarePartBYear(data, opts);
  if (key === "state-income-tax") return validateStateIncomeTaxYear(data);
  return {
    ok: false,
    error: `dataset "${key}" is not implemented for apply/PUT yet`,
  };
}

/** Year field for staleness checks. */
export function yearFromData(key: ExternalDataKey, data: unknown): number | null {
  if (key === "federal-tax") {
    const v = validateFederalTaxYear(data, { allowRateChange: true });
    return v.ok ? v.value.year : null;
  }
  if (key === "medicare") {
    const v = validateMedicarePartBYear(data, { allowRateChange: true });
    return v.ok ? v.value.year : null;
  }
  if (key === "state-income-tax") {
    const v = validateStateIncomeTaxYear(data);
    return v.ok ? v.value.year : null;
  }
  if (isRecord(data) && typeof data.year === "number") return data.year;
  return null;
}
