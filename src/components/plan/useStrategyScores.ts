"use client";

import { useMemo } from "react";
import { isHouseholdReady } from "@/lib/domain/household";
import { isConversionEmpty } from "@/lib/engine/conversionEmpty";
import { scoreConversionStrategies } from "@/lib/optimizer/score";
import { useHousehold } from "@/store/useScenario";
import { useExternalData } from "@/store/useExternalData";

/** Total impact of each conversion strategy for the active household. */
export function useStrategyScores() {
  const household = useHousehold();
  const refs = useExternalData((s) => s.refs);
  const refsReady = useExternalData((s) => s.status) === "ready";
  const ready = isHouseholdReady(household);
  const empty = isConversionEmpty(household);

  return useMemo(() => {
    if (!ready || !refsReady || empty) return [];
    return scoreConversionStrategies(household, refs);
  }, [household, refs, ready, refsReady, empty]);
}
