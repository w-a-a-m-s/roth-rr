"use client";

import type { Household } from "@/lib/domain/types";
import { primaryRmdAge } from "@/lib/domain/rmd";
import {
  formatAxisCurrency,
  formatSignedAxisCurrency,
} from "@/components/results/chartUtils";
import { afterTaxAssets, preTaxAssets } from "@/lib/engine/runScenario";
import type { ProjectionRow } from "@/lib/engine/types";
import type { ReferenceData } from "@/lib/externalData/types";
import { formatCurrency, formatSignedCurrency } from "@/lib/format";
import { DualScroll } from "@/components/results/DualScroll";

const STICKY_LABEL =
  "sticky left-0 z-10 min-w-[7.75rem] whitespace-nowrap bg-white px-2 py-1 text-left text-[11px] font-bold text-muted-3";

export type AfterTaxAssetsTimelinePoint = {
  year: number;
  age: number;
  withConversion: number;
  noConversion: number;
  delta: number;
  preTaxWithConversion: number;
  preTaxNoConversion: number;
  preTaxDelta: number;
  isRmd: boolean;
};

export function buildAfterTaxAssetsTimelinePoints(
  household: Household,
  rothRows: ProjectionRow[],
  baselineRows: ProjectionRow[],
  refs: ReferenceData,
  primaryId: string,
): AfterTaxAssetsTimelinePoint[] {
  const rmdAge = primaryRmdAge(household);
  const baselineByYear = new Map(
    baselineRows.map((row) => [row.calendarYear, row]),
  );
  return rothRows.flatMap((row) => {
    const baseline = baselineByYear.get(row.calendarYear);
    if (!baseline) return [];
    const withConversion = afterTaxAssets(household, row, refs);
    const noConversion = afterTaxAssets(household, baseline, refs);
    const preTaxWithConversion = preTaxAssets(row);
    const preTaxNoConversion = preTaxAssets(baseline);
    return [
      {
        year: row.calendarYear,
        age: row.ages[primaryId],
        withConversion,
        noConversion,
        delta: withConversion - noConversion,
        preTaxWithConversion,
        preTaxNoConversion,
        preTaxDelta: preTaxWithConversion - preTaxNoConversion,
        isRmd: rmdAge != null && row.ages[primaryId] === rmdAge,
      },
    ];
  });
}

export function AfterTaxAssetsTimeline({
  rothRows,
  baselineRows,
  household,
  refs,
  primaryId,
  single = false,
}: {
  rothRows: ProjectionRow[];
  baselineRows: ProjectionRow[];
  household: Household;
  refs: ReferenceData;
  primaryId: string;
  /** Only the no-conversion row (no With conversion or Impact rows). */
  single?: boolean;
}) {
  const primaryName =
    household.people.find((p) => p.id === primaryId)?.name?.trim() || "Age";
  const points = buildAfterTaxAssetsTimelinePoints(
    household,
    rothRows,
    baselineRows,
    refs,
    primaryId,
  );

  if (points.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-white px-5 py-[18px]">
      <h3 className="mb-3 text-[14.5px] font-bold text-foreground">
        Assets after and before tax
      </h3>
      <DualScroll className="pb-1">
        <table className="border-collapse text-center text-sm">
          <tbody>
            <tr>
              <th className={STICKY_LABEL} title={primaryName}>
                {primaryName}
              </th>
              {points.map((point) => (
                <td
                  key={`age-${point.year}`}
                  className={`min-w-[76px] px-1 py-1 text-[10.5px] font-semibold tabular-nums ${
                    point.isRmd
                      ? "bg-warning-bg text-warning-rmd-text"
                      : "text-muted-2"
                  }`}
                >
                  {point.age}
                </td>
              ))}
            </tr>
            <tr>
              <th className={STICKY_LABEL}>Year</th>
              {points.map((point) => (
                <td
                  key={`year-${point.year}`}
                  className={`min-w-[76px] px-1 py-1 text-[11px] font-bold tabular-nums ${
                    point.isRmd
                      ? "bg-warning-bg text-warning-rmd-text"
                      : "text-muted-3"
                  }`}
                  title={`${point.year} (${primaryName} age ${point.age})`}
                >
                  {point.year}
                </td>
              ))}
            </tr>
            <AssetRows
              heading="After tax"
              points={points}
              primaryName={primaryName}
              single={single}
              withConversion={(point) => point.withConversion}
              noConversion={(point) => point.noConversion}
              delta={(point) => point.delta}
            />
            <AssetRows
              heading="Before tax"
              points={points}
              primaryName={primaryName}
              single={single}
              withConversion={(point) => point.preTaxWithConversion}
              noConversion={(point) => point.preTaxNoConversion}
              delta={(point) => point.preTaxDelta}
            />
          </tbody>
        </table>
      </DualScroll>
    </div>
  );
}

type PointValue = (point: AfterTaxAssetsTimelinePoint) => number;

/** One block of rows (after or before tax) under its own heading. */
function AssetRows({
  heading,
  points,
  primaryName,
  single,
  withConversion,
  noConversion,
  delta,
}: {
  heading: string;
  points: AfterTaxAssetsTimelinePoint[];
  primaryName: string;
  single: boolean;
  withConversion: PointValue;
  noConversion: PointValue;
  delta: PointValue;
}) {
  const lower = heading.toLowerCase();
  return (
    <>
      <tr>
        <th
          className="sticky left-0 z-10 whitespace-nowrap bg-white px-2 pt-3 pb-1 text-left text-[11px] font-extrabold uppercase tracking-[0.04em] text-foreground"
        >
          {heading}
        </th>
        <td colSpan={points.length} className="border-b border-border-subtle" />
      </tr>
      {single ? null : (
        <AmountRow
          label="With conversion"
          points={points}
          value={withConversion}
          format={formatAxisCurrency}
          title={(point) =>
            cellTitle(primaryName, point, `With conversion, ${lower}`, withConversion(point))
          }
        />
      )}
      <AmountRow
        label="No conversion"
        points={points}
        value={noConversion}
        format={formatAxisCurrency}
        title={(point) =>
          cellTitle(primaryName, point, `No conversion, ${lower}`, noConversion(point))
        }
      />
      {single ? null : (
        <AmountRow
          label="Impact"
          points={points}
          value={delta}
          format={formatSignedAxisCurrency}
          title={(point) =>
            cellTitle(primaryName, point, `Impact, ${lower}`, delta(point), formatSignedCurrency)
          }
          colorClass={(point) => deltaColor(delta(point))}
        />
      )}
    </>
  );
}

function AmountRow({
  label,
  points,
  value,
  format,
  title,
  colorClass,
}: {
  label: string;
  points: AfterTaxAssetsTimelinePoint[];
  value: (point: AfterTaxAssetsTimelinePoint) => number;
  format: (amount: number) => string;
  title: (point: AfterTaxAssetsTimelinePoint) => string;
  colorClass?: (point: AfterTaxAssetsTimelinePoint) => string;
}) {
  return (
    <tr>
      <th className={STICKY_LABEL}>{label}</th>
      {points.map((point) => {
        const amount = value(point);
        const tone = colorClass?.(point);
        return (
          <td
            key={`${label}-${point.year}`}
            className={`min-w-[76px] px-1 py-1 text-[12px] font-semibold tabular-nums ${
              point.isRmd ? "bg-warning-bg" : ""
            } ${tone ?? (point.isRmd ? "text-warning-rmd-text" : "text-foreground")}`}
            title={title(point)}
          >
            {format(amount)}
          </td>
        );
      })}
    </tr>
  );
}

function cellTitle(
  primaryName: string,
  point: AfterTaxAssetsTimelinePoint,
  label: string,
  amount: number,
  format: (value: number) => string = formatCurrency,
): string {
  return `${point.year} (${primaryName} age ${point.age}): ${label} ${format(amount)}`;
}

function deltaColor(delta: number): string {
  if (Math.abs(delta) < 1) return "text-muted-3";
  return delta > 0 ? "text-success" : "text-danger";
}
