"use client";

import { useRef } from "react";
import { ConversionStrategyMenu } from "@/components/plan/ConversionStrategyMenu";
import { usePlanAccess } from "@/components/plan/usePlanAccess";
import { StepTour } from "@/components/onboarding/StepTour";
import { isDefaultPlanId } from "@/lib/config/defaultPlans";
import { isUntouchedHousehold } from "@/lib/domain/household";
import { isConversionEmpty } from "@/lib/engine/conversionEmpty";
import { hasSeenStepTour } from "@/lib/onboarding/stepTourStorage";
import {
  STRATEGY_PANEL_TOUR_STEPS,
  shouldShowStrategyPanelTour,
} from "@/lib/onboarding/strategyPanelTour";
import { useHousehold } from "@/store/useScenario";
import { useUI } from "@/store/useUI";

export function StrategyPanel({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "card" | "inline";
}) {
  const household = useHousehold();
  const { active, readOnly } = usePlanAccess();
  const strategyPanelRef = useRef<HTMLDivElement>(null);
  const planOpen = useUI((s) => s.planModal.open);
  const nameOpen = useUI((s) => s.nameModal.open);
  const authOpen = useUI((s) => s.authModalKind != null);
  const showStrategyTour =
    variant === "sidebar" &&
    shouldShowStrategyPanelTour({
      planModalOpen: planOpen,
      nameModalOpen: nameOpen,
      authModalOpen: authOpen,
      isSamplePlan: isDefaultPlanId(active.id),
      isUntouched: isUntouchedHousehold(household),
      isConversionEmpty: isConversionEmpty(household),
      hasSeenHouseholdTour: hasSeenStepTour("household"),
    });

  const menu = (
    <div ref={strategyPanelRef}>
      <ConversionStrategyMenu
        readOnly={readOnly}
        className={variant === "sidebar" ? undefined : "mb-0"}
      />
    </div>
  );

  return (
    <>
      {variant === "card" ? (
        <div className="rounded-[14px] border border-border bg-white p-4">
          {menu}
        </div>
      ) : (
        menu
      )}
      {showStrategyTour ? (
        <StepTour
          tourId="strategyPanel"
          steps={STRATEGY_PANEL_TOUR_STEPS}
          targets={{ "strategy-panel": strategyPanelRef }}
        />
      ) : null}
    </>
  );
}
