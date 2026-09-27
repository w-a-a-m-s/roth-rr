import type { ReactNode } from "react";
import { InfoTooltip } from "@/components/ui/InfoTooltip";

interface FieldProps {
  label: string;
  hint?: string;
  /** Optional detailed explanation shown via a "?" tooltip next to the label. */
  help?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
  /** stack: label above input (default). row: label and input on one line. */
  layout?: "stack" | "row";
}

export function Field({
  label,
  hint,
  help,
  htmlFor,
  children,
  className,
  layout = "stack",
}: FieldProps) {
  const labelEl = (
    <span className="flex items-center gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-2">
        {label}
      </label>
      {help ? <InfoTooltip text={help} label={`About ${label}`} /> : null}
    </span>
  );

  if (layout === "row") {
    return (
      <div
        className={`flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-3 ${className ?? ""}`}
      >
        <div className="lg:w-[13.5rem] lg:shrink-0">{labelEl}</div>
        <div className="min-w-0 flex-1">
          {children}
          {hint ? (
            <p className="mt-1 text-[11px] leading-tight text-muted">{hint}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      {labelEl}
      {children}
      {hint ? <p className="text-[11px] leading-tight text-muted">{hint}</p> : null}
    </div>
  );
}
