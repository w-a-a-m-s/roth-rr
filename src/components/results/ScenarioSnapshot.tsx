"use client";

import { useState } from "react";
import type { Household } from "@/lib/domain/types";
import type { Comparison, ScenarioResult } from "@/lib/engine/types";
import { Select } from "@/components/ui/inputs";
import { formatCurrency } from "@/lib/format";
import {
  SNAPSHOT_YEARS,
  buildSnapshotTable,
  snapshotRows,
  type SnapshotSection,
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
};

const TONE_CLASS: Record<SnapshotTone, string> = {
  plain: "font-normal text-[#1B365D]",
  roth: "font-bold text-[#20784F]",
  tax: "font-bold text-[#B85C38]",
  strong: "font-bold text-[#14243D]",
  surplus: "font-bold text-[#20784F]",
};

const CELL = "border border-[#D5DCE5] px-2 py-1.5";

/**
 * Slide-ready "Assets, Income & Taxes" tables for both scenarios over a
 * six-year window, styled like the planning deck so they can be dropped
 * straight into a presentation.
 */
export function ScenarioSnapshot({
  comparison,
  household,
  primaryId,
}: {
  comparison: Comparison;
  household: Household;
  primaryId: string;
}) {
  const allYears = comparison.baseline.rows.map((r) => r.calendarYear);
  const [startYear, setStartYear] = useState<number>(allYears[0] ?? 0);

  if (allYears.length === 0) return null;
  const startOptions = allYears
    .slice(0, Math.max(1, allYears.length - SNAPSHOT_YEARS + 1))
    .map((y) => ({ value: String(y), label: String(y) }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-[14.5px] font-bold text-foreground">
          Assets, income &amp; taxes
        </h3>
        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-muted-2">
          <label htmlFor="snapshot-start">Starting in</label>
          <span className="w-[104px]">
            <Select
              id="snapshot-start"
              value={String(startYear)}
              onChange={(v) => setStartYear(Number(v))}
              options={startOptions}
            />
          </span>
        </div>
      </div>
      <SnapshotCard
        label="No conversion"
        scenario={comparison.baseline}
        household={household}
        primaryId={primaryId}
        startYear={startYear}
      />
      <SnapshotCard
        label="With conversion"
        scenario={comparison.roth}
        household={household}
        primaryId={primaryId}
        startYear={startYear}
      />
    </div>
  );
}

function SnapshotCard({
  label,
  scenario,
  household,
  primaryId,
  startYear,
}: {
  label: string;
  scenario: ScenarioResult;
  household: Household;
  primaryId: string;
  startYear: number;
}) {
  const table = buildSnapshotTable(scenario, household, primaryId, startYear);
  if (table.years.length === 0) return null;

  const window = snapshotRows(scenario.rows, startYear);
  const primaryAges = window.map((r) => r.ages[primaryId]).filter((a) => a != null);
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
      <div className="scrollbar-visible overflow-x-auto pb-1">
        <table className="mx-auto w-full min-w-[640px] table-fixed border-collapse text-[12.5px] tabular-nums">
          <colgroup>
            <col className="w-[26%]" />
            {table.years.map((y) => (
              <col key={y} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-[#1B365D] text-white">
              <th className={`${CELL} text-left text-[13.5px] font-bold`}>Year</th>
              {table.years.map((y) => (
                <th key={y} className={`${CELL} text-center text-[13.5px] font-bold`}>
                  {y}
                </th>
              ))}
            </tr>
            {table.ages.map((age) => (
              <tr key={age.label} className="bg-[#2D4A73] text-white">
                <th className={`${CELL} text-left font-bold`}>{age.label}</th>
                {age.values.map((v, i) => (
                  <td key={table.years[i]} className={`${CELL} text-center font-bold`}>
                    {v}
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
                  <th className={`${CELL} text-left font-bold uppercase`}>{section.title}</th>
                  {table.years.map((y) => (
                    <td key={y} className={CELL} />
                  ))}
                </tr>,
                ...section.lines.map((line) => (
                  <tr key={line.key} className={style.row}>
                    <th className={`${CELL} text-left ${TONE_CLASS[line.tone]}`}>{line.label}</th>
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
      </div>
    </div>
  );
}
