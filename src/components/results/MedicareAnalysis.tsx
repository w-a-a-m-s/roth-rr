"use client";

import { useMemo, useState } from "react";
import type { Household } from "@/lib/domain/types";
import type { Comparison } from "@/lib/engine/types";
import type { MedicarePartBTier, MedicarePartBYear } from "@/lib/config/medicare";
import { forFiling } from "@/lib/config/filingStatus";
import { MEDICARE_PREMIUM_START_AGE } from "@/lib/config/medicare";
import { medicareYears, type MedicareSummary } from "@/lib/engine/medicare";
import { Select } from "@/components/ui/inputs";
import { DualScroll } from "@/components/results/DualScroll";
import { formatCurrency } from "@/lib/format";

const CELL = "border-b border-border-subtle px-3 py-1.5 text-right tabular-nums";
const HEAD = "bg-[#1B365D] px-3 py-2 text-right text-[12px] font-bold text-white";
/** The monthly premium column stands out, so the year's premium is easy to find. */
const PREMIUM_HEAD = HEAD.replace("bg-[#1B365D]", "bg-[#2563EB]");
const PREMIUM_CELL = "bg-[#E8F0FE] font-bold text-[#1B365D]";
/** Room under this much MAGI before the next tier is flagged as close. */
const CLOSE_TO_NEXT_TIER = 10_000;

type ScenarioKey = "baseline" | "roth";
const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  baseline: "No conversion",
  roth: "With conversion",
};

const tierLabel = (tier: number) => (tier === 0 ? "Standard" : `IRMAA ${tier}`);

/**
 * Medicare analysis: Part B premiums and IRMAA year by year for the plan, with
 * and without conversions, and how much room each year's income leaves before
 * the next IRMAA tier. It reads the Retirement projection and doesn't change it.
 */
export function MedicareAnalysis({
  household,
  comparison,
  medicare,
}: {
  household: Household;
  comparison: Comparison;
  medicare: MedicarePartBYear;
}) {
  const summaries = useMemo(
    () => ({
      baseline: medicareYears(household, comparison.baseline.rows, medicare),
      roth: medicareYears(household, comparison.roth.rows, medicare),
    }),
    [household, comparison, medicare],
  );
  const [scenario, setScenario] = useState<ScenarioKey>("roth");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-white px-5 py-4">
        <p className="m-0 max-w-[720px] text-[13px] leading-relaxed text-muted">
          Medicare Part B starts at {MEDICARE_PREMIUM_START_AGE} or retirement, whichever is later.
          Each year&apos;s premium is set by your income (MAGI) from two years before, so a big
          conversion year shows up in premiums two years later. Above a set income, you pay an
          extra charge on top of the standard premium (IRMAA). The tiers are {medicare.year}&apos;s,
          per person. This uses the Retirement projection and doesn&apos;t change it.
        </p>
        <IrmaaTiers medicare={medicare} />
      </div>
      <SummaryTable summaries={summaries} />
      <YearTable
        household={household}
        summary={summaries[scenario]}
        scenario={scenario}
        onScenario={setScenario}
      />
    </div>
  );
}

/** MAGI range of one tier, from its floor to the next tier's. */
function tierRange(tiers: MedicarePartBTier[], i: number): string {
  const next = tiers[i + 1];
  if (i === 0) return next ? `Under ${formatCurrency(next.magiFloor)}` : "Any income";
  if (!next) return `${formatCurrency(tiers[i].magiFloor)} and up`;
  return `${formatCurrency(tiers[i].magiFloor)} to ${formatCurrency(next.magiFloor)}`;
}

/** A link that opens the full IRMAA tier table for the year the plan uses. */
function IrmaaTiers({ medicare }: { medicare: MedicarePartBYear }) {
  const [open, setOpen] = useState(false);
  const single = forFiling(medicare.tiers, "single", "medicare IRMAA tiers");
  const joint = forFiling(medicare.tiers, "mfj", "medicare IRMAA tiers");
  const standard = medicare.standardMonthlyPremium;
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="self-start rounded px-1 text-[14px] font-semibold text-accent underline-offset-4 transition hover:underline"
      >
        {open ? `Hide the ${medicare.year} IRMAA tables` : `Show the full ${medicare.year} IRMAA tables`}
      </button>
      {open ? (
        <>
          <DualScroll>
            <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <th className={`${HEAD} text-left`}>Tier</th>
                  <th className={HEAD}>Single or head of household MAGI</th>
                  <th className={HEAD}>Married filing jointly MAGI</th>
                  <th className={HEAD}>Monthly premium per person</th>
                  <th className={HEAD}>IRMAA per person, monthly</th>
                  <th className={HEAD}>IRMAA per person, yearly</th>
                </tr>
              </thead>
              <tbody>
                {single.map((tier, i) => (
                  <tr key={i}>
                    <td className={`${CELL} text-left font-semibold`}>{tierLabel(i)}</td>
                    <td className={CELL}>{tierRange(single, i)}</td>
                    <td className={CELL}>{joint[i] ? tierRange(joint, i) : "-"}</td>
                    <td className={CELL}>{formatCurrency(tier.monthlyPremium, true)}</td>
                    <td className={CELL}>{formatCurrency(tier.monthlyPremium - standard, true)}</td>
                    <td className={CELL}>{formatCurrency((tier.monthlyPremium - standard) * 12, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DualScroll>
          <p className="m-0 text-[12px] text-muted">
            Part B premiums for {medicare.year}, set by MAGI from two years before (
            {medicare.year - 2} for {medicare.year}). A couple on Medicare each pays the
            premium. The standard premium is {formatCurrency(standard, true)} a month.
          </p>
        </>
      ) : null}
    </div>
  );
}

function SummaryTable({ summaries }: { summaries: Record<ScenarioKey, MedicareSummary> }) {
  const { baseline, roth } = summaries;
  const diff = (a: number, b: number) => {
    const d = b - a;
    if (Math.abs(d) < 0.5) return <span>$0</span>;
    return (
      <span className={d < 0 ? "text-[#1C8A5B]" : "text-danger"}>
        {d > 0 ? "+" : "-"}
        {formatCurrency(Math.abs(d))}
      </span>
    );
  };
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <h3 className="m-0 text-[14.5px] font-bold text-foreground">Lifetime Medicare</h3>
      <DualScroll>
        <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={`${HEAD} text-left`}>Scenario</th>
              <th className={HEAD}>Part B premiums</th>
              <th className={HEAD}>IRMAA part</th>
              <th className={HEAD}>Years with IRMAA</th>
            </tr>
          </thead>
          <tbody>
            {(["baseline", "roth"] as const).map((key) => (
              <tr key={key}>
                <td className={`${CELL} text-left font-semibold`}>{SCENARIO_LABELS[key]}</td>
                <td className={CELL}>{formatCurrency(summaries[key].totalPremiums)}</td>
                <td className={CELL}>{formatCurrency(summaries[key].totalIrmaa)}</td>
                <td className={CELL}>{summaries[key].irmaaYears}</td>
              </tr>
            ))}
            <tr>
              <td className={`${CELL} text-left font-semibold`}>Conversion impact</td>
              <td className={`${CELL} font-semibold`}>
                {diff(baseline.totalPremiums, roth.totalPremiums)}
              </td>
              <td className={`${CELL} font-semibold`}>
                {diff(baseline.totalIrmaa, roth.totalIrmaa)}
              </td>
              <td className={`${CELL} font-semibold`}>
                {roth.irmaaYears - baseline.irmaaYears > 0 ? "+" : ""}
                {roth.irmaaYears - baseline.irmaaYears}
              </td>
            </tr>
          </tbody>
        </table>
      </DualScroll>
    </div>
  );
}

function YearTable({
  household,
  summary,
  scenario,
  onScenario,
}: {
  household: Household;
  summary: MedicareSummary;
  scenario: ScenarioKey;
  onScenario: (key: ScenarioKey) => void;
}) {
  const people = household.people;
  const name = (id: string) => people.find((p) => p.id === id)?.name?.trim() || "Person";
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-[14.5px] font-bold text-foreground">Medicare by year</h3>
        <span className="w-[180px]">
          <Select
            value={scenario}
            onChange={onScenario}
            options={(["baseline", "roth"] as const).map((key) => ({
              value: key,
              label: SCENARIO_LABELS[key],
            }))}
          />
        </span>
      </div>
      <DualScroll>
        <table className="w-full min-w-[1040px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={`${HEAD} text-left`}>Year</th>
              <th className={`${HEAD} text-left`}>Ages</th>
              <th className={HEAD}>MAGI</th>
              <th className={HEAD}>Room to next tier</th>
              <th className={HEAD}>Next tier costs</th>
              <th className={HEAD}>Premium based on</th>
              <th className={`${HEAD} text-left`}>Tier</th>
              <th className={PREMIUM_HEAD}>Monthly premium per person</th>
              <th className={HEAD}>On Medicare</th>
              <th className={HEAD}>Yearly premiums</th>
              <th className={HEAD}>IRMAA part</th>
            </tr>
          </thead>
          <tbody>
            {summary.years.map((y) => {
              const close = y.roomToNextTier != null && y.roomToNextTier < CLOSE_TO_NEXT_TIER;
              const paying = y.enrolled > 0;
              return (
                <tr key={y.calendarYear} className={paying && y.tier > 0 ? "bg-[#FFF7E6]" : undefined}>
                  <td className={`${CELL} text-left font-semibold`}>{y.calendarYear}</td>
                  <td className={`${CELL} text-left`}>
                    {people
                      .filter((p) => y.ages[p.id] != null)
                      .map((p) => `${name(p.id)} ${y.ages[p.id]}`)
                      .join(", ")}
                  </td>
                  <td className={CELL}>{formatCurrency(y.magi)}</td>
                  <td className={`${CELL} ${close ? "font-semibold text-danger" : ""}`}>
                    {y.roomToNextTier == null ? "-" : formatCurrency(y.roomToNextTier)}
                  </td>
                  <td className={CELL}>
                    {y.nextTierCost == null ? "-" : `${formatCurrency(y.nextTierCost)}/yr`}
                  </td>
                  <td className={CELL}>
                    {paying ? `${y.lookbackYear}: ${formatCurrency(y.lookbackMagi)}` : "-"}
                  </td>
                  <td className={`${CELL} text-left`}>{paying ? tierLabel(y.tier) : "-"}</td>
                  <td className={`${CELL} ${PREMIUM_CELL}`}>
                    {paying ? formatCurrency(y.monthlyPremium, true) : "-"}
                  </td>
                  <td className={CELL}>{y.enrolled}</td>
                  <td className={CELL}>{paying ? formatCurrency(y.annualPremium) : "-"}</td>
                  <td className={CELL}>{paying ? formatCurrency(y.irmaaSurcharge) : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DualScroll>
      <p className="m-0 text-[12px] text-muted">
        Room to next tier is how much more income the year can have before the premium two years
        later moves up a tier; Next tier costs is what that step adds that year. Under{" "}
        {formatCurrency(CLOSE_TO_NEXT_TIER)} of room is in red. The monthly premium for each year is highlighted in blue; years paying IRMAA are shaded.
      </p>
    </div>
  );
}
