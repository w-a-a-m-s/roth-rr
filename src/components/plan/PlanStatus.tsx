"use client";

import { relativeTime } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/sharing";
import { usePlanAccess } from "@/components/plan/usePlanAccess";

export function PlanStatus({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "page";
}) {
  const { active, sampleReadOnly, role } = usePlanAccess();
  const savedLabel = relativeTime(active.updatedAt)
    ? `Saved · ${relativeTime(active.updatedAt)}`
    : "Saved";

  if (sampleReadOnly) {
    if (variant === "page") {
      return (
        <div className="rounded-[9px] border border-warning-border bg-warning-bg px-3 py-2.5 text-xs font-semibold text-warning">
          Sample plan · read-only. Use Duplicate to make an editable copy.
        </div>
      );
    }
    return (
      <div className="mb-3 mt-2.5 rounded-[9px] border border-warning-border bg-warning-bg px-[11px] py-[9px] text-[11.5px] font-semibold text-warning">
        Sample plan · read-only. Use Duplicate to make an editable copy.
      </div>
    );
  }

  const saved = (
    <span className="flex items-center gap-1.5 text-[11.5px] font-semibold leading-none text-success">
      <span className="h-1.5 w-1.5 rounded-full bg-success" />
      {savedLabel}
    </span>
  );

  if (variant === "page") return saved;

  return (
    <div className="mb-5 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      {saved}
      {role ? (
        <>
          <span className="text-[11.5px] font-semibold text-muted-3">·</span>
          <span className="text-[11.5px] font-semibold text-muted-2">
            {ROLE_LABELS[role]}
          </span>
        </>
      ) : null}
      {role === "viewer" ? (
        <span className="rounded-md bg-card px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-3">
          View only
        </span>
      ) : null}
    </div>
  );
}
