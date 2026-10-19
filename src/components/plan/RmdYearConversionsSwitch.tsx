"use client";

import { allowsRmdYearConversions, allowsWorkingYearConversions } from "@/lib/domain/rmd";
import { asOfYear } from "@/lib/domain/household";
import { projectionStartYear } from "@/lib/engine/project";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { useHousehold, useScenario } from "@/store/useScenario";
import { useExternalData } from "@/store/useExternalData";

/** A labeled on/off switch for the conversion strategy header. */
function ConversionSwitch({
  label,
  help,
  on,
  onToggle,
  readOnly,
}: {
  label: string;
  help: string;
  on: boolean;
  onToggle: () => void;
  readOnly: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <InfoTooltip text={help} label={`About ${label.toLowerCase()}`} />
      <span className="text-[11.5px] font-semibold text-muted-2">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={readOnly}
        onClick={() => {
          if (!readOnly) onToggle();
        }}
        className={`relative h-[22px] w-[40px] shrink-0 rounded-full border-0 transition-colors ${
          on ? "bg-accent" : "bg-border-2"
        } ${readOnly ? "cursor-default" : "cursor-pointer"}`}
      >
        <span
          className={`absolute top-[3px] left-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            on ? "translate-x-[18px]" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

/**
 * "Convert in RMD years": lets conversions run in years an owner is at or past
 * their RMD age. That year's RMD always comes out in full first; only the
 * rest of the account can be converted.
 */
export function RmdYearConversionsSwitch({ readOnly = false }: { readOnly?: boolean }) {
  const household = useHousehold();
  const { setOptimizer } = useScenario();
  const on = allowsRmdYearConversions(household);
  return (
    <ConversionSwitch
      label="Convert in RMD years"
      help="When on, every strategy and the manual schedule can convert in years you're at or past your RMD age too, as the law allows. That year's RMD always comes out in full first, so it's never converted or reduced; only what's left can be converted."
      on={on}
      onToggle={() => setOptimizer({ allowConversionsInRmdYears: on ? undefined : true })}
      readOnly={readOnly}
    />
  );
}

/**
 * "Convert in working years": strategies fill from the projection's first
 * year instead of the first retirement year. Turning it on starts the
 * projection this year when it starts later, so the working years (and their
 * salary and business income) are in the plan.
 */
export function WorkingYearConversionsSwitch({ readOnly = false }: { readOnly?: boolean }) {
  const household = useHousehold();
  const { setOptimizer, setProjectionStart } = useScenario();
  const asOfDate = useExternalData((s) => s.refs.asOfDate);
  const on = allowsWorkingYearConversions(household);
  const thisYear = asOfYear(asOfDate) ?? new Date().getFullYear();
  return (
    <ConversionSwitch
      label="Convert in working years"
      help="When on, every strategy can convert in the years before you retire too, using your salary and business income to size each year. Turning it on starts the projection this year (Projection starts on the Household step), so those years show in every table; turning it off leaves the start where it is."
      on={on}
      onToggle={() => {
        if (on) {
          setOptimizer({ allowConversionsInWorkingYears: undefined });
          return;
        }
        setOptimizer({ allowConversionsInWorkingYears: true });
        if (projectionStartYear(household) > thisYear) setProjectionStart(thisYear);
      }}
      readOnly={readOnly}
    />
  );
}
