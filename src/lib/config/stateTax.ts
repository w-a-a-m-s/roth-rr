import type { TaxBracket, UsStateCode } from "../domain/types";
import type { FilingTable } from "./filingStatus";
import stateIncomeTaxFallback from "./data/stateIncomeTax.json";

/**
 * State income-tax parameters (2026 Tax Foundation snapshot). Live values live
 * in Mongo `external_data` (key `state-income-tax`) and are hydrated on app
 * boot. This module holds the types, committed fallback, and state labels.
 *
 * See docs/external-data.md for how to update.
 */

export type { UsStateCode };

export type StateCapitalGainsTreatment = "ordinary" | "exempt" | "preferential";

export interface StateTaxTable {
  name: string;
  hasIncomeTax: boolean;
  /** True if the state only taxes capital gains (Washington). */
  capitalGainsOnly?: boolean;
  /** `hoh` is optional; {@link forFiling} aliases to `single` when omitted. */
  brackets: FilingTable<TaxBracket[]>;
  standardDeduction: FilingTable<number>;
  /**
   * Personal exemption treated as an additional dollar deduction (single /
   * couple total for MFJ). Credits are modeled as 0.
   */
  personalExemption: FilingTable<number>;
  /**
   * Fraction of Social Security benefits included in state taxable income
   * (0 = exempt, 0.85 = like federal).
   */
  socialSecurityTaxablePct: number;
  capitalGains: StateCapitalGainsTreatment;
  /**
   * Preferential capital-gains brackets when they differ from ordinary income.
   * For v1, only Washington uses this via `capitalGainsOnly`.
   */
  capitalGainsBrackets?: FilingTable<TaxBracket[]>;
  notes?: string;
}

export interface StateIncomeTaxYear {
  year: number;
  /**
   * ISO date (YYYY-MM-DD) of the last human review against Tax Foundation /
   * state DOR. `external-data:check` fails when this is older than the
   * configured max age — state rates change mid-year and year alone is not enough.
   */
  reviewedAt: string;
  /** Primary source URL used for the last review (optional provenance). */
  sourceUrl?: string;
  states: Record<UsStateCode, StateTaxTable>;
}

export const US_STATE_CODES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
] as const;

/** Runtime list of all supported jurisdiction codes (same as US_STATE_CODES). */
export const ALL_STATE_CODES: readonly UsStateCode[] = US_STATE_CODES;

export const US_STATE_LABELS: Record<UsStateCode, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "District of Columbia",
};

/** Committed fallback (offline, tests, first paint). */
export const FALLBACK_STATE_INCOME_TAX: StateIncomeTaxYear =
  stateIncomeTaxFallback as StateIncomeTaxYear;

export function isUsStateCode(value: string): value is UsStateCode {
  return (US_STATE_CODES as readonly string[]).includes(value);
}

export function getStateTaxTable(
  data: StateIncomeTaxYear,
  code: UsStateCode,
): StateTaxTable {
  return data.states[code];
}
