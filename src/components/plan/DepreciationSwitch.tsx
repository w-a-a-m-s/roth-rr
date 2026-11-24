"use client";

import { ShowHideToggle } from "@/components/ui/ShowHideToggle";
import { useHousehold, useScenario } from "@/store/useScenario";

/**
 * Plan-wide Show / Hide for one-time depreciation, so it can be turned off
 * and on in the results (say, during a presentation). Each entry keeps its
 * own Show / Hide underneath.
 */
export function DepreciationSwitch({ size = "md" }: { size?: "sm" | "md" }) {
  const household = useHousehold();
  const setAssumptions = useScenario((s) => s.setAssumptions);
  const hidden = household.assumptions.hideOneTimeDepreciation === true;
  return (
    <ShowHideToggle
      label="Depreciation in the results"
      size={size}
      hidden={hidden}
      onChange={(next) =>
        setAssumptions({ hideOneTimeDepreciation: next ? true : undefined })
      }
    />
  );
}
