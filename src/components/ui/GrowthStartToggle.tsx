"use client";

import type { GrowthStart } from "@/lib/domain/types";
import { GROWTH_START_LABELS, GROWTH_STARTS } from "@/lib/domain/household";

/** Plan start / Retirement segmented control, shared by accounts and real estate. */
export function GrowthStartToggle({
  value,
  onChange,
}: {
  value: GrowthStart;
  onChange: (value: GrowthStart) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Growth starts"
      className="flex rounded-[9px] border border-border-2 bg-surface-muted p-0.5"
    >
      {GROWTH_STARTS.map((option) => {
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
            {GROWTH_START_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
