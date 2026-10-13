"use client";

import type { SnapshotFrom } from "@/components/results/snapshotTable";

/** From today / From <milestone>: the first year the results show. */
export function DisplayFromToggle({
  value,
  onChange,
  milestoneLabel,
}: {
  value: SnapshotFrom;
  onChange: (value: SnapshotFrom) => void;
  /** e.g. "From retirement year", "From death", "From long-term care". */
  milestoneLabel: string;
}) {
  const options: { key: SnapshotFrom; label: string }[] = [
    { key: "today", label: "From today" },
    { key: "milestone", label: milestoneLabel },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Display from"
      className="flex rounded-[9px] border border-border-2 bg-surface-muted p-0.5 text-[12.5px]"
    >
      {options.map(({ key, label }) => {
        const on = key === value;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(key)}
            className={`whitespace-nowrap rounded-[7px] px-2.5 py-1 font-semibold transition ${
              on
                ? "bg-white text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
