import type { FilingStatus } from "../domain/types";

/** Every filing status the planner understands. */
export const ALL_FILING_STATUSES: readonly FilingStatus[] = [
  "single",
  "mfj",
  "hoh",
];

export function isFilingStatus(value: unknown): value is FilingStatus {
  return (
    typeof value === "string" &&
    (ALL_FILING_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Filing statuses that every tax table is required to carry. Head of household
 * is optional: when a table has no `hoh` key, {@link forFiling} aliases to
 * `single` (CMS IRMAA and most state income-tax statutes have no HOH schedule).
 */
export const BASE_FILING_STATUSES = ["single", "mfj"] as const;
export type BaseFilingStatus = (typeof BASE_FILING_STATUSES)[number];

/** Statuses that reuse another status's table when they have no own key. */
export const TABLE_FALLBACK: Partial<Record<FilingStatus, BaseFilingStatus>> = {
  hoh: "single",
};

/**
 * A filing-status-keyed table: base statuses are required, others optional.
 * Use {@link forFiling} to read so a missing optional key aliases instead of
 * returning `undefined`.
 */
export type FilingTable<T> = Record<BaseFilingStatus, T> &
  Partial<Record<FilingStatus, T>>;

/**
 * Look up a filing-status-keyed value, falling back through {@link TABLE_FALLBACK}
 * when the status has no own key. Throws if neither the status nor its base
 * is present, so a missing table never silently becomes `undefined`.
 */
export function forFiling<T>(
  table: FilingTable<T>,
  filingStatus: FilingStatus,
  dataset = "tax table",
): T {
  const own = table[filingStatus];
  if (own !== undefined) return own;
  const base = TABLE_FALLBACK[filingStatus];
  if (base !== undefined) {
    const fallback = table[base];
    if (fallback !== undefined) return fallback;
  }
  throw new Error(
    `${dataset}: no ${filingStatus} entry` +
      (base ? ` (and no ${base} fallback)` : ""),
  );
}
