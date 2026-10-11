"use client";

import type { PropertyUse } from "@/lib/domain/types";

const OPTIONS: { value: PropertyUse; label: string }[] = [
  { value: "homestead", label: "Homestead" },
  { value: "investment", label: "Investment property" },
];

/** Homestead / Investment property segmented control for a property. */
export function PropertyUseToggle({
  value,
  onChange,
}: {
  value: PropertyUse;
  onChange: (value: PropertyUse) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Property type"
      className="flex rounded-[9px] border border-border-2 bg-surface-muted p-0.5"
    >
      {OPTIONS.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={`flex-1 whitespace-nowrap rounded-[7px] px-2 py-1 text-base transition md:text-sm ${
              on
                ? "bg-white font-semibold text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
