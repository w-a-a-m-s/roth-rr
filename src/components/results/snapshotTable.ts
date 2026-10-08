import { accountsInDisplayOrder } from "@/lib/domain/household";
import type { Household } from "@/lib/domain/types";
import type { ProjectionRow, ScenarioResult } from "@/lib/engine/types";
import { careMonthly, incomeLabel } from "@/components/results/incomeLabels";

/** How many years the snapshot shows, like the deck's slide. */
export const SNAPSHOT_YEARS = 6;

export type SnapshotTone = "plain" | "roth" | "tax" | "strong" | "surplus";

export interface SnapshotLine {
  key: string;
  label: string;
  values: number[];
  tone: SnapshotTone;
}

export interface SnapshotSection {
  key: "assets" | "income" | "cashflow";
  title: string;
  lines: SnapshotLine[];
}

export interface SnapshotTable {
  years: number[];
  /** Age per year, or null once that person has passed (Survivorship). */
  ages: { label: string; values: (number | null)[] }[];
  sections: SnapshotSection[];
}

const AFTER_TAX_KINDS = new Set(["investment", "annuity", "cd", "savings"]);

/** Window rows: `count` years starting at `startYear` (clamped to the projection). */
export function snapshotRows(
  rows: ProjectionRow[],
  startYear: number,
  count = SNAPSHOT_YEARS,
): ProjectionRow[] {
  if (rows.length === 0) return [];
  const lastStart = Math.max(0, rows.length - count);
  const found = rows.findIndex((r) => r.calendarYear === startYear);
  const start = Math.min(found < 0 ? 0 : found, lastStart);
  return rows.slice(start, start + count);
}

/**
 * Income sources in plan order (incomes, then an RMD per tax-deferred account,
 * then real estate). A source shows when it pays anything in any projection
 * year, so an RMD that starts later still has its row of $0 in the early years.
 */
function incomeKeys(scenario: ScenarioResult, household: Household): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const add = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    keys.push(key);
  };
  for (const income of household.incomes) add(income.id);
  for (const acc of accountsInDisplayOrder(household.accounts)) {
    if (acc.kind === "retirementTaxable") add(`rmd:${acc.id}`);
  }
  for (const re of household.realEstate) add(`re:${re.id}`);
  for (const row of scenario.rows) {
    for (const key of Object.keys(row.incomeMonthly)) add(key);
  }
  return keys.filter((key) =>
    scenario.rows.some((r) => (r.incomeMonthly[key] ?? 0) !== 0),
  );
}

/**
 * The slide-style "Assets, Income & Taxes" table for one scenario: balances
 * per account, monthly income per source, and the monthly cash flow, over a
 * short window of years. Values come straight off the projection rows.
 */
export function buildSnapshotTable(
  scenario: ScenarioResult,
  household: Household,
  primaryId: string,
  startYear: number,
  count = SNAPSHOT_YEARS,
): SnapshotTable {
  const window = snapshotRows(scenario.rows, startYear, count);
  const pick = (fn: (r: ProjectionRow) => number) => window.map(fn);

  const people = [
    ...household.people.filter((p) => p.id === primaryId),
    ...household.people.filter((p) => p.id !== primaryId),
  ];
  const ages = people.map((p) => ({
    label: p.name ? `Age · ${p.name}` : "Age",
    values: window.map((r) =>
      r.livingIds.includes(p.id) ? (r.ages[p.id] ?? 0) : null,
    ),
  }));

  const accounts = accountsInDisplayOrder(household.accounts);
  const assetLines: SnapshotLine[] = [];
  for (const acc of accounts) {
    if (acc.kind !== "retirementTaxable" && !AFTER_TAX_KINDS.has(acc.kind)) continue;
    assetLines.push({
      key: `acc-${acc.id}`,
      label: acc.label,
      values: pick((r) => r.balances[acc.id] ?? 0),
      tone: "plain",
    });
  }
  if (scenario.rows.some((r) => r.realEstateValue !== 0)) {
    assetLines.push({
      key: "re-equity",
      label: "Real-estate equity",
      values: pick((r) => r.realEstateEquity),
      tone: "plain",
    });
  }
  assetLines.push({
    key: "roth",
    label: "Roth",
    values: pick((r) => r.rothTotal),
    tone: "roth",
  });
  if (scenario.rows.some((r) => r.conversion !== 0)) {
    assetLines.push({
      key: "conversion",
      label: "Converted to Roth (yr)",
      values: pick((r) => r.conversion),
      tone: "roth",
    });
  }

  const incomeLines: SnapshotLine[] = incomeKeys(scenario, household).map(
    (key) => ({
      key: `inc-${key}`,
      label: incomeLabel(household, key),
      values: pick((r) => r.incomeMonthly[key] ?? 0),
      tone: "plain",
    }),
  );

  const cashLines: SnapshotLine[] = [
    {
      key: "gross",
      label: "Gross monthly income",
      values: pick((r) => r.totalMonthlyIncome),
      tone: "plain",
    },
    {
      key: "tax",
      label: "Monthly tax",
      values: pick((r) => r.monthlyTax),
      tone: "tax",
    },
    {
      key: "net",
      label: "Net monthly income",
      values: pick((r) => r.netMonthlyIncome),
      tone: "strong",
    },
    {
      key: "expenses",
      label: "Monthly expenses",
      values: pick((r) => r.monthlyExpenses - careMonthly(r.expenseMonthly)),
      tone: "plain",
    },
  ];
  if (scenario.rows.some((r) => careMonthly(r.expenseMonthly) !== 0)) {
    cashLines.push({
      key: "care",
      label: "Long-term care",
      values: pick((r) => careMonthly(r.expenseMonthly)),
      tone: "tax",
    });
  }
  if (scenario.rows.some((r) => r.monthlyDeposits !== 0)) {
    cashLines.push({
      key: "deposits",
      label: "Monthly deposits",
      values: pick((r) => r.monthlyDeposits),
      tone: "plain",
    });
  }
  cashLines.push({
    key: "surplus",
    label: "Surplus",
    values: pick((r) => r.surplus),
    tone: "surplus",
  });

  return {
    years: pick((r) => r.calendarYear),
    ages,
    sections: [
      { key: "assets", title: "Assets", lines: assetLines },
      { key: "income", title: "Income", lines: incomeLines },
      { key: "cashflow", title: "Cash flow", lines: cashLines },
    ],
  };
}
