import type { Household } from "@/lib/domain/types";

/**
 * Display label for an income key in the results: an income id, `rmd:<account>`
 * or `re:<property>`. Social Security also names whose benefit it is, unless
 * the label already does.
 */
export function incomeLabel(household: Household, key: string): string {
  if (key.startsWith("rmd:")) {
    const acc = household.accounts.find((a) => a.id === key.slice(4));
    return acc ? `RMD · ${acc.label}` : "RMD";
  }
  if (key.startsWith("re:")) {
    const re = household.realEstate.find((r) => r.id === key.slice(3));
    return re ? `Real estate · ${re.label}` : "Real estate";
  }
  const income = household.incomes.find((i) => i.id === key);
  if (!income) return key;
  const label = income.label || "Income";
  if (income.kind !== "socialSecurity") return label;
  const owner = household.people
    .find((p) => p.id === income.ownerId)
    ?.name?.trim();
  if (!owner || label.toLowerCase().includes(owner.toLowerCase())) return label;
  return `${label} · ${owner}`;
}

/** Display label for an expense key: an expense id, or `ltc:<person>` care. */
export function expenseLabel(household: Household, key: string): string {
  if (key.startsWith("ltc:")) {
    const name = household.people.find((p) => p.id === key.slice(4))?.name?.trim();
    return name ? `Long-term care · ${name}` : "Long-term care";
  }
  return household.expenses.find((e) => e.id === key)?.label ?? key;
}

/** Monthly long-term care cost in a row (all `ltc:` expense keys). */
export function careMonthly(expenseMonthly: Record<string, number>): number {
  let total = 0;
  for (const [key, value] of Object.entries(expenseMonthly)) {
    if (key.startsWith("ltc:")) total += value;
  }
  return total;
}
