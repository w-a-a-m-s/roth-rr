"use client";

import { useSession } from "@/lib/auth/client";
import { useEffect, useRef, useState } from "react";
import { PlanHistoryModal } from "@/components/plan/PlanHistoryModal";
import { usePlanAccess } from "@/components/plan/usePlanAccess";
import { ShareDialog } from "@/components/ShareDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { withBasePath } from "@/lib/basePath";
import { downloadPlanJson, isRealSuperAdmin } from "@/lib/planJson";
import { useScenario } from "@/store/useScenario";
import { useUI } from "@/store/useUI";

function ActionsIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M13 3L5 14h7l-1 7 8-11h-7l1-7z" />
    </svg>
  );
}

function PlanIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <path d="M12 8v.1" />
    </svg>
  );
}

function ConfigureIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 8h5" />
      <circle cx="12" cy="8" r="2" />
      <path d="M14 8h6" />
      <path d="M4 16h9" />
      <circle cx="16" cy="16" r="2" />
      <path d="M18 16h2" />
    </svg>
  );
}

function ActionsMenuItems({
  showHistory,
  canShare,
  canDuplicate,
  canDelete,
  canDownloadJson,
  shareCount,
  onHistory,
  onShare,
  onDuplicate,
  onDelete,
  onDownloadJson,
}: {
  showHistory: boolean;
  canShare: boolean;
  canDuplicate: boolean;
  canDelete: boolean;
  canDownloadJson: boolean;
  shareCount: number;
  onHistory: () => void;
  onShare: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDownloadJson: () => void;
}) {
  return (
    <>
      {canDownloadJson ? (
        <button
          type="button"
          onClick={onDownloadJson}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[13px] font-semibold text-foreground"
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 3v12" />
            <path d="M7 11l5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
          Download JSON
        </button>
      ) : null}
      {showHistory ? (
        <button
          type="button"
          onClick={onHistory}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[13px] font-semibold text-foreground"
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
          History
        </button>
      ) : null}
      {canShare ? (
        <button
          type="button"
          onClick={onShare}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[13px] font-semibold text-foreground"
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
          </svg>
          <span className="flex-1">Share</span>
          {shareCount > 1 ? (
            <span className="rounded-md bg-card px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-muted-2">
              {shareCount}
            </span>
          ) : null}
        </button>
      ) : null}
      {canDuplicate ? (
        <button
          type="button"
          onClick={onDuplicate}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[13px] font-semibold text-foreground"
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
          Duplicate
        </button>
      ) : null}
      {canDelete ? (
        <>
          <div className="mx-1.5 my-1 h-px bg-[#F0EDE6]" />
          <button
            type="button"
            onClick={onDelete}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[13px] font-semibold text-danger"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 6h18" />
              <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
            Delete
          </button>
        </>
      ) : null}
    </>
  );
}

/** Configure + Details + Actions. Desktop sidebar omits Details (summary stays inline). */
export function PlanActions({
  variant,
}: {
  variant: "sidebar" | "bar";
}) {
  const {
    active,
    revisionPreview,
    readOnly,
    canShare,
    canHistory,
    canDuplicate,
    canDelete,
  } = usePlanAccess();
  const { data: session } = useSession();
  const canDownloadJson = isRealSuperAdmin(session);
  const deleteConfig = useScenario((s) => s.deleteConfig);
  const exportConfig = useScenario((s) => s.exportConfig);
  const setPlanShareCount = useScenario((s) => s.setPlanShareCount);
  const openEditPlan = useUI((s) => s.openEditPlan);
  const openPlanDetails = useUI((s) => s.openPlanDetails);
  const openDuplicatePlan = useUI((s) => s.openDuplicatePlan);
  const shareCount = active.shareCount ?? 1;

  const [actionsOpen, setActionsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [historyByPlan, setHistoryByPlan] = useState<{
    id: string;
    has: boolean;
  } | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const hasSavedHistory =
    canHistory && historyByPlan?.id === active.id && historyByPlan.has;
  const showHistory = !revisionPreview && hasSavedHistory;
  const showShare = !revisionPreview && canShare;
  const showDuplicate = !revisionPreview && canDuplicate;
  const showDelete = !revisionPreview && canDelete;
  const showActions =
    canDownloadJson || showShare || showHistory || showDuplicate || showDelete;

  useEffect(() => {
    if (!canHistory) return;
    const id = active.id;
    let cancelled = false;
    void fetch(withBasePath(`/api/plans/${encodeURIComponent(id)}/revisions`))
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load history");
        const data = (await res.json()) as { revisions: unknown[] };
        if (!cancelled) setHistoryByPlan({ id, has: data.revisions.length > 0 });
      })
      .catch(() => {
        if (!cancelled) setHistoryByPlan({ id, has: true });
      });
    return () => {
      cancelled = true;
    };
  }, [active.id, active.updatedAt, canHistory]);

  useEffect(() => {
    if (!actionsOpen) return;
    function onPointer(e: MouseEvent) {
      if (!actionsRef.current?.contains(e.target as Node)) {
        setActionsOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActionsOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [actionsOpen]);

  const menuItems = (
    <ActionsMenuItems
      showHistory={showHistory}
      canShare={showShare}
      canDuplicate={showDuplicate}
      canDelete={showDelete}
      canDownloadJson={canDownloadJson}
      shareCount={shareCount}
      onHistory={() => {
        setActionsOpen(false);
        setHistoryOpen(true);
      }}
      onShare={() => {
        setActionsOpen(false);
        setShareOpen(true);
      }}
      onDuplicate={() => {
        setActionsOpen(false);
        openDuplicatePlan(active.id);
      }}
      onDelete={() => {
        setActionsOpen(false);
        setDeleteOpen(true);
      }}
      onDownloadJson={() => {
        setActionsOpen(false);
        downloadPlanJson(exportConfig(), active.name);
      }}
    />
  );

  const dialogs = (
    <>
      {shareOpen ? (
        <ShareDialog
          planId={active.id}
          planName={active.name}
          open
          onClose={() => setShareOpen(false)}
          onShareCountChange={(n) => setPlanShareCount(active.id, n)}
        />
      ) : null}
      <PlanHistoryModal
        open={historyOpen}
        planId={historyOpen ? active.id : null}
        planName={active.name}
        onClose={() => setHistoryOpen(false)}
      />
      <ConfirmDialog
        open={deleteOpen}
        title="Delete plan"
        message={`Delete "${active.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          deleteConfig(active.id);
          setDeleteOpen(false);
        }}
      />
    </>
  );

  if (variant === "bar") {
    return (
      <>
        <div className="flex w-full gap-2">
          {readOnly ? null : (
            <button
              type="button"
              onClick={() => openEditPlan(0)}
              className="flex h-[46px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] border-0 bg-accent px-2 text-sm font-bold text-white hover:bg-accent-hover"
            >
              <ConfigureIcon size={15} />
              Configure
            </button>
          )}
          <button
            type="button"
            onClick={openPlanDetails}
            className="flex h-[46px] shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-border-2 bg-white px-3.5 text-sm font-bold text-muted-2"
          >
            <PlanIcon />
            Details
          </button>
          {showActions ? (
            <div ref={actionsRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setActionsOpen((v) => !v)}
                className="flex h-[46px] items-center justify-center gap-1.5 rounded-[10px] border border-border-2 bg-white px-3.5 text-sm font-bold text-muted-2"
              >
                <ActionsIcon />
                Actions
              </button>
              {actionsOpen ? (
                <div className="absolute bottom-[54px] right-0 z-40 w-[200px] rounded-xl border border-border bg-white p-1.5 shadow-[0_16px_36px_rgba(30,26,20,0.16)]">
                  {menuItems}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {dialogs}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {readOnly ? null : (
          <button
            type="button"
            onClick={() => openEditPlan(0)}
            className="flex h-[34px] items-center gap-1.5 rounded-lg border-0 bg-accent px-[11px] text-xs font-bold text-white hover:bg-accent-hover"
          >
            <ConfigureIcon />
            Configure
          </button>
        )}
        {showActions ? (
          <div ref={actionsRef} className="relative">
            <button
              type="button"
              onClick={() => setActionsOpen((v) => !v)}
              className="flex h-[34px] items-center gap-1.5 rounded-lg border border-border-2 bg-white px-[11px] text-xs font-bold text-muted-2"
            >
              Actions
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {actionsOpen ? (
              <div className="absolute left-0 top-10 z-40 w-[190px] rounded-xl border border-border bg-white p-1.5 shadow-[0_16px_36px_rgba(30,26,20,0.16)]">
                {menuItems}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {dialogs}
    </>
  );
}
