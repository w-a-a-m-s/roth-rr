import { eventTopUpKey } from "@/lib/domain/household";
import type { ResolvedCare } from "@/lib/domain/longTermCare";
import type { ProjectionRow } from "@/lib/engine/types";

const TOP_UP_PREFIX = eventTopUpKey("");

/** Every asset on a row: tax-deferred, Roth, after-tax, real-estate and business equity. */
export function rowTotalAssets(row: ProjectionRow): number {
  return (
    row.retirementTotal +
    row.rothTotal +
    row.afterTaxTotal +
    row.realEstateEquity +
    row.businessEquity
  );
}

/** What the care years did to total assets, for the Long-term care summary. */
export interface LongTermCareAssetImpact {
  /** First and last calendar year anyone is in care. */
  firstYear: number;
  lastYear: number;
  /** Total assets going into care: the year-end before the first care year. */
  before: number;
  /** Total assets at the end of the last care year. */
  after: number;
  /** `before - after`: how much the assets went down over the care years (negative if they grew). */
  drop: number;
  /** The same plan without care, at the end of the last care year. */
  withoutCare: number;
  /** `withoutCare - after`: how much less there is because of the care. */
  shortfall: number;
  /** Whether the year's income covers the spending through the care years. */
  cashFlow: LongTermCareCashFlow;
}

/** Cash flow over the care years. */
export interface LongTermCareCashFlow {
  /** Care years in the projection. */
  years: number;
  /**
   * Care years where income after tax didn't cover spending and deposits, so
   * the plan drew extra from the accounts (or couldn't cover it at all).
   */
  shortYears: number[];
  /** Extra drawn from the accounts over those years, tax on the draws included. */
  fromAccounts: number;
  /**
   * Care years the accounts couldn't cover either: they ran dry and spending
   * was left unpaid. The cash flow is sufficient while this is empty.
   */
  unpaidYears: number[];
  /** Spending left unpaid once the accounts ran dry. */
  uncovered: number;
  /**
   * First year from the start of care, through the end of the plan, that the
   * accounts can't cover: savings ran out. Null when they last.
   */
  savingsRunOutYear: number | null;
  /** Last projection year, for "savings last through". */
  planEndYear: number;
}

/**
 * Total assets over the care window (first stay's start to last stay's end):
 * how far they fell, and how far they end below the same plan without care.
 * "Before" is the year-end before care starts. When care starts in the first
 * projection year there's no such row, so it's that year's end instead.
 * Null when there's no care or the window ends outside the projection.
 */
export function longTermCareAssetImpact(
  careRows: ProjectionRow[],
  noCareRows: ProjectionRow[],
  care: ResolvedCare | null,
): LongTermCareAssetImpact | null {
  if (!care || care.stays.length === 0 || careRows.length === 0) return null;
  const firstYear = Math.min(...care.stays.map((s) => s.firstYear));
  const lastYear = Math.max(...care.stays.map((s) => s.lastYear));
  const projectionStart = careRows[0].calendarYear;
  const projectionEnd = careRows[careRows.length - 1].calendarYear;
  if (firstYear > projectionEnd || lastYear < projectionStart) return null;
  const endYear = Math.min(lastYear, projectionEnd);
  const startRow =
    careRows.find((r) => r.calendarYear === firstYear - 1) ?? careRows[0];
  const endRow = careRows.find((r) => r.calendarYear === endYear);
  const noCareEndRow = noCareRows.find((r) => r.calendarYear === endYear);
  if (!endRow || !noCareEndRow) return null;
  const before = rowTotalAssets(startRow);
  const after = rowTotalAssets(endRow);
  const withoutCare = rowTotalAssets(noCareEndRow);
  const careYears = careRows.filter(
    (r) => r.calendarYear >= firstYear && r.calendarYear <= endYear,
  );
  return {
    firstYear,
    lastYear: endYear,
    before,
    after,
    drop: before - after,
    withoutCare,
    shortfall: withoutCare - after,
    cashFlow: {
      ...careCashFlow(careYears),
      savingsRunOutYear:
        careRows.find((r) => r.calendarYear >= firstYear && isUnpaid(r))?.calendarYear ?? null,
      planEndYear: projectionEnd,
    },
  };
}

/**
 * Spending left unpaid: the year ends below zero even after the top-ups. The
 * tax gross-up can leave a few cents either way.
 */
function isUnpaid(row: ProjectionRow): boolean {
  return -row.surplus * 12 >= 0.5;
}

/**
 * A care year is short when the plan had to top it up from the accounts
 * (`topup:<accountId>` income) or still ended below zero once they were empty.
 */
function careCashFlow(
  rows: ProjectionRow[],
): Omit<LongTermCareCashFlow, "savingsRunOutYear" | "planEndYear"> {
  const shortYears: number[] = [];
  const unpaidYears: number[] = [];
  let fromAccounts = 0;
  let uncovered = 0;
  for (const row of rows) {
    let topUp = 0;
    for (const [key, monthly] of Object.entries(row.incomeMonthly)) {
      if (!key.startsWith(TOP_UP_PREFIX)) continue;
      topUp += monthly * 12;
    }
    const unpaid = isUnpaid(row) ? -row.surplus * 12 : 0;
    if (topUp < 0.5 && unpaid === 0) continue;
    shortYears.push(row.calendarYear);
    fromAccounts += topUp;
    if (unpaid === 0) continue;
    unpaidYears.push(row.calendarYear);
    uncovered += unpaid;
  }
  return { years: rows.length, shortYears, fromAccounts, unpaidYears, uncovered };
}
