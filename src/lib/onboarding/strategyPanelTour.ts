import type { TourStepContent } from "@/lib/onboarding/tourTypes";

/** Copy for the post-create conversion strategy panel walkthrough. */
export const STRATEGY_PANEL_TOUR_STEPS: TourStepContent[] = [
  {
    id: "strategy-panel",
    title: "Conversion strategy",
    body: "You can switch strategies here anytime. Each row shows how that strategy changes lifetime taxes and your after-tax assets at your RMD age versus doing nothing, so you can compare before you pick.",
    placement: "right-center",
  },
];

/** Show the left-panel tour only after first-plan, with no blocking modal. */
export function shouldShowStrategyPanelTour(opts: {
  planModalOpen: boolean;
  nameModalOpen: boolean;
  authModalOpen: boolean;
  isSamplePlan: boolean;
  isUntouched: boolean;
  isConversionEmpty: boolean;
  /** Household tour is the first wizard stage; seen means they started first-plan. */
  hasSeenHouseholdTour: boolean;
}): boolean {
  if (opts.planModalOpen) return false;
  if (opts.nameModalOpen) return false;
  if (opts.authModalOpen) return false;
  if (opts.isSamplePlan) return false;
  if (opts.isUntouched) return false;
  if (opts.isConversionEmpty) return false;
  if (!opts.hasSeenHouseholdTour) return false;
  return true;
}
