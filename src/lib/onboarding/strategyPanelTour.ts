import type { TourStepContent } from "@/lib/onboarding/tourTypes";

/** Copy for the post-create conversion strategy panel walkthrough. */
export const STRATEGY_PANEL_TOUR_STEPS: TourStepContent[] = [
  {
    id: "strategy-panel",
    title: "Conversion strategy",
    body: "You can switch strategies here anytime. The number on each row is the total impact versus doing nothing, so you can compare before you pick.",
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
