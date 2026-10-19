"use client";

import { useState } from "react";
import type { Household, ReturnMode } from "@/lib/domain/types";
import {
  SP500_FIRST_YEAR,
  SP500_LAST_YEAR,
  SP500_SOURCE,
  sp500Years,
} from "@/lib/config/marketHistory";
import { historyStartYear, historyYearFor, usesMarketHistory } from "@/lib/engine/marketHistory";
import { projectionStartYear, projectionYears } from "@/lib/engine/project";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { YearSelect } from "@/components/ui/inputs";
import { formatPercent } from "@/lib/format";
import { useHousehold, useScenario } from "@/store/useScenario";

const MODES: { value: ReturnMode; label: string }[] = [
  { value: "fixed", label: "Fixed return" },
  { value: "history", label: "Market history" },
];

/** Plan calendar years that use each S&P 500 year (more than one after a wrap). */
function planYearsBySpYear(household: Household): Map<number, number[]> {
  const start = projectionStartYear(household);
  const n = projectionYears(household);
  const map = new Map<number, number[]>();
  if (!Number.isFinite(start)) return map;
  for (let i = 0; i < n; i++) {
    const sp = historyYearFor(household, i);
    map.set(sp, [...(map.get(sp) ?? []), start + i]);
  }
  return map;
}

function ReturnsTable({ household }: { household: Household }) {
  const used = usesMarketHistory(household) ? planYearsBySpYear(household) : new Map();
  return (
    <div>
      <p className="m-0 mb-3 text-[12.5px] leading-relaxed text-muted-2">
        Total return of the S&amp;P 500 each calendar year, dividends included, from{" "}
        {SP500_FIRST_YEAR} to {SP500_LAST_YEAR}.
        {used.size > 0
          ? " Highlighted years are the ones this plan uses, with the plan year that uses each. Past the last year the sequence starts over at the first."
          : " Turn on Market history to see which years the plan uses."}
      </p>
      <table className="w-full border-collapse text-[12.5px] tabular-nums">
        <thead>
          <tr className="text-left text-muted-2">
            <th className="border-b border-border py-1.5 pr-3 font-semibold">Year</th>
            <th className="border-b border-border py-1.5 pr-3 text-right font-semibold">S&amp;P 500 return</th>
            <th className="border-b border-border py-1.5 font-semibold">Used in plan year</th>
          </tr>
        </thead>
        <tbody>
          {sp500Years().map(({ year, total }) => {
            const planYears = used.get(year);
            return (
              <tr
                key={year}
                className={planYears ? "bg-[color-mix(in_srgb,var(--accent)_8%,#fff)] font-semibold" : ""}
              >
                <td className="border-b border-border/60 py-1 pr-3">{year}</td>
                <td className={`border-b border-border/60 py-1 pr-3 text-right ${total < 0 ? "text-danger" : ""}`}>
                  {formatPercent(total)}
                </td>
                <td className="border-b border-border/60 py-1 text-muted-2">{planYears?.join(", ") ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="m-0 mt-3 text-xs text-muted">
        Source:{" "}
        <a href={SP500_SOURCE.url} target="_blank" rel="noopener noreferrer" className="text-accent underline">
          {SP500_SOURCE.name}
        </a>{" "}
        (updated {SP500_SOURCE.updated}).
      </p>
    </div>
  );
}

/** "See S&P 500 returns": opens the year-by-year table. */
export function Sp500ReturnsLink() {
  const household = useHousehold();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start border-0 bg-transparent p-0 text-left text-[11.5px] font-semibold text-accent underline"
      >
        See S&amp;P 500 returns
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="S&P 500 returns by year" size="md">
        <ReturnsTable household={household} />
      </Modal>
    </>
  );
}

/**
 * Fixed return / Market history for the plan's market accounts, the year the
 * history starts, and the link to the returns.
 */
export function MarketHistoryFields() {
  const household = useHousehold();
  const { setAssumptions } = useScenario();
  const history = usesMarketHistory(household);
  const start = projectionStartYear(household);
  return (
    <>
      <Field
        label="Returns"
        help="Fixed return grows each account by its own growth rate every year. Market history grows your IRAs, Roth and brokerage accounts by the S&P 500's actual return each year (dividends included), in order from the year you pick, so a bad stretch hits early withdrawals the way it really would. Savings, CDs, annuities, real estate and businesses keep their own rates."
      >
        <div
          role="radiogroup"
          aria-label="Returns"
          className="flex rounded-[9px] border border-border-2 bg-surface-muted p-0.5"
        >
          {MODES.map((mode) => {
            const on = (history ? "history" : "fixed") === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() =>
                  setAssumptions({ returnMode: mode.value === "history" ? "history" : undefined })
                }
                className={`flex-1 whitespace-nowrap rounded-[7px] px-2 py-1 text-base transition md:text-sm ${
                  on ? "bg-white font-semibold text-foreground shadow-sm" : "text-muted hover:text-foreground"
                }`}
              >
                {mode.label}
              </button>
            );
          })}
        </div>
        <Sp500ReturnsLink />
      </Field>
      {history ? (
        <Field
          label="Market history starts"
          help={`The S&P 500 year the plan's first year (${Number.isFinite(start) ? start : "year 1"}) uses; each later plan year uses the next one. Past ${SP500_LAST_YEAR} the sequence starts over at ${SP500_FIRST_YEAR}.`}
        >
          <YearSelect
            value={historyStartYear(household)}
            from={SP500_FIRST_YEAR}
            to={SP500_LAST_YEAR}
            onChange={(year) => setAssumptions({ historyStartYear: year ?? undefined })}
          />
        </Field>
      ) : null}
    </>
  );
}
