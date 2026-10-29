"use client";

import { useState } from "react";
import type { Household, ReturnMode, ReturnSource } from "@/lib/domain/types";
import {
  SP500_FIRST_YEAR,
  SP500_LAST_YEAR,
  SP500_SOURCE,
  sp500Years,
} from "@/lib/config/marketHistory";
import {
  RETURN_GROUPS,
  RETURN_GROUP_KIND,
  anyHistoryReturns,
  historyStartYear,
  historyYearFor,
  returnModeFor,
  type ReturnGroup,
} from "@/lib/engine/marketHistory";
import { projectionStartYear, projectionYears } from "@/lib/engine/project";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { YearSelect } from "@/components/ui/inputs";
import { formatPercent } from "@/lib/format";
import { useHousehold, useScenario } from "@/store/useScenario";

const MODES: { value: ReturnMode; label: string }[] = [
  { value: "fixed", label: "Fixed return" },
  { value: "history", label: "S&P 500 history" },
  { value: "balanced", label: "50/50 history" },
];

/** What each account's Returns choice reads, for the Accounts step and the plan summary. */
export const RETURN_SOURCE_LABEL: Record<ReturnSource, string> = {
  fixed: "Fixed rate",
  sp500: "S&P 500 history",
  balanced: "50% S&P 500 / 50% 10-year Treasury history",
};

/** Plan calendar years that use each history year (more than one after a wrap). */
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

/** Returns cell, red when negative. */
function ReturnCell({ value }: { value?: number }) {
  return (
    <td className={`border-b border-border/60 py-1 pr-3 text-right ${value != null && value < 0 ? "text-danger" : ""}`}>
      {value == null ? "" : formatPercent(value)}
    </td>
  );
}

/**
 * Year-by-year returns: the S&P 500 alone, or the 50 / 50 mix next to the
 * S&P 500 and the 10-year Treasury it's made of.
 */
function ReturnsTable({ household, mix }: { household: Household; mix: boolean }) {
  const used = anyHistoryReturns(household) ? planYearsBySpYear(household) : new Map();
  const th = "border-b border-border py-1.5 pr-3 text-right font-semibold";
  return (
    <div>
      <p className="m-0 mb-3 text-[12.5px] leading-relaxed text-muted-2">
        {mix
          ? "Total return each calendar year of a portfolio half in the S&P 500 (dividends included) and half in 10-year US Treasury bonds, rebalanced to 50 / 50 every January, "
          : "Total return of the S&P 500 each calendar year, dividends included, "}
        from {SP500_FIRST_YEAR} to {SP500_LAST_YEAR}.
        {used.size > 0
          ? " Highlighted years are the ones this plan uses, with the plan year that uses each. Past the last year the sequence starts over at the first."
          : " Turn on a history return to see which years the plan uses."}
      </p>
      <table className="w-full border-collapse text-[12.5px] tabular-nums">
        <thead>
          <tr className="text-left text-muted-2">
            <th className="border-b border-border py-1.5 pr-3 font-semibold">Year</th>
            {mix ? <th className={th}>50/50 return</th> : null}
            <th className={th}>S&amp;P 500{mix ? "" : " return"}</th>
            {mix ? <th className={th}>10-year Treasury</th> : null}
            <th className="border-b border-border py-1.5 font-semibold">Used in plan year</th>
          </tr>
        </thead>
        <tbody>
          {sp500Years().map(({ year, total, treasury, balanced }) => {
            const planYears = used.get(year);
            return (
              <tr
                key={year}
                className={planYears ? "bg-[color-mix(in_srgb,var(--accent)_8%,#fff)] font-semibold" : ""}
              >
                <td className="border-b border-border/60 py-1 pr-3">{year}</td>
                {mix ? <ReturnCell value={balanced} /> : null}
                <ReturnCell value={total} />
                {mix ? <ReturnCell value={treasury} /> : null}
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

function ReturnsLink({ mix }: { mix: boolean }) {
  const household = useHousehold();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start border-0 bg-transparent p-0 text-left text-[11.5px] font-semibold text-accent underline"
      >
        {mix ? "See 50/50 returns" : "See S&P 500 returns"}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={mix ? "50% S&P 500 / 50% 10-year Treasury returns by year" : "S&P 500 returns by year"}
        size="md"
      >
        <ReturnsTable household={household} mix={mix} />
      </Modal>
    </>
  );
}

/** "See S&P 500 returns": opens the year-by-year table. */
export function Sp500ReturnsLink() {
  return <ReturnsLink mix={false} />;
}

/** "See 50/50 returns": the 50% S&P 500 / 50% 10-year Treasury table. */
export function BalancedReturnsLink() {
  return <ReturnsLink mix />;
}

const GROUP_LABEL: Record<ReturnGroup, string> = {
  retirement: "Retirement accounts",
  roth: "Roth accounts",
  investment: "Investment accounts",
};

/**
 * Fixed return / S&P 500 history / 50/50 history for each group of market
 * accounts (retirement, Roth, investment), the year the history starts, and
 * the links to the returns. Picking one resets that group's accounts to it;
 * an account changed on the Accounts step after keeps its own.
 */
export function MarketHistoryFields() {
  const household = useHousehold();
  const { setAssumptions, setReturnMode } = useScenario();
  const start = projectionStartYear(household);
  return (
    <>
      <Field
        label="Returns"
        className="lg:col-span-2"
        help="Pick how each kind of account grows. Fixed return grows each account by its own growth rate every year. S&P 500 history grows the accounts by the S&P 500's actual return each year (dividends included), in order from the year you pick, so a bad stretch hits early withdrawals the way it really would. 50/50 history does the same with a portfolio half in the S&P 500 and half in 10-year Treasury bonds, rebalanced every January. A choice here applies to every account of that kind, replacing what each account had. Change an account's Returns on the Accounts step afterwards and that account keeps its own. Savings, CDs, annuities, real estate and businesses keep their own rates."
      >
        <div className="flex flex-col gap-1.5">
          {RETURN_GROUPS.map((group) => {
            const mode = returnModeFor(household, group);
            const kind = RETURN_GROUP_KIND[group];
            const ownChoice = household.accounts.filter(
              (acc) => acc.kind === kind && acc.returnSource != null,
            ).length;
            return (
              <div key={group} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                <span className="shrink-0 text-xs text-foreground sm:w-[150px]">
                  {GROUP_LABEL[group]}
                  {ownChoice > 0 ? (
                    <span className="block text-[11px] text-muted">
                      {ownChoice} set on its own
                    </span>
                  ) : null}
                </span>
                <div
                  role="radiogroup"
                  aria-label={`Returns for ${GROUP_LABEL[group].toLowerCase()}`}
                  className="flex flex-1 rounded-[9px] border border-border-2 bg-surface-muted p-0.5"
                >
                  {MODES.map((option) => {
                    const on = mode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setReturnMode(group, option.value)}
                        className={`flex-1 rounded-[7px] px-2 py-1 text-base leading-tight transition md:text-sm ${
                          on ? "bg-white font-semibold text-foreground shadow-sm" : "text-muted hover:text-foreground"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-3">
          <Sp500ReturnsLink />
          <BalancedReturnsLink />
        </div>
      </Field>
      {anyHistoryReturns(household) ? (
        <Field
          label="Market history starts"
          help={`The history year the plan's first year (${Number.isFinite(start) ? start : "year 1"}) uses; each later plan year uses the next one. Past ${SP500_LAST_YEAR} the sequence starts over at ${SP500_FIRST_YEAR}.`}
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
