"use client";

import { PlanDetails } from "@/components/plan/PlanDetails";
import { PlanPicker } from "@/components/plan/PlanPicker";
import { StrategyPanel } from "@/components/plan/StrategyPanel";
import { Modal } from "@/components/ui/Modal";
import { useScenario } from "@/store/useScenario";
import { useUI } from "@/store/useUI";

export function PlanDetailsAccordion() {
  const open = useUI((s) => s.planDetailsOpen);
  const closePlanDetails = useUI((s) => s.closePlanDetails);
  const status = useScenario((s) => s.auth.status);
  const revisionPreview = useScenario((s) => s.revisionPreview);
  const openNewPlan = useUI((s) => s.openNewPlan);
  const showPlanSwitcher = status === "authenticated" && !revisionPreview;

  return (
    <>
      <Modal
        open={open}
        onClose={closePlanDetails}
        title="Plan details"
        size="md"
        fullHeight
      >
        <div className="flex flex-col gap-4">
          {showPlanSwitcher ? (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <PlanPicker
                  align="left"
                  buttonClassName="flex h-10 w-full items-center justify-between gap-2 rounded-[9px] border border-border bg-white px-3"
                  menuClassName="absolute left-0 top-[46px] z-40 flex max-h-[min(420px,calc(100vh-8rem))] w-full max-w-[320px] flex-col overflow-hidden rounded-[14px] border border-border bg-white p-2.5 shadow-[0_16px_36px_rgba(30,26,20,0.16)]"
                />
              </div>
              <button
                type="button"
                onClick={openNewPlan}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-[9px] border border-[color-mix(in_srgb,var(--accent)_30%,#fff)] bg-[color-mix(in_srgb,var(--accent)_7%,#fff)] px-3 text-[12.5px] font-bold text-[color-mix(in_srgb,var(--accent)_60%,#000)]"
              >
                <span className="-mt-px text-[15px] leading-none">+</span> New plan
              </button>
            </div>
          ) : null}

          <StrategyPanel variant="inline" />
          <PlanDetails />
        </div>
      </Modal>
    </>
  );
}
