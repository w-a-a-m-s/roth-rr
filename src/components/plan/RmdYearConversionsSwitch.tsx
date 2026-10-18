"use client";

import { allowsRmdYearConversions } from "@/lib/domain/rmd";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { useHousehold, useScenario } from "@/store/useScenario";

/**
 * "Convert in RMD years": lets conversions run in years an owner is at or past
 * their RMD age. That year's RMD always comes out in full first; only the
 * rest of the account can be converted.
 */
export function RmdYearConversionsSwitch({ readOnly = false }: { readOnly?: boolean }) {
  const household = useHousehold();
  const { setOptimizer } = useScenario();
  const on = allowsRmdYearConversions(household);
  const toggle = () => {
    if (readOnly) return;
    setOptimizer({ allowConversionsInRmdYears: on ? undefined : true });
  };
  return (
    <div className="flex items-center gap-1.5">
      <InfoTooltip
        text="When on, conversions can run in years you're at or past your RMD age too, as the law allows. That year's RMD always comes out in full first, so it's never converted or reduced; only what's left can be converted. Applies to every strategy and to the manual schedule."
        label="About conversions in RMD years"
      />
      <span className="text-[11.5px] font-semibold text-muted-2">Convert in RMD years</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Allow conversions in RMD years"
        disabled={readOnly}
        onClick={toggle}
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
