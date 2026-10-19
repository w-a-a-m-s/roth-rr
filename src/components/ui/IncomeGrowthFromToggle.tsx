"use client";

import type { IncomeGrowthFrom } from "@/lib/domain/types";
import { INCOME_GROWTH_FROM_LABELS } from "@/lib/domain/household";

const OPTIONS: IncomeGrowthFrom[] = ["today", "incomeStart"];

/** Today / Income start segmented control for an income's yearly growth. */
export function IncomeGrowthFromToggle({
  value,
  onChange,
}: {
  value: IncomeGrowthFrom;
  onChange: (value: IncomeGrowthFrom) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Growth starts"
      className="flex rounded-[9px] border border-border-2 bg-surface-muted p-0.5"
    >
      {OPTIONS.map((option) => {
        const on = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option)}
            className={`flex-1 whitespace-nowrap rounded-[7px] px-2 py-1 text-base transition md:text-sm ${
              on
                ? "bg-white font-semibold text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {INCOME_GROWTH_FROM_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
