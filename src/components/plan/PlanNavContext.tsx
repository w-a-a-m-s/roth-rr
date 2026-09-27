"use client";

import { createContext, useContext } from "react";

export interface PlanNav {
  /** Switch the open plan modal to the step with the given id. */
  goToStep: (stepId: string) => void;
}

const PlanNavContext = createContext<PlanNav | null>(null);

export const PlanNavProvider = PlanNavContext.Provider;

/** Navigation handle for components rendered inside the plan modal. */
export function usePlanNav(): PlanNav | null {
  return useContext(PlanNavContext);
}
