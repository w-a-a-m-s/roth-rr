import type { FederalTaxYear } from "@/lib/config/federalTax";
import type { MedicarePartBYear } from "@/lib/config/medicare";
import type { StateIncomeTaxYear } from "@/lib/config/stateTax";

/** Dataset keys stored in Mongo `external_data` (one document per key). */
export type ExternalDataKey =
  | "federal-tax"
  | "medicare"
  | "rmd"
  | "state-income-tax";

/** Provenance mirrored from docs/external-data.md, stored on each DB doc. */
export interface ExternalDataMeta {
  source: string;
  sourceUrl?: string;
  updateMethod: string;
  format: string;
  processor: string;
  notes?: string;
}

/** Public shape returned by GET /api/external-data. */
export interface ExternalDataRecord {
  key: ExternalDataKey;
  year: number;
  data: unknown;
  meta: ExternalDataMeta;
  updatedAt: number;
  updatedBy?: string;
}

/** Reference tables the pure engine receives as arguments (never fetches). */
export interface ReferenceData {
  federalTax: FederalTaxYear;
  medicare: MedicarePartBYear;
  stateIncomeTax: StateIncomeTaxYear;
  /**
   * Date the plan's starting balances are as of (ISO `YYYY-MM-DD`). The app
   * stamps today's date so the first projection year only grows for the rest
   * of that year. Omitted (tests, golden cases) means January 1 of the start
   * year, a full first year of growth.
   */
  asOfDate?: string;
}

export const EXTERNAL_DATA_KEYS: ExternalDataKey[] = [
  "federal-tax",
  "medicare",
  "rmd",
  "state-income-tax",
];

export function isExternalDataKey(value: unknown): value is ExternalDataKey {
  return (
    typeof value === "string" &&
    (EXTERNAL_DATA_KEYS as string[]).includes(value)
  );
}
