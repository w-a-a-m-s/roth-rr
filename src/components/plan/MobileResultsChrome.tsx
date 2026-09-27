"use client";

import { PlanDetailsAccordion } from "@/components/plan/PlanDetailsAccordion";
import { PlanStatus } from "@/components/plan/PlanStatus";
import { useActiveConfig } from "@/store/useScenario";
import { useUI } from "@/store/useUI";

function SwitchPlanIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M16 3l4 4-4 4" />
      <path d="M20 7H8" />
      <path d="M8 21l-4-4 4-4" />
      <path d="M4 17h12" />
    </svg>
  );
}

/** Plan name, status, and the Plan details modal. */
export function MobileResultsChrome() {
  const name = useActiveConfig().name;
  const detailsOpen = useUI((s) => s.planDetailsOpen);
  const openPlanDetails = useUI((s) => s.openPlanDetails);

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={openPlanDetails}
          aria-haspopup="dialog"
          aria-expanded={detailsOpen}
          aria-label={`Change plan, ${name}`}
          className="flex min-w-0 max-w-full items-center gap-2 text-left"
        >
          <span className="min-w-0 truncate font-serif text-[21px] font-medium leading-[1.15] tracking-[-0.01em] text-foreground">
            {name}
          </span>
          <span className="flex h-7 shrink-0 items-center justify-center rounded-full border border-border-2 bg-white px-2 text-muted-2">
            <SwitchPlanIcon />
          </span>
        </button>
        <PlanStatus variant="page" />
      </div>
      <PlanDetailsAccordion />
    </div>
  );
}
