import type { FilingStatus } from "@/lib/domain/types";
import type { ProjectionRow } from "@/lib/engine/types";
import { FILING_STATUS_LABELS } from "@/lib/config/defaults";
import { formatCurrency } from "@/lib/format";

type Row = Pick<ProjectionRow, "filingStatus" | "federalTaxByBracket">;

/** Short names for a row label that shows more than one status. */
const SHORT_STATUS: Record<FilingStatus, string> = {
  mfj: "Joint",
  single: "Single",
  hoh: "HOH",
};

function range(floor: number, ceiling: number | null): string {
  if (ceiling == null) return `${formatCurrency(floor)} and up`;
  return `${formatCurrency(floor)} to ${formatCurrency(ceiling)}`;
}

/** Filing statuses in the order the rows use them (one unless widowed). */
function statusesInOrder(rows: Row[]): FilingStatus[] {
  const seen: FilingStatus[] = [];
  for (const row of rows) {
    if (!seen.includes(row.filingStatus)) seen.push(row.filingStatus);
  }
  return seen;
}

/**
 * "Tax @ 24% ($105,700 to $201,775)": the bracket's taxable-income range for
 * the plan's filing status. When the status changes partway (a surviving
 * spouse files single), each status's range is named.
 */
export function federalBracketLabel(rows: Row[], index: number): string {
  const statuses = statusesInOrder(rows);
  const rate = rows[0]?.federalTaxByBracket[index]?.rate ?? 0;
  const label = `Tax @ ${Math.round(rate * 100)}%`;
  const ranges = statuses.flatMap((fs) => {
    const bracket = rows.find((r) => r.filingStatus === fs)
      ?.federalTaxByBracket[index];
    if (!bracket) return [];
    const text = range(bracket.floor, bracket.ceiling);
    return [statuses.length > 1 ? `${SHORT_STATUS[fs]} ${text}` : text];
  });
  if (ranges.length === 0) return label;
  return `${label} (${ranges.join("; ")})`;
}

/** "Federal tax brackets (Single)", or "(Married filing jointly, then Single)". */
export function federalBracketsTitle(rows: Row[]): string {
  const statuses = statusesInOrder(rows);
  if (statuses.length === 0) return "Federal tax brackets";
  const names = statuses.map((fs) => FILING_STATUS_LABELS[fs]).join(", then ");
  return `Federal tax brackets (${names})`;
}
