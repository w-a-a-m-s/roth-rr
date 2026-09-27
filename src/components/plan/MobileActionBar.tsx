"use client";

import { PlanActions } from "@/components/plan/PlanActions";

export function MobileActionBar() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-[35] border-t border-border bg-white px-4 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(26,25,21,0.08)]">
      <PlanActions variant="bar" />
    </div>
  );
}
