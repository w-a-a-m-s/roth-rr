"use client";

import type { Household } from "@/lib/domain/types";
import { diagnoseConversionEmpty } from "@/lib/engine/conversionEmpty";
import { usePlanNav } from "@/components/plan/PlanNavContext";

/** Empty-state notice when the plan has no conversion window or balance. */
export function ConversionEmptyNotice({ household }: { household: Household }) {
  const nav = usePlanNav();
  const { facts } = diagnoseConversionEmpty(household);

  return (
    <div className="rounded-xl border border-warning-border bg-warning-bg px-4 py-3.5">
      <p className="m-0 text-[13.5px] font-bold text-warning-rmd-text">
        Nothing to convert yet
      </p>
      <p className="m-0 mt-1.5 text-[12.5px] leading-normal text-warning">
        Here you&apos;ll see yearly Roth conversion amounts. Right now the plan
        has no conversions to schedule. Common reasons:
      </p>
      <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
        {facts.map((fact) => (
          <li
            key={`${fact.label}:${fact.detail}`}
            className="rounded-lg border border-warning-border/70 bg-white/60 px-3 py-2"
          >
            <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-warning-rmd-text">
              {fact.label}
            </div>
            <div className="mt-0.5 text-[12.5px] leading-snug text-muted-2">
              {fact.detail}
            </div>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-3 text-[12.5px] leading-normal text-warning">
        Conversions only run from retirement up to (but not including) RMD age,
        and only from taxable retirement balances. Go back and fix Household or
        Accounts, then return here.
      </p>
      {nav ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => nav.goToStep("household")}
            className="h-8 rounded-lg border border-warning-border bg-white px-3 text-[12.5px] font-bold text-warning-rmd-text"
          >
            Back to Household
          </button>
          <button
            type="button"
            onClick={() => nav.goToStep("accounts")}
            className="h-8 rounded-lg border border-warning-border bg-white px-3 text-[12.5px] font-bold text-warning-rmd-text"
          >
            Back to Accounts
          </button>
        </div>
      ) : null}
    </div>
  );
}
