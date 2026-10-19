"use client";

/**
 * Today / <start> segmented control for when an income's or expense's yearly
 * growth starts compounding.
 */
export function GrowthFromToggle({
  fromToday,
  startLabel,
  onChange,
}: {
  fromToday: boolean;
  /** The other option's label: "Income start" or "Expense start". */
  startLabel: string;
  onChange: (fromToday: boolean) => void;
}) {
  const options = [
    { today: true, label: "Today" },
    { today: false, label: startLabel },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Growth starts"
      className="flex rounded-[9px] border border-border-2 bg-surface-muted p-0.5"
    >
      {options.map((option) => {
        const on = option.today === fromToday;
        return (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.today)}
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
