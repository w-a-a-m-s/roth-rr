"use client";

const OPTIONS = [
  { hidden: false, label: "Show" },
  { hidden: true, label: "Hide" },
] as const;

/** Show / Hide segmented control: hidden stays saved but isn't counted. */
export function ShowHideToggle({
  hidden,
  onChange,
  label,
  size = "md",
}: {
  hidden: boolean;
  onChange: (hidden: boolean) => void;
  label: string;
  /** `sm` fits the plan summary on the left. */
  size?: "sm" | "md";
}) {
  const text = size === "sm" ? "text-[11.5px] px-2 py-0.5" : "text-base md:text-sm px-2 py-1";
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex rounded-[9px] border border-border-2 bg-surface-muted p-0.5"
    >
      {OPTIONS.map((option) => {
        const on = option.hidden === hidden;
        return (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.hidden)}
            className={`flex-1 whitespace-nowrap rounded-[7px] transition ${text} ${
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
