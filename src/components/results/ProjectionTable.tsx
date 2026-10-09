"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { accountsInDisplayOrder } from "@/lib/domain/household";
import { personRmdAge } from "@/lib/domain/rmd";
import type { Household } from "@/lib/domain/types";
import type { ScenarioResult } from "@/lib/engine/types";
import { formatCurrency } from "@/lib/format";
import {
  federalBracketLabel,
  federalBracketsTitle,
} from "@/components/results/bracketLabels";
import { expenseLabel, incomeLabel } from "@/components/results/incomeLabels";
import { useTopScrollbar } from "@/components/results/useTopScrollbar";

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if (oy === "auto" || oy === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Keeps the table at its natural height in normal flow until it scrolls up to
 * the top of the scroll area; from that point it "pins" - filling the remaining
 * viewport height and scrolling internally (which is what makes the sticky
 * year headers / section titles engage).
 *
 * Pinning shrinks the wrapper to the available height so the outer scroller's
 * range collapses and scrolling stops at the pin. We also clamp scrollTop while
 * pinned so trackpad inertia can't overshoot.
 *
 * Depends on the results `<main>` being the nearest overflow-y scroller
 * (see page.tsx). Do not put content below this table in the scroller, and do
 * not wrap it in a fixed max-height card.
 */
function usePinToTop() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pinScrollTopRef = useRef<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const [height, setHeight] = useState<number>();

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const scroller = findScrollParent(wrapper);
    if (!scroller) return;

    const update = () => {
      const cs = getComputedStyle(scroller);
      const padTop = parseFloat(cs.paddingTop) || 0;
      const padBottom = parseFloat(cs.paddingBottom) || 0;
      const sRect = scroller.getBoundingClientRect();
      const stickTop = sRect.top + padTop;
      const avail = scroller.clientHeight - padTop - padBottom;
      const wTop = wrapper.getBoundingClientRect().top;
      const table = wrapper.querySelector("table");
      const topBar = wrapper.querySelector<HTMLElement>("[data-top-scrollbar]");
      const contentH = table
        ? table.offsetHeight + (topBar?.offsetHeight ?? 0)
        : wrapper.scrollHeight;
      const tall = contentH > avail + 1;
      const nextPinned = tall && wTop <= stickTop + 1;

      if (nextPinned) {
        const pinAt = scroller.scrollTop + (wTop - stickTop);
        if (pinScrollTopRef.current === null) {
          pinScrollTopRef.current = Math.max(0, pinAt);
        }
        if (scroller.scrollTop > pinScrollTopRef.current + 0.5) {
          scroller.scrollTop = pinScrollTopRef.current;
        }
      } else {
        pinScrollTopRef.current = null;
      }

      setPinned(nextPinned);
      setHeight(avail);
    };

    update();
    scroller.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      scroller.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return { wrapperRef, pinned, height };
}

type Row = ScenarioResult["rows"][number];

type Unit = "mo" | "yr" | "sum" | "none";

interface LineDef {
  key: string;
  label: string;
  unit: Unit;
  value: (row: Row, primaryId: string) => number;
  /** Detail rows revealed when this line is expanded. */
  children?: LineDef[];
  /** Color positive green / negative red (e.g. surplus). */
  signed?: boolean;
}

interface Section {
  key: string;
  title?: string;
  lines: LineDef[];
}

const UNIT_LABEL: Record<Unit, string> = {
  mo: "/mo",
  yr: "/yr",
  sum: "balance",
  none: "",
};

const AFTER_TAX_KINDS = new Set(["investment", "annuity", "cd", "savings"]);

function formatValue(line: LineDef, row: Row, primaryId: string): string {
  const v = line.value(row, primaryId);
  if (line.unit === "none") return String(v);
  return formatCurrency(v);
}

/** Stable ordered keys for income detail rows across the projection. */
function incomeDetailKeys(
  scenario: ScenarioResult,
  household: Household
): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  const add = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    keys.push(key);
  };
  for (const income of household.incomes) add(income.id);
  for (const acc of household.accounts) {
    if (acc.kind === "retirementTaxable") add(`rmd:${acc.id}`);
  }
  for (const re of household.realEstate) add(`re:${re.id}`);
  // Catch any engine-only keys that aren't in the plan lists.
  for (const row of scenario.rows) {
    for (const key of Object.keys(row.incomeMonthly)) add(key);
  }
  return keys.filter((key) =>
    scenario.rows.some((r) => (r.incomeMonthly[key] ?? 0) !== 0)
  );
}

function expenseDetailKeys(
  scenario: ScenarioResult,
  household: Household
): string[] {
  const keys = household.expenses.map((e) => e.id);
  const seen = new Set(keys);
  for (const row of scenario.rows) {
    for (const key of Object.keys(row.expenseMonthly)) {
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  return keys.filter((key) =>
    scenario.rows.some((r) => (r.expenseMonthly[key] ?? 0) !== 0)
  );
}

function buildIncomeChildren(
  scenario: ScenarioResult,
  household: Household,
  unit: "mo" | "yr"
): LineDef[] {
  const scale = unit === "yr" ? 12 : 1;
  return incomeDetailKeys(scenario, household).map((key) => ({
    key: `income-${unit}-${key}`,
    label: incomeLabel(household, key),
    unit,
    value: (r) => (r.incomeMonthly[key] ?? 0) * scale,
  }));
}

function depositLabel(household: Household, key: string): string {
  for (const acc of household.accounts) {
    const deposit = (acc.deposits ?? []).find((d) => d.id === key);
    if (!deposit) continue;
    const name = deposit.label || "Deposit";
    return acc.label ? `${name} · ${acc.label}` : name;
  }
  return key;
}

/** Stable ordered keys for deposit detail rows across the projection. */
function depositDetailKeys(
  scenario: ScenarioResult,
  household: Household
): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const add = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    keys.push(key);
  };
  for (const acc of household.accounts) {
    for (const deposit of acc.deposits ?? []) add(deposit.id);
  }
  for (const row of scenario.rows) {
    for (const key of Object.keys(row.depositMonthly)) add(key);
  }
  return keys.filter((key) =>
    scenario.rows.some((r) => (r.depositMonthly[key] ?? 0) !== 0)
  );
}

function buildDepositChildren(
  scenario: ScenarioResult,
  household: Household,
  unit: "mo" | "yr"
): LineDef[] {
  const scale = unit === "yr" ? 12 : 1;
  return depositDetailKeys(scenario, household).map((key) => ({
    key: `deposit-${unit}-${key}`,
    label: depositLabel(household, key),
    unit,
    value: (r) => (r.depositMonthly[key] ?? 0) * scale,
  }));
}

function buildExpenseChildren(
  scenario: ScenarioResult,
  household: Household,
  unit: "mo" | "yr"
): LineDef[] {
  const scale = unit === "yr" ? 12 : 1;
  return expenseDetailKeys(scenario, household).map((key) => ({
    key: `expense-${unit}-${key}`,
    label: expenseLabel(household, key),
    unit,
    value: (r) => (r.expenseMonthly[key] ?? 0) * scale,
  }));
}

function buildAssetLines(
  scenario: ScenarioResult,
  household: Household
): LineDef[] {
  const hasReEquity = scenario.rows.some((r) => r.realEstateValue !== 0);
  const hasAfterTax = scenario.rows.some((r) => r.afterTaxTotal !== 0);

  const accounts = accountsInDisplayOrder(household.accounts);
  const retirementAccounts = accounts.filter(
    (a) => a.kind === "retirementTaxable"
  );
  const rothAccounts = accounts.filter((a) => a.kind === "rothTaxFree");
  const afterTaxAccounts = accounts.filter((a) =>
    AFTER_TAX_KINDS.has(a.kind)
  );

  const accountChildren = (
    accounts: typeof household.accounts
  ): LineDef[] | undefined => {
    if (accounts.length === 0) return undefined;
    return accounts.map((acc) => ({
      key: `acc-${acc.id}`,
      label: acc.label,
      unit: "sum" as const,
      value: (r: Row) => r.balances[acc.id] ?? 0,
    }));
  };

  const lines: LineDef[] = [
    {
      key: "ret",
      label: "Retirement",
      unit: "sum",
      value: (r) => r.retirementTotal,
      children: accountChildren(retirementAccounts),
    },
    {
      key: "roth",
      label: "Roth",
      unit: "sum",
      value: (r) => r.rothTotal,
      children: accountChildren(rothAccounts),
    },
  ];

  if (hasAfterTax) {
    lines.push({
      key: "after",
      label: "After-tax",
      unit: "sum",
      value: (r) => r.afterTaxTotal,
      children: accountChildren(afterTaxAccounts),
    });
  }

  if (hasReEquity) {
    const props = household.realEstate;
    lines.push({
      key: "equity",
      label: "Real-estate equity",
      unit: "sum",
      value: (r) => r.realEstateEquity,
      children:
        props.length > 0
          ? props.map((re) => ({
              key: `re-eq-${re.id}`,
              label: re.label,
              unit: "sum" as const,
              value: (r: Row) => r.realEstateEquityById[re.id] ?? 0,
            }))
          : undefined,
    });
  }

  const businesses = household.businesses ?? [];
  if (businesses.length > 0) {
    lines.push({
      key: "business-equity",
      label: "Business equity",
      unit: "sum",
      value: (r) => r.businessEquity,
      children: businesses.map((biz) => ({
        key: `biz-${biz.id}`,
        label: biz.label || "Business",
        unit: "sum" as const,
        value: (r: Row) => r.businessEquityById[biz.id] ?? 0,
      })),
    });
  }

  return lines;
}

function buildSections(
  scenario: ScenarioResult,
  household: Household,
  primaryId: string
): Section[] {
  const hasReDepreciation = scenario.rows.some(
    (r) => r.deductions.depreciation !== 0
  );
  const hasReCarryforward = scenario.rows.some(
    (r) => r.rentalLossCarryforward !== 0
  );
  const hasConversion = scenario.rows.some((r) => r.conversion !== 0);

  // Only show federal ordinary brackets that are actually reached in at least one year.
  const bracketCount = scenario.rows[0]?.federalTaxByBracket.length ?? 0;
  const usedBrackets: number[] = [];
  for (let i = 0; i < bracketCount; i++) {
    if (scenario.rows.some((r) => r.federalTaxByBracket[i]?.tax > 0)) {
      usedBrackets.push(i);
    }
  }

  const ltcgBracketCount =
    scenario.rows[0]?.federalCapitalGainsTaxByBracket.length ?? 0;
  const usedLtcgBrackets: number[] = [];
  for (let i = 0; i < ltcgBracketCount; i++) {
    if (
      scenario.rows.some(
        (r) => (r.federalCapitalGainsTaxByBracket[i]?.tax ?? 0) > 0
      )
    ) {
      usedLtcgBrackets.push(i);
    }
  }
  const ltcgRate = (i: number) =>
    scenario.rows[0]?.federalCapitalGainsTaxByBracket[i]?.rate ?? 0;

  const stateBracketCount = scenario.rows[0]?.stateTaxByBracket.length ?? 0;
  const usedStateBrackets: number[] = [];
  for (let i = 0; i < stateBracketCount; i++) {
    if (scenario.rows.some((r) => r.stateTaxByBracket[i]?.tax > 0)) {
      usedStateBrackets.push(i);
    }
  }
  const stateRate = (i: number) =>
    scenario.rows[0]?.stateTaxByBracket[i]?.rate ?? 0;
  const hasFederalTax = scenario.rows.some((r) => r.federalAnnualTax > 0);
  const hasStateTax = scenario.rows.some((r) => r.stateAnnualTax > 0);
  const hasAfterTaxWithdrawals = household.incomes.some(
    (income) => income.kind === "afterTaxWithdrawal"
  );
  const hasCapitalGains =
    hasAfterTaxWithdrawals ||
    scenario.rows.some((r) => r.capitalGainsIncome > 0);

  const assets = buildAssetLines(scenario, household);

  const peopleOrdered = [
    ...household.people.filter((p) => p.id === primaryId),
    ...household.people.filter((p) => p.id !== primaryId),
  ];
  const ageLines: LineDef[] = peopleOrdered.map((person) => ({
    key: `age-${person.id}`,
    label: peopleOrdered.length === 1 ? "Age" : `${person.name}`,
    unit: "none",
    value: (r) => r.ages[person.id],
  }));

  const incomeMonthlyChildren = buildIncomeChildren(scenario, household, "mo");
  const incomeYearlyChildren = buildIncomeChildren(scenario, household, "yr");
  const grossIncome: LineDef[] = [
    {
      key: "grossMonthly",
      label: "Gross monthly income",
      unit: "mo",
      value: (r) => r.totalMonthlyIncome,
      children:
        incomeMonthlyChildren.length > 0 ? incomeMonthlyChildren : undefined,
    },
    {
      key: "grossAnnual",
      label: "Gross yearly income",
      unit: "yr",
      value: (r) => r.totalMonthlyIncome * 12,
      children:
        incomeYearlyChildren.length > 0 ? incomeYearlyChildren : undefined,
    },
  ];

  const deductions: LineDef[] = [
    {
      key: "grossTaxable",
      label: "Ordinary taxable income",
      unit: "yr",
      value: (r) => r.grossTaxableIncome,
    },
    {
      key: "standard",
      label: "Standard deduction",
      unit: "yr",
      value: (r) => r.deductions.standard,
    },
    {
      key: "ssDeduction",
      label: "Senior deduction",
      unit: "yr",
      value: (r) => r.deductions.senior,
    },
  ];
  if (hasReDepreciation) {
    deductions.push({
      key: "depreciation",
      label: "Real-estate depreciation",
      unit: "yr",
      value: (r) => r.deductions.depreciation,
    });
  }
  if (hasReCarryforward) {
    const props = household.realEstate;
    deductions.push({
      key: "rentalLossCarryforward",
      label: "Real-estate loss carryforward",
      unit: "yr",
      value: (r) => r.rentalLossCarryforward,
      children:
        props.length > 1
          ? props.map((re) => ({
              key: `re-cf-${re.id}`,
              label: re.label,
              unit: "yr" as const,
              value: (r: Row) => r.rentalLossCarryforwardById[re.id] ?? 0,
            }))
          : undefined,
    });
  }
  if (hasCapitalGains) {
    deductions.push({
      key: "capitalGains",
      label: "Capital gains (after-tax withdrawals)",
      unit: "yr",
      value: (r) => r.capitalGainsIncome,
    });
  }
  deductions.push(
    {
      key: "taxableIncomeYearly",
      label: "Taxable income after deduction",
      unit: "yr",
      value: (r) => r.taxableIncome + r.capitalGainsIncome,
    },
    {
      key: "taxableIncomeMonthly",
      label: "Taxable income",
      unit: "mo",
      value: (r) => (r.taxableIncome + r.capitalGainsIncome) / 12,
    }
  );

  const bracketLines: LineDef[] = usedBrackets.map((i) => ({
    key: `bracket-${i}`,
    label: federalBracketLabel(scenario.rows, i),
    unit: "yr",
    value: (r) => r.federalTaxByBracket[i]?.tax ?? 0,
  }));

  const ltcgBracketLines: LineDef[] = usedLtcgBrackets.map((i) => ({
    key: `ltcg-bracket-${i}`,
    label: `Capital gains tax @ ${Math.round(ltcgRate(i) * 100)}%`,
    unit: "yr",
    value: (r) => r.federalCapitalGainsTaxByBracket[i]?.tax ?? 0,
  }));

  const stateBracketLines: LineDef[] = usedStateBrackets.map((i) => ({
    key: `state-bracket-${i}`,
    label: `Tax @ ${Math.round(stateRate(i) * 1000) / 10}%`,
    unit: "yr",
    value: (r) => r.stateTaxByBracket[i]?.tax ?? 0,
  }));

  const federalTaxes: LineDef[] = [
    {
      key: "federalOrdinary",
      label: "Ordinary tax",
      unit: "yr",
      value: (r) => r.federalOrdinaryTax,
    },
    ...(hasCapitalGains
      ? [
          {
            key: "federalLtcg",
            label: "Capital gains tax",
            unit: "yr" as const,
            value: (r: Row) => r.federalCapitalGainsTax,
          },
        ]
      : []),
    {
      key: "federalAnnual",
      label: "Annual tax",
      unit: "yr",
      value: (r) => r.federalAnnualTax,
    },
    {
      key: "federalMonthly",
      label: "Monthly tax",
      unit: "mo",
      value: (r) => r.federalMonthlyTax,
    },
  ];

  const stateDeductions: LineDef[] = [
    {
      key: "stateGrossTaxable",
      label: "Ordinary taxable income",
      unit: "yr",
      value: (r) => r.stateGrossTaxableIncome,
    },
    {
      key: "stateStandard",
      label: "Standard deduction",
      unit: "yr",
      value: (r) => r.stateDeductions.standard,
    },
    {
      key: "statePersonalExemption",
      label: "Personal exemption",
      unit: "yr",
      value: (r) => r.stateDeductions.personalExemption,
    },
    {
      key: "stateTaxableYearly",
      label: "Taxable income after deduction",
      unit: "yr",
      value: (r) => r.stateTaxableIncome,
    },
    {
      key: "stateTaxableMonthly",
      label: "Taxable income",
      unit: "mo",
      value: (r) => r.stateTaxableIncome / 12,
    },
  ];

  const stateTaxes: LineDef[] = [
    {
      key: "stateAnnual",
      label: "Annual tax",
      unit: "yr",
      value: (r) => r.stateAnnualTax,
    },
    {
      key: "stateMonthly",
      label: "Monthly tax",
      unit: "mo",
      value: (r) => r.stateMonthlyTax,
    },
  ];

  const taxes: LineDef[] = [
    {
      key: "annualTax",
      label: "Combined annual taxes",
      unit: "yr",
      value: (r) => r.annualTax,
    },
    {
      key: "monthlyTax",
      label: "Combined monthly taxes",
      unit: "mo",
      value: (r) => r.monthlyTax,
    },
  ];

  const netIncome: LineDef[] = [
    {
      key: "netMonthly",
      label: "Net monthly income",
      unit: "mo",
      value: (r) => r.netMonthlyIncome,
    },
    {
      key: "netAnnual",
      label: "Net yearly income",
      unit: "yr",
      value: (r) => r.netAnnualIncome,
    },
  ];

  const expenseMonthlyChildren = buildExpenseChildren(
    scenario,
    household,
    "mo"
  );
  const expenseYearlyChildren = buildExpenseChildren(scenario, household, "yr");
  const expenses: LineDef[] = [
    {
      key: "expensesMonthly",
      label: "Monthly expenses",
      unit: "mo",
      value: (r) => r.monthlyExpenses,
      children:
        expenseMonthlyChildren.length > 0 ? expenseMonthlyChildren : undefined,
    },
    {
      key: "expensesYearly",
      label: "Yearly expenses",
      unit: "yr",
      value: (r) => r.monthlyExpenses * 12,
      children:
        expenseYearlyChildren.length > 0 ? expenseYearlyChildren : undefined,
    },
  ];

  const depositMonthlyChildren = buildDepositChildren(
    scenario,
    household,
    "mo"
  );
  const depositYearlyChildren = buildDepositChildren(scenario, household, "yr");
  const hasDeposits = scenario.rows.some((r) => r.monthlyDeposits !== 0);
  const deposits: LineDef[] = [
    {
      key: "depositsMonthly",
      label: "Monthly deposits",
      unit: "mo",
      value: (r) => r.monthlyDeposits,
      children:
        depositMonthlyChildren.length > 0 ? depositMonthlyChildren : undefined,
    },
    {
      key: "depositsYearly",
      label: "Yearly deposits",
      unit: "yr",
      value: (r) => r.monthlyDeposits * 12,
      children:
        depositYearlyChildren.length > 0 ? depositYearlyChildren : undefined,
    },
  ];

  const sections: Section[] = [
    {
      key: "age",
      lines: ageLines,
    },
    { key: "assets", title: "Assets", lines: assets },
  ];
  if (hasConversion) {
    sections.push({
      key: "conversion",
      title: "Roth conversion",
      lines: [
        {
          key: "conversion",
          label: "Converted to Roth",
          unit: "yr",
          value: (r) => r.conversion,
        },
      ],
    });
  }
  sections.push({
    key: "grossIncome",
    title: "Gross income",
    lines: grossIncome,
  });
  sections.push({
    key: "deductions",
    title: "Federal deductions",
    lines: deductions,
  });
  if (bracketLines.length > 0) {
    sections.push({
      key: "brackets",
      title: federalBracketsTitle(scenario.rows),
      lines: bracketLines,
    });
  }
  if (hasCapitalGains && ltcgBracketLines.length > 0) {
    sections.push({
      key: "ltcgBrackets",
      title: "Federal capital gains tax brackets",
      lines: ltcgBracketLines,
    });
  }
  sections.push({
    key: "federalTaxes",
    title: "Federal taxes",
    lines: federalTaxes,
  });
  if (hasStateTax || stateBracketLines.length > 0) {
    sections.push({
      key: "stateDeductions",
      title: "State deductions",
      lines: stateDeductions,
    });
    if (stateBracketLines.length > 0) {
      sections.push({
        key: "stateBrackets",
        title: "State tax brackets",
        lines: stateBracketLines,
      });
    }
    sections.push({
      key: "stateTaxes",
      title: "State taxes",
      lines: stateTaxes,
    });
  }
  if (hasFederalTax && hasStateTax) {
    sections.push({ key: "taxes", title: "Combined taxes", lines: taxes });
  }
  sections.push(
    { key: "net", title: "Net income", lines: netIncome },
    { key: "expenses", title: "Expenses", lines: expenses }
  );
  if (hasDeposits) {
    sections.push({
      key: "deposits",
      title: "Deposits into accounts",
      lines: deposits,
    });
  }
  sections.push({
    key: "surplus",
    title: "Surplus",
    lines: [
      {
        key: "surplus",
        label: "Surplus",
        unit: "mo",
        value: (r) => r.surplus,
        signed: true,
      },
    ],
  });

  return sections;
}

function ExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <span
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted"
      aria-hidden
    >
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        {expanded ? (
          <path d="M3.5 8h9" />
        ) : (
          <>
            <path d="M3.5 8h9" />
            <path d="M8 3.5v9" />
          </>
        )}
      </svg>
    </span>
  );
}

/** Sticky name column: compact below lg so year columns stay visible. */
const STICKY_COL =
  "sticky left-0 w-36 min-w-36 max-w-36 px-2 py-1 text-left lg:w-auto lg:min-w-[15rem] lg:max-w-none lg:px-3 lg:py-1.5";
/** Data-row names wrap; section titles stay one line. */
const STICKY_LABEL = `${STICKY_COL} whitespace-normal break-words text-sm leading-snug lg:whitespace-nowrap`;
/** Covers the seam under the year header while a section title is stuck. */
const SECTION_STICK_COVER = 3;

function Label({
  label,
  unit,
  depth,
  expandable,
  expanded,
}: {
  label: string;
  unit: Unit;
  depth: number;
  expandable?: boolean;
  expanded?: boolean;
}) {
  return (
    <span
      className="flex flex-col items-start gap-0.5 lg:flex-row lg:items-baseline lg:justify-between lg:gap-2"
      style={{ paddingLeft: depth * 8 }}
    >
      <span className="flex min-w-0 items-start gap-1 lg:items-center lg:gap-1.5">
        {expandable ? <ExpandIcon expanded={!!expanded} /> : null}
        <span
          title={label}
          className={depth > 0 ? "font-normal text-muted-2" : undefined}
        >
          {label}
        </span>
      </span>
      {unit === "none" ? null : (
        <span className="text-[10px] font-normal uppercase tracking-wide text-muted-3">
          {UNIT_LABEL[unit]}
        </span>
      )}
    </span>
  );
}

function LineRows({
  line,
  sectionKey,
  scenario,
  primaryId,
  rmdYearIndexes,
  depth,
  expanded,
  toggle,
}: {
  line: LineDef;
  sectionKey: string;
  scenario: ScenarioResult;
  primaryId: string;
  rmdYearIndexes: Set<number>;
  depth: number;
  expanded: Set<string>;
  toggle: (key: string) => void;
}) {
  const rowKey = `${sectionKey}-${line.key}`;
  const hasChildren = (line.children?.length ?? 0) > 0;
  const isOpen = expanded.has(rowKey);

  const onToggle = () => toggle(rowKey);

  return (
    <>
      <tr
        className={`group border-t border-border-subtle odd:bg-surface even:bg-card ${
          hasChildren ? "cursor-pointer" : ""
        }`}
        onClick={hasChildren ? onToggle : undefined}
        onKeyDown={
          hasChildren
            ? (e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                onToggle();
              }
            : undefined
        }
        tabIndex={hasChildren ? 0 : undefined}
        aria-expanded={hasChildren ? isOpen : undefined}
        aria-label={
          hasChildren
            ? isOpen
              ? `Collapse ${line.label}`
              : `Expand ${line.label}`
            : undefined
        }
      >
        <th className={`${STICKY_LABEL} z-10 bg-inherit font-medium text-muted-2 group-hover:bg-segment`}>
          <Label
            label={line.label}
            unit={line.unit}
            depth={depth}
            expandable={hasChildren}
            expanded={isOpen}
          />
        </th>
        {scenario.rows.map((row) => {
          const value = line.value(row, primaryId);
          const isRmdCol = rmdYearIndexes.has(row.yearIndex);
          const signedClass =
            line.signed && value > 0
              ? "text-success"
              : line.signed && value < 0
              ? "text-danger"
              : null;
          const baseClass = isRmdCol
            ? "bg-warning-bg text-warning-rmd-text"
            : depth > 0
            ? "text-muted"
            : "text-muted-2";
          return (
            <td
              key={row.yearIndex}
              className={`whitespace-nowrap px-2 py-1 tabular-nums group-hover:bg-segment lg:px-3 lg:py-1.5 ${
                signedClass ?? baseClass
              }${isRmdCol && signedClass ? " bg-warning-bg" : ""}`}
            >
              {formatValue(line, row, primaryId)}
            </td>
          );
        })}
      </tr>
      {hasChildren && isOpen
        ? line.children!.map((child) => (
            <LineRows
              key={`${sectionKey}-${child.key}`}
              line={child}
              sectionKey={sectionKey}
              scenario={scenario}
              primaryId={primaryId}
              rmdYearIndexes={rmdYearIndexes}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
            />
          ))
        : null}
    </>
  );
}

export function ProjectionTable({
  scenario,
  household,
  primaryId,
}: {
  scenario: ScenarioResult;
  household: Household;
  primaryId: string;
}) {
  const sections = buildSections(scenario, household, primaryId);
  const { wrapperRef, pinned, height } = usePinToTop();
  const { barRef, scrollRef, contentWidth, overflowing } = useTopScrollbar();
  const headRowRef = useRef<HTMLTableRowElement>(null);
  const [headOffset, setHeadOffset] = useState(32);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const sectionTop = Math.max(0, headOffset - SECTION_STICK_COVER);

  useEffect(() => {
    const row = headRowRef.current;
    if (!row) return;
    const sync = () => setHeadOffset(row.getBoundingClientRect().height);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(row);
    return () => ro.disconnect();
  }, []);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Year columns where any person first reaches their birth-year RMD age - yellow.
  const rmdYearIndexes = new Set<number>();
  for (const person of household.people) {
    const age = personRmdAge(person);
    if (age == null) continue;
    const row = scenario.rows.find((r) => r.ages[person.id] >= age);
    if (row) rmdYearIndexes.add(row.yearIndex);
  }

  return (
    <div
      ref={wrapperRef}
      style={pinned ? { height } : undefined}
      className={`flex flex-col overflow-hidden rounded-2xl border border-border bg-white ${
        pinned ? "sticky top-0 z-10" : ""
      }`}
    >
      <div
        ref={barRef}
        data-top-scrollbar
        aria-hidden
        className={`scrollbar-visible shrink-0 overflow-x-scroll overflow-y-hidden border-b border-border ${
          overflowing ? "" : "hidden"
        }`}
      >
        <div style={{ width: contentWidth, height: 1 }} />
      </div>
      <div
        ref={scrollRef}
        className={`scrollbar-visible overflow-x-scroll ${
          pinned ? "min-h-0 flex-1 overflow-y-auto" : ""
        }`}
      >
        <table className="border-collapse text-right text-sm">
          <thead>
            <tr ref={headRowRef} className="text-xs font-semibold text-muted">
              <th className="sticky left-0 top-0 z-30 w-36 min-w-36 max-w-36 bg-card px-2 py-1.5 shadow-[0_3px_0_#fff] lg:w-auto lg:min-w-[15rem] lg:max-w-none lg:px-3 lg:py-2" />
              {scenario.rows.map((row) => (
                <th
                  key={row.yearIndex}
                  className={`sticky top-0 z-20 whitespace-nowrap px-2 py-1.5 text-right font-semibold tabular-nums shadow-[0_3px_0_#fff] lg:px-3 lg:py-2 ${
                    rmdYearIndexes.has(row.yearIndex)
                      ? "bg-warning-rmd text-warning-rmd-text"
                      : "bg-card text-muted-2"
                  }`}
                >
                  {row.calendarYear}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => (
              <Fragment key={section.key}>
                {section.title ? (
                  <tr>
                    <th
                      colSpan={scenario.rows.length + 1}
                      style={{ top: sectionTop }}
                      className="sticky z-10 bg-accent-soft px-2 pb-2 pt-3 text-left text-xs font-bold uppercase tracking-wider text-accent shadow-[0_-3px_0_#fff] lg:px-3"
                    >
                      <span className="sticky left-2 whitespace-nowrap lg:left-3">
                        {section.title}
                      </span>
                    </th>
                  </tr>
                ) : null}
                {section.lines.map((line) => (
                  <LineRows
                    key={`${section.key}-${line.key}`}
                    line={line}
                    sectionKey={section.key}
                    scenario={scenario}
                    primaryId={primaryId}
                    rmdYearIndexes={rmdYearIndexes}
                    depth={0}
                    expanded={expanded}
                    toggle={toggle}
                  />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
