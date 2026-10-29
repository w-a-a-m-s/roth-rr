import {
  accountsInDisplayOrder,
  afterTaxAccountsByKind,
  isWithdrawalIncome,
} from "@/lib/domain/household";
import type { AccountKind, Household, IncomeKind } from "@/lib/domain/types";
import { LEFTOVER_ACCOUNT_ID, LEFTOVER_INVESTMENT_LABEL } from "@/lib/config/defaults";
import { firstRmdYear } from "@/components/results/AgeMarks";
import type { ProjectionRow, ScenarioResult } from "@/lib/engine/types";
import {
  careMonthly,
  incomeLabel,
  lifeInsuranceBalanceKeys,
  lifeProceedsLabel,
  insuranceKeyKind,
} from "@/components/results/incomeLabels";
import { surplusLabel } from "@/components/results/chartUtils";

/** How many years the snapshot shows, like the deck's slide. */
export const SNAPSHOT_YEARS = 6;

export type SnapshotTone = "plain" | "roth" | "tax" | "strong" | "surplus";

export type SnapshotTint =
  | "realEstate"
  | "business"
  | "life"
  | "disability"
  | "longTermCare"
  | IncomeTint
  | AfterTaxTint;

/**
 * Income lines by where the money comes from: fixed income (pensions and
 * Social Security), regular withdrawals from accounts (scheduled draws),
 * RMDs, and the extra money an event takes from the accounts (a long-term
 * care or survivorship lifetime income, or a top-up for a short year).
 */
export type IncomeTint = "fixedIncome" | "accountDraw" | "rmd" | "eventDraw";

const FIXED_INCOME_KINDS: IncomeKind[] = ["pension", "militaryPension", "socialSecurity"];

/**
 * Row background per income source, shared by the Assets, Income & Taxes
 * table and the year-by-year table: fixed income a soft sage (apart from the
 * income section's own green), regular account withdrawals the retirement
 * assets' blue, RMDs a lavender, an event's extra draws amber.
 */
export const INCOME_TINT_ROW: Record<IncomeTint, string> = {
  fixedIncome: "bg-[#E4EFD3]",
  accountDraw: "bg-[#E1EAF6]",
  rmd: "bg-[#ECE6F7]",
  eventDraw: "bg-[#FBEBCF]",
};

/** After-tax accounts are grouped by type, each type in its own shade. */
export type AfterTaxTint = "brokerage" | "annuity" | "cash" | "dpp";

const AFTER_TAX_TINT: Partial<Record<AccountKind, AfterTaxTint>> = {
  investment: "brokerage",
  annuity: "annuity",
  cd: "cash",
  savings: "cash",
  dppMlp: "dpp",
};

/**
 * Tint for an income key: an insurance benefit's own color, or its
 * `IncomeTint`. Salary, business, rent and other income keep the section's.
 */
export function incomeTint(household: Household, key: string): SnapshotTint | undefined {
  return insuranceKeyKind(key) ?? incomeSourceTint(household, key);
}

/** Fixed income, a regular account withdrawal, or an event's extra draw. */
export function incomeSourceTint(household: Household, key: string): IncomeTint | undefined {
  if (insuranceKeyKind(key)) return undefined;
  if (key.startsWith("draw:") || key.startsWith("topup:")) return "eventDraw";
  if (key.startsWith("rmd:")) return "rmd";
  const income = household.incomes.find((i) => i.id === key);
  if (!income) return undefined;
  if (isWithdrawalIncome(income.kind)) return "accountDraw";
  if (FIXED_INCOME_KINDS.includes(income.kind)) return "fixedIncome";
  return undefined;
}

/** Asset groups in the assets section, each with its own tint and total. */
export type SnapshotAssetGroup = "retirement" | "regular" | "roth";

export interface SnapshotLine {
  key: string;
  label: string;
  values: number[];
  tone: SnapshotTone;
  /** Assets section only: which group the line belongs to. */
  group?: SnapshotAssetGroup;
  /**
   * A line that gets its own color so it reads apart from its neighbors:
   * real estate vs business equity, and each kind of insurance.
   */
  tint?: SnapshotTint;
  /** True for a group's total row. */
  subtotal?: boolean;
}

export interface SnapshotSection {
  key: "assets" | "income" | "cashflow" | "conversionTax" | "depreciation";
  title: string;
  lines: SnapshotLine[];
}

export interface SnapshotAges {
  label: string;
  values: (number | null)[];
  /** Calendar year this person retires, highlighted in their age row. */
  retireYear?: number;
  /** Calendar year this person's first RMD is due (birth year + RMD age). */
  rmdYear?: number;
}

export interface SnapshotTable {
  years: number[];
  /** Age per year, or null once that person has passed (Survivorship). */
  ages: SnapshotAges[];
  sections: SnapshotSection[];
}

/** The engine's stand-in Roth when a converting plan has no Roth account. */
const IMPLICIT_ROTH_ID = "__implicit_roth__";

/**
 * Where the results start: today, or the analysis's milestone (retirement,
 * the death in Survivorship, the start of care in Long-term care).
 */
export type SnapshotFrom = "today" | "milestone";

/**
 * First year shown for a wanted start year, clamped to the projection: a
 * plan that starts later opens on its first year, and a milestone past the
 * last year shows the last one.
 */
export function snapshotFromYear(years: number[], wanted: number): number {
  if (years.length === 0) return wanted;
  if (!Number.isFinite(wanted) || wanted <= years[0]) return years[0];
  return years.find((y) => y >= wanted) ?? years[years.length - 1];
}

/** The scenario with only the years from `fromYear` on, for display. */
export function scenarioFrom(scenario: ScenarioResult, fromYear: number): ScenarioResult {
  const rows = scenario.rows.filter((r) => r.calendarYear >= fromYear);
  if (rows.length === scenario.rows.length) return scenario;
  return { ...scenario, rows };
}

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
 * Assets in three groups, each followed by its total: retirement assets
 * (tax-deferred accounts), regular investments (after-tax accounts, each
 * property's equity, each business's equity), and Roth (every Roth account, plus the
 * yearly conversion row when the scenario converts). The Roth group always
 * shows; the other two only when the plan has something in them. A final
 * "Total assets" row adds up all three groups.
 */
function buildAssetLines(
  scenario: ScenarioResult,
  household: Household,
  pick: (fn: (r: ProjectionRow) => number) => number[],
): SnapshotLine[] {
  const accounts = accountsInDisplayOrder(household.accounts);
  const accountLine = (
    acc: (typeof accounts)[number],
    group: SnapshotAssetGroup,
  ): SnapshotLine => ({
    key: `acc-${acc.id}`,
    label: acc.label,
    values: pick((r) => r.balances[acc.id] ?? 0),
    tone: "plain",
    group,
  });

  const retirement = accounts
    .filter((acc) => acc.kind === "retirementTaxable")
    .map((acc) => accountLine(acc, "retirement"));

  // Grouped by type (brokerage, annuity, CD, savings, DPP / MLP), each type
  // in its own shade.
  const regular: SnapshotLine[] = afterTaxAccountsByKind(accounts).map((acc) => ({
    ...accountLine(acc, "regular"),
    tint: AFTER_TAX_TINT[acc.kind],
  }));
  // Survivorship: life insurance proceeds sit with the after-tax money.
  for (const key of lifeInsuranceBalanceKeys(scenario.rows)) {
    regular.push({
      key: `acc-${key}`,
      tint: "life",
      label: lifeProceedsLabel(household, key),
      values: pick((r) => r.balances[key] ?? 0),
      tone: "plain",
      group: "regular",
    });
  }
  // The plan's saved leftover money, when it invests it.
  if (scenario.rows.some((r) => (r.balances[LEFTOVER_ACCOUNT_ID] ?? 0) !== 0)) {
    const choice = household.assumptions.leftoverInvestment;
    regular.push({
      key: `acc-${LEFTOVER_ACCOUNT_ID}`,
      tint: AFTER_TAX_TINT[choice === "moneyMarket" ? "savings" : "investment"],
      label: choice ? LEFTOVER_INVESTMENT_LABEL[choice] : "Leftover money",
      values: pick((r) => r.balances[LEFTOVER_ACCOUNT_ID] ?? 0),
      tone: "plain",
      group: "regular",
    });
  }
  // One row per property, so each one's equity reads on its own.
  for (const re of household.realEstate) {
    if (!scenario.rows.some((r) => (r.realEstateEquityById[re.id] ?? 0) !== 0)) {
      continue;
    }
    regular.push({
      key: `re-${re.id}`,
      tint: "realEstate",
      label: re.label ? `Real estate · ${re.label}` : "Real-estate equity",
      values: pick((r) => r.realEstateEquityById[re.id] ?? 0),
      tone: "plain",
      group: "regular",
    });
  }
  for (const biz of household.businesses ?? []) {
    regular.push({
      key: `biz-${biz.id}`,
      tint: "business",
      label: biz.label ? `Business · ${biz.label}` : "Business equity",
      values: pick((r) => r.businessEquityById[biz.id] ?? 0),
      tone: "plain",
      group: "regular",
    });
  }

  const roth = accounts
    .filter((acc) => acc.kind === "rothTaxFree")
    .map((acc) => accountLine(acc, "roth"));
  if (scenario.rows.some((r) => (r.balances[IMPLICIT_ROTH_ID] ?? 0) !== 0)) {
    roth.push({
      key: `acc-${IMPLICIT_ROTH_ID}`,
      label: "New Roth (conversions)",
      values: pick((r) => r.balances[IMPLICIT_ROTH_ID] ?? 0),
      tone: "plain",
      group: "roth",
    });
  }

  const lines: SnapshotLine[] = [];
  if (retirement.length > 0) {
    lines.push(...retirement, {
      key: "retirement-total",
      label: "Total retirement assets",
      values: pick((r) => r.retirementTotal),
      tone: "strong",
      group: "retirement",
      subtotal: true,
    });
  }
  if (regular.length > 0) {
    lines.push(...regular, {
      key: "regular-total",
      label: "Total regular investments",
      values: pick(
        (r) => r.afterTaxTotal + r.realEstateEquity + r.businessEquity,
      ),
      tone: "strong",
      group: "regular",
      subtotal: true,
    });
  }
  lines.push(...roth, {
    key: "roth",
    label: "Total Roth",
    values: pick((r) => r.rothTotal),
    tone: "roth",
    group: "roth",
    subtotal: true,
  });
  if (scenario.rows.some((r) => r.conversion !== 0)) {
    lines.push({
      key: "conversion",
      label: "Converted to Roth (yr)",
      values: pick((r) => r.conversion),
      tone: "roth",
      group: "roth",
    });
  }
  lines.push({
    key: "assets-total",
    label: "Total assets",
    values: pick(
      (r) =>
        r.retirementTotal +
        r.afterTaxTotal +
        r.realEstateEquity +
        r.businessEquity +
        r.rothTotal,
    ),
    tone: "strong",
    subtotal: true,
  });
  return lines;
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
  const ages = people.map((p): SnapshotAges => {
    return {
      label: p.name ? `Age · ${p.name}` : "Age",
      values: window.map((r) =>
        r.livingIds.includes(p.id) ? (r.ages[p.id] ?? 0) : null,
      ),
      retireYear: p.retirementYear,
      rmdYear: firstRmdYear(p),
    };
  });

  const assetLines = buildAssetLines(scenario, household, pick);

  const incomeLines: SnapshotLine[] = incomeKeys(scenario, household).map(
    (key) => ({
      key: `inc-${key}`,
      label: incomeLabel(household, key),
      values: pick((r) => r.incomeMonthly[key] ?? 0),
      tone: "plain",
      tint: incomeTint(household, key),
    }),
  );
  // Every source added up, so the month's income reads in one number.
  if (incomeLines.length > 0) {
    incomeLines.push({
      key: "income-total",
      label: "Total monthly income",
      values: pick((r) => r.totalMonthlyIncome),
      tone: "strong",
      subtotal: true,
    });
  }

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
  const surplusValues = pick((r) => r.surplus);
  cashLines.push({
    key: "surplus",
    label: surplusLabel(surplusValues),
    values: surplusValues,
    tone: "surplus",
  });

  // Conversion tax paid from assets gets its own section under Cash flow,
  // monthly and yearly, only when some year withholds it.
  const conversionTaxSections: SnapshotSection[] = scenario.rows.some(
    (r) => r.conversionTaxWithheld > 0,
  )
    ? [
        {
          key: "conversionTax",
          title: "Tax paid from conversion",
          lines: [
            {
              key: "withheldMonthly",
              label: "Monthly",
              values: pick((r) => r.conversionTaxWithheld / 12),
              tone: "plain",
            },
            {
              key: "withheldAnnual",
              label: "Annual",
              values: pick((r) => r.conversionTaxWithheld),
              tone: "plain",
            },
          ],
        },
      ]
    : [];

  // One-time 100% depreciation: one line per asset in its year, shown only
  // when a year in this window has some.
  const depreciationLines: SnapshotLine[] = (household.oneTimeDepreciation ?? [])
    .filter((d) => !d.hidden)
    .map((d) => ({
      key: `dep-${d.id}`,
      label: `${d.label || "Asset"} (${d.year})`,
      values: pick((r) => r.oneTimeDepreciationById[d.id] ?? 0),
      tone: "plain" as const,
    }))
    .filter((line) => line.values.some((v) => v !== 0));
  const depreciationSections: SnapshotSection[] =
    depreciationLines.length > 0
      ? [
          {
            key: "depreciation",
            title: "100% depreciation (off taxable income)",
            lines: depreciationLines,
          },
        ]
      : [];

  return {
    years: pick((r) => r.calendarYear),
    ages,
    sections: [
      { key: "assets", title: "Assets", lines: assetLines },
      { key: "income", title: "Income", lines: incomeLines },
      { key: "cashflow", title: "Cash flow", lines: cashLines },
      ...conversionTaxSections,
      ...depreciationSections,
    ],
  };
}
