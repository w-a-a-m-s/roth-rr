"use client";

import { PlanActions } from "@/components/plan/PlanActions";
import { PlanDetails } from "@/components/plan/PlanDetails";
import { PlanStatus } from "@/components/plan/PlanStatus";
import { StrategyPanel } from "@/components/plan/StrategyPanel";
import { useActiveConfig } from "@/store/useScenario";

function PlanHeaderCard() {
  const active = useActiveConfig();

  return (
    <div className="mb-6 rounded-[14px] border border-border bg-card p-4">
      <h1 className="m-0 truncate font-serif text-[21px] font-medium leading-[1.15] tracking-[-0.01em] text-foreground">
        {active.name}
      </h1>
      <PlanStatus />
      <PlanActions variant="sidebar" />
    </div>
  );
}

export function PlanSummary() {
  return (
    <div className="flex flex-col">
      <PlanHeaderCard />
      <StrategyPanel />
      <PlanDetails />
    </div>
  );
}
