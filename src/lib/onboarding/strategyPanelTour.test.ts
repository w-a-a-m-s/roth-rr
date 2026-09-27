import { describe, expect, it } from "vitest";
import { shouldShowStrategyPanelTour } from "@/lib/onboarding/strategyPanelTour";

const ready = {
  planModalOpen: false,
  nameModalOpen: false,
  authModalOpen: false,
  isSamplePlan: false,
  isUntouched: false,
  isConversionEmpty: false,
  hasSeenHouseholdTour: true,
};

describe("shouldShowStrategyPanelTour", () => {
  it("shows after a finished plan with no blocking modal", () => {
    expect(shouldShowStrategyPanelTour(ready)).toBe(true);
  });

  it("waits until the first-plan wizard and auth prompts are closed", () => {
    expect(
      shouldShowStrategyPanelTour({ ...ready, planModalOpen: true }),
    ).toBe(false);
    expect(
      shouldShowStrategyPanelTour({ ...ready, nameModalOpen: true }),
    ).toBe(false);
    expect(
      shouldShowStrategyPanelTour({ ...ready, authModalOpen: true }),
    ).toBe(false);
  });

  it("skips samples, untouched blanks, empty conversion, and users who never started first-plan", () => {
    expect(
      shouldShowStrategyPanelTour({ ...ready, isSamplePlan: true }),
    ).toBe(false);
    expect(
      shouldShowStrategyPanelTour({ ...ready, isUntouched: true }),
    ).toBe(false);
    expect(
      shouldShowStrategyPanelTour({ ...ready, isConversionEmpty: true }),
    ).toBe(false);
    expect(
      shouldShowStrategyPanelTour({ ...ready, hasSeenHouseholdTour: false }),
    ).toBe(false);
  });
});
