import type { Household, InsuranceKind } from "@/lib/domain/types";
import { insurancePolicy } from "@/lib/domain/insurance";
import { propertyLoans } from "@/lib/domain/propertyLoans";
import { CAR_EXPENSE_KEY } from "@/lib/engine/otherExpenses";

const INSURANCE_INCOME_LABELS: Record<InsuranceKind, string> = {
  life: "Income from life insurance",
  disability: "Income from disability insurance",
  longTermCare: "Long-term care insurance",
};

const INSURANCE_PREFIXES: Record<string, InsuranceKind> = {
  "life:": "life",
  "di:": "disability",
  "ltci:": "longTermCare",
};

/** The policy behind a `life:` / `di:` / `ltci:` key, or null for any other key. */
export function insuranceKeyKind(key: string): InsuranceKind | null {
  for (const [prefix, kind] of Object.entries(INSURANCE_PREFIXES)) {
    if (key.startsWith(prefix)) return kind;
  }
  return null;
}

/** "Income from life insurance · Term 20" for an insurance income or balance key. */
export function insuranceLabel(household: Household, key: string): string {
  const kind = insuranceKeyKind(key) ?? "life";
  const base = INSURANCE_INCOME_LABELS[kind];
  const policy = insurancePolicy(household, key.slice(key.indexOf(":") + 1));
  if (!policy) return base;
  const insured = household.people.find((p) => p.id === policy.insuredId)?.name?.trim();
  const name = policy.label?.trim() || insured;
  return name ? `${base} · ${name}` : base;
}

/**
 * Display label for an income key in the results: an income id, `rmd:<account>`
 * `re:<property>`, `draw:<account>` (an event's lifetime income), `topup:<account>` (more to cover a short year), or an insurance benefit (`life:`, `di:`, `ltci:`). Social Security also names whose benefit it is, unless
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
  if (key.startsWith("draw:")) {
    const acc = household.accounts.find((a) => a.id === key.slice(5));
    return acc?.label?.trim() ? `Lifetime income · ${acc.label.trim()}` : "Lifetime income";
  }
  if (key.startsWith("topup:")) {
    const acc = household.accounts.find((a) => a.id === key.slice(6));
    return acc?.label?.trim() ? `Extra withdrawal · ${acc.label.trim()}` : "Extra withdrawal";
  }
  if (insuranceKeyKind(key)) return insuranceLabel(household, key);
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

/**
 * Display label for an expense key: an expense id, `ltc:<person>` care,
 * `loan:<property>` loan payments, `premium:<policy>` insurance premiums or
 * the Car analysis.
 */
export function expenseLabel(household: Household, key: string): string {
  if (key.startsWith("loan:")) {
    const re = household.realEstate.find((r) => r.id === key.slice(5));
    const loans = re ? propertyLoans(re) : [];
    const kind = loans.length > 0 && loans.every((l) => l.kind === "lineOfCredit") ? "Line of credit" : "Mortgage";
    return re?.label?.trim() ? `${kind} · ${re.label.trim()}` : kind;
  }
  if (key.startsWith("ltc:")) {
    const name = household.people.find((p) => p.id === key.slice(4))?.name?.trim();
    return name ? `Long-term care · ${name}` : "Long-term care";
  }
  if (key.startsWith("premium:")) {
    const policy = (household.insurance ?? []).find((p) => p.id === key.slice(8));
    const name = policy?.label?.trim();
    return name ? `Insurance premium · ${name}` : "Insurance premium";
  }
  if (key === CAR_EXPENSE_KEY) return "Car (from Car analysis)";
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

/** `life:` balance keys that hold anything in some row (Survivorship proceeds). */
export function lifeInsuranceBalanceKeys(
  rows: { balances: Record<string, number> }[],
): string[] {
  const keys: string[] = [];
  for (const row of rows) {
    for (const [key, value] of Object.entries(row.balances)) {
      if (!key.startsWith("life:") || value === 0 || keys.includes(key)) continue;
      keys.push(key);
    }
  }
  return keys;
}

/** Display label for a life insurance proceeds balance. */
export function lifeProceedsLabel(household: Household, key: string): string {
  return insuranceLabel(household, key).replace(
    "Income from life insurance",
    "Life insurance proceeds",
  );
}
