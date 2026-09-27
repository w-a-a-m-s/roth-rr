import type { Deposit } from "@/lib/domain/types";
import { formatCurrency } from "@/lib/format";

/** Amount and cadence, e.g. "$500/mo", "$6,000/yr", "$10,000 one time". */
export function depositAmountLabel(deposit: Deposit): string {
  const amount = formatCurrency(deposit.amount);
  if (deposit.frequency === "oneTime") return `${amount} one time`;
  return deposit.frequency === "monthly" ? `${amount}/mo` : `${amount}/yr`;
}

/** Years the deposit runs, e.g. "2027", "2026 to 2030", "2026 onward". */
export function depositYearsLabel(deposit: Deposit): string {
  if (!Number.isFinite(deposit.startYear)) return "no start year";
  if (deposit.frequency === "oneTime") return String(deposit.startYear);
  if (deposit.endYear == null) return `${deposit.startYear} onward`;
  if (deposit.endYear === deposit.startYear) return String(deposit.startYear);
  return `${deposit.startYear} to ${deposit.endYear}`;
}

/** One-line description used in summaries and plan-change lists. */
export function depositSummary(deposit: Deposit): string {
  const name = deposit.label?.trim() || "Deposit";
  return `${name}: ${depositAmountLabel(deposit)}, ${depositYearsLabel(deposit)}`;
}
