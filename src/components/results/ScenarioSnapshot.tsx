"use client";

import { useState } from "react";
import type { Household } from "@/lib/domain/types";
import type { Comparison, ScenarioResult } from "@/lib/engine/types";
import { Select } from "@/components/ui/inputs";
import { formatCurrency } from "@/lib/format";
import { DualScroll } from "@/components/results/DualScroll";
import { DisplayFromToggle } from "@/components/results/DisplayFromToggle";
import {
  buildSnapshotTable,
  type SnapshotFrom,
  type SnapshotAssetGroup,
  type SnapshotLine,
  type SnapshotSection,
  type SnapshotTint,
  type SnapshotTone,
} from "@/components/results/snapshotTable";

/** Section colors from the planning deck: navy assets, green income, rust cash flow. */
const SECTION_STYLE: Record<
  SnapshotSection["key"],
  { head: string; row: string; rule: string }
> = {
  assets: { head: "bg-[#1B365D]", row: "bg-[#E8EEF6]", rule: "border-t-[3px] border-t-[#14243D]" },
  income: { head: "bg-[#20784F]", row: "bg-[#E7F2EC]", rule: "border-t-[3px] border-t-[#14243D]" },
  cashflow: { head: "bg-[#B85C38]", row: "bg-[#F7EAE3]", rule: "border-t-[3px] border-t-[#7A3B22]" },
  conversionTax: { head: "bg-[#5B4B8A]", row: "bg-[#EFEBF7]", rule: "border-t-[3px] border-t-[#3B2F5E]" },
  depreciation: { head: "bg-[#5E6B2E]", row: "bg-[#F1F3E6]", rule: "border-t-[3px] border-t-[#3E471E]" },
};

/**
 * Asset groups get their own tint so retirement money, regular investments,
 * and Roth read apart at a glance; each group's total row is a shade darker.
 */
const ASSET_GROUP_ROW: Record<
  SnapshotAssetGroup,
  { row: string; total: string }
> = {
  retirement: { row: "bg-[#E8EEF6]", total: "bg-[#D3DEEC]" },
  regular: { row: "bg-[#F5F0E3]", total: "bg-[#EAE0C8]" },
  roth: { row: "bg-[#E7F2EC]", total: "bg-[#D2E8DB]" },
};

/** The grand total under all three groups: the darkest shade, ruled above. */
const ALL_ASSETS_ROW = "bg-[#C3D1E4] border-t-[3px] border-t-[#1B365D]";

/**
 * Lines that read apart from their neighbors: real estate and business
 * equity in their own shades, and each kind of insurance in its own color
 * (life a soft teal, disability a peach, long-term care a mauve).
 */
const TINT_ROW: Record<SnapshotTint, string> = {
  realEstate: "bg-[#EFE3CC]",
  business: "bg-[#E6E1F2]",
  life: "bg-[#DCEFF2]",
  disability: "bg-[#FBE6D4]",
  longTermCare: "bg-[#F0DDEA]",
};

function lineRowClass(line: SnapshotLine, sectionRow: string): string {
  if (line.tint && !line.subtotal) return TINT_ROW[line.tint];
  if (!line.group) return line.subtotal ? ALL_ASSETS_ROW : sectionRow;
  const tint = ASSET_GROUP_ROW[line.group];
  return line.subtotal ? `${tint.total} border-b-2 border-b-[#B8C4D4]` : tint.row;
}

const TONE_CLASS: Record<SnapshotTone, string> = {
  plain: "font-normal text-[#1B365D]",
  roth: "font-bold text-[#20784F]",
  tax: "font-bold text-[#B85C38]",
  strong: "font-bold text-[#14243D]",
  surplus: "font-bold text-[#20784F]",
};

const CELL = "border border-[#D5DCE5] px-2 py-1.5";
/** Row labels stay put while the years scroll; the row's color shows through. */
const STICKY = "sticky left-0 z-10 bg-inherit";
const LABEL_COL = 230;
const YEAR_COL = 118;

/**
 * Slide-ready "Assets, Income & Taxes" tables for both scenarios, every year
 * of the plan with about six in view, styled like the planning deck so they can be dropped
 * straight into a presentation.
 */
export function ScenarioSnapshot({
  comparison,
  household,
  primaryId,
  single = false,
  initialYear,
  from,
  fromYear,
  onFromChange,
  milestoneLabel,
}: {
  comparison: Comparison;
  household: Household;
  primaryId: string;
  /** Show only the no-conversion scenario. */
  single?: boolean;
  /** Year the table opens on (the plan start); earlier years are a Jump away. */
  initialYear?: number;
  /** From today / From retirement year, shared with the other results tabs. */
  from: SnapshotFrom;
  /** First year shown for `from`; earlier years are hidden. */
  fromYear: number;
  onFromChange: (from: SnapshotFrom) => void;
  milestoneLabel: string;
}) {
  const allYears = comparison.baseline.rows.map((r) => r.calendarYear);
  const [jumpYear, setJumpYear] = useState<number>(
    initialYear != null && allYears.includes(initialYear) ? initialYear : allYears[0] ?? 0,
  );
  const startYear = Math.max(jumpYear, fromYear);

  if (allYears.length === 0) return null;
  // Each year also shows the main client's age, so you can jump by either.
  const startOptions = comparison.baseline.rows.filter((r) => r.calendarYear >= fromYear).map((r) => {
    const age = r.ages[primaryId];
    return {
      value: String(r.calendarYear),
      label: Number.isFinite(age) ? `${r.calendarYear} · age ${age}` : String(r.calendarYear),
    };
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-[14.5px] font-bold text-foreground">
          Assets, income &amp; taxes
        </h3>
        <div className="flex flex-col items-end gap-2 text-[12.5px] font-semibold text-muted-2">
          <div className="flex items-center gap-2">
            <label htmlFor="snapshot-start">Jump to</label>
            <span className="w-[140px]">
              <Select
                id="snapshot-start"
                value={String(startYear)}
                onChange={(v) => setJumpYear(Number(v))}
                options={startOptions}
              />
            </span>
          </div>
          <DisplayFromToggle
            milestoneLabel={milestoneLabel}
            value={from}
            onChange={(option) => {
              onFromChange(option);
              setJumpYear(allYears[0] ?? 0);
            }}
          />
        </div>
      </div>
      <SnapshotCard
        label="No conversion"
        scenario={comparison.baseline}
        household={household}
        primaryId={primaryId}
        startYear={startYear}
        fromYear={fromYear}
      />
      {single ? null : <SnapshotCard
        label="With conversion"
        scenario={comparison.roth}
        household={household}
        primaryId={primaryId}
        startYear={startYear}
        fromYear={fromYear}
      />}
    </div>
  );
}

function SnapshotCard({
  label,
  scenario,
  household,
  primaryId,
  startYear,
  fromYear,
}: {
  label: string;
  scenario: ScenarioResult;
  household: Household;
  primaryId: string;
  startYear: number;
  /** First year shown (today or the retirement year); earlier years are hidden. */
  fromYear: number;
}) {
  // Every year from `fromYear`, about six in view; scroll (or "Jump to") for more.
  const shownRows = scenario.rows.filter((r) => r.calendarYear >= fromYear);
  const table = buildSnapshotTable(
    scenario,
    household,
    primaryId,
    shownRows[0]?.calendarYear ?? fromYear,
    shownRows.length,
  );
  if (table.years.length === 0) return null;

  const primaryAges = shownRows
    .map((r) => r.ages[primaryId])
    .filter((a) => a != null);
  const startIndex = Math.max(0, table.years.indexOf(startYear));
  const firstYear = table.years[0];
  const lastYear = table.years[table.years.length - 1];
  const ageText =
    primaryAges.length > 0
      ? ` · ages ${primaryAges[0]}–${primaryAges[primaryAges.length - 1]}`
      : "";

  return (
    <div className="rounded-2xl border border-border bg-white px-4 py-5 sm:px-6">
      <p className="m-0 text-center font-serif text-[20px] font-bold text-[#1B365D]">
        Assets, Income &amp; Taxes
      </p>
      <div className="mx-auto mt-2 mb-4 w-fit max-w-full rounded-lg border border-[#C9D3E0] bg-[#EEF2F7] px-5 py-1 text-center text-[13px] font-bold text-[#1B365D] shadow-[0_2px_4px_rgba(20,36,61,0.18)]">
        {label} · {firstYear}–{lastYear}
        {ageText}
      </div>
      <DualScroll className="pb-1" scrollLeft={startIndex * YEAR_COL}>
        <table
          className="table-fixed border-collapse text-[12.5px] tabular-nums"
          style={{ width: LABEL_COL + table.years.length * YEAR_COL }}
        >
          <colgroup>
            <col style={{ width: LABEL_COL }} />
            {table.years.map((y) => (
              <col key={y} style={{ width: YEAR_COL }} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-[#1B365D] text-white">
              <th className={`${CELL} ${STICKY} text-left text-[13.5px] font-bold`}>Year</th>
              {table.years.map((y) => (
                <th key={y} className={`${CELL} text-center text-[13.5px] font-bold`}>
                  {y}
                </th>
              ))}
            </tr>
            {table.ages.map((age) => (
              <tr key={age.label} className="bg-[#2D4A73] text-white">
                <th className={`${CELL} ${STICKY} text-left font-bold`}>{age.label}</th>
                {age.values.map((v, i) => (
                  <td key={table.years[i]} className={`${CELL} text-center font-bold`}>
                    {v ?? "–"}
                  </td>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.sections.map((section) => {
              const style = SECTION_STYLE[section.key];
              return [
                <tr key={`${section.key}-head`} className={`${style.head} ${style.rule} text-white`}>
                  <th className={`${CELL} ${STICKY} text-left font-bold uppercase`}>{section.title}</th>
                  {table.years.map((y) => (
                    <td key={y} className={CELL} />
                  ))}
                </tr>,
                ...section.lines.map((line) => (
                  <tr key={line.key} className={lineRowClass(line, style.row)}>
                    <th className={`${CELL} ${STICKY} text-left ${TONE_CLASS[line.tone]}`}>{line.label}</th>
                    {line.values.map((v, i) => (
                      <td
                        key={table.years[i]}
                        className={`${CELL} text-right ${
                          line.tone === "surplus" && v < 0
                            ? "font-bold text-[#B42318]"
                            : TONE_CLASS[line.tone]
                        }`}
                      >
                        {formatCurrency(v)}
                      </td>
                    ))}
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
      </DualScroll>
    </div>
  );
}
