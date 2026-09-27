"use client";

import { isDefaultPlanId } from "@/lib/config/defaultPlans";
import {
  canDeletePlan,
  canDuplicatePlan,
  canEditPlan,
  canSharePlan,
  canViewHistory,
  type PlanRole,
} from "@/lib/sharing";
import { useActiveConfig, useScenario } from "@/store/useScenario";

export function planRole(active: {
  id: string;
  role?: PlanRole;
}): PlanRole | undefined {
  if (isDefaultPlanId(active.id)) return undefined;
  if (active.id.startsWith("local-")) return "admin";
  return active.role;
}

/** Shared permission snapshot for plan chrome (sidebar, mobile bar, strategy). */
export function usePlanAccess() {
  const active = useActiveConfig();
  const revisionPreview = useScenario((s) => s.revisionPreview);
  const sampleReadOnly = isDefaultPlanId(active.id);
  const localOnly = active.id.startsWith("local-");
  const role = planRole(active);
  const readOnly = sampleReadOnly || (!localOnly && !canEditPlan(role));

  return {
    active,
    revisionPreview,
    sampleReadOnly,
    localOnly,
    role,
    readOnly,
    canShare: !sampleReadOnly && !localOnly && canSharePlan(role),
    canHistory: !sampleReadOnly && !localOnly && canViewHistory(role),
    canDuplicate: sampleReadOnly || localOnly || canDuplicatePlan(role),
    canDelete: !sampleReadOnly && (localOnly || canDeletePlan(role)),
  };
}
